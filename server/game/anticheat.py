"""Anti-cheat safeguards (§13).

These run server-side on every submission regardless of which AI provider is
configured, so swapping the LLM out can never weaken them.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

from .. import db
from . import xp as xp_mod

# Rolling window used for repetition analysis.
REPEAT_WINDOW_DAYS = 7
SAME_DAY_LIMIT = 2          # completions of the same template per day
BURST_WINDOW_MINUTES = 10   # submissions inside this window
BURST_LIMIT = 4


def proof_digest(payload: dict) -> str:
    """Stable digest of the *substantive* proof text, for duplicate detection."""
    parts = [
        (payload.get("text") or "").strip().lower(),
        (payload.get("link") or "").strip().lower(),
    ]
    normalised = re.sub(r"\s+", " ", " ".join(parts)).strip()
    if len(normalised) < 12:
        return ""
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def recent_completions(user_id: int, template_key: str, days: int = REPEAT_WINDOW_DAYS) -> int:
    since = (_utcnow() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    row = db.query_one(
        """SELECT COUNT(*) AS n FROM quest_completions c
             JOIN quests q ON q.id = c.quest_id
            WHERE c.user_id=? AND q.template_key=? AND c.status='verified'
              AND c.submitted_at >= ?""",
        (user_id, template_key, since),
    )
    return int(row["n"]) if row else 0


def same_day_completions(user_id: int, template_key: str) -> int:
    today = _utcnow().strftime("%Y-%m-%d")
    row = db.query_one(
        """SELECT COUNT(*) AS n FROM quest_completions c
             JOIN quests q ON q.id = c.quest_id
            WHERE c.user_id=? AND q.template_key=? AND c.status='verified'
              AND substr(c.submitted_at,1,10)=?""",
        (user_id, template_key, today),
    )
    return int(row["n"]) if row else 0


def repetition_multiplier(prior_completions: int) -> float:
    """Diminishing returns on grinding the same archetype (§13)."""
    if prior_completions <= 0:
        return 1.0
    return round(max(0.15, 1.0 / (1.0 + 0.55 * prior_completions)), 3)


def cooldown_remaining_hours(user_id: int, template_key: str, cooldown_hours: int) -> float:
    if cooldown_hours <= 0:
        return 0.0
    row = db.query_one(
        """SELECT c.submitted_at FROM quest_completions c
             JOIN quests q ON q.id = c.quest_id
            WHERE c.user_id=? AND q.template_key=? AND c.status='verified'
            ORDER BY c.submitted_at DESC LIMIT 1""",
        (user_id, template_key),
    )
    if not row or not row["submitted_at"]:
        return 0.0
    try:
        last = datetime.strptime(row["submitted_at"], "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc)
    except ValueError:
        return 0.0
    elapsed = (_utcnow() - last).total_seconds() / 3600.0
    return max(0.0, round(cooldown_hours - elapsed, 2))


def submission_burst(user_id: int) -> int:
    since = (_utcnow() - timedelta(minutes=BURST_WINDOW_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    row = db.query_one(
        "SELECT COUNT(*) AS n FROM quest_completions WHERE user_id=? AND submitted_at >= ?",
        (user_id, since),
    )
    return int(row["n"]) if row else 0


def duplicate_proof(user_id: int, digest: str) -> bool:
    if not digest:
        return False
    row = db.query_one(
        "SELECT 1 FROM quest_completions WHERE user_id=? AND proof_digest=? LIMIT 1",
        (user_id, digest),
    )
    return row is not None


def xp_earned_today(user_id: int) -> int:
    today = _utcnow().strftime("%Y-%m-%d")
    row = db.query_one(
        "SELECT COALESCE(SUM(amount),0) AS total FROM xp_events WHERE user_id=? AND day=?",
        (user_id, today),
    )
    return int(row["total"]) if row else 0


def trailing_daily_average(user_id: int, days: int = 14) -> float:
    since = (_utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    row = db.query_one(
        "SELECT COALESCE(SUM(amount),0) AS total FROM xp_events WHERE user_id=? AND day >= ?",
        (user_id, since),
    )
    total = int(row["total"]) if row else 0
    return round(total / days, 2)


def gate_submission(user_id: int, quest: dict, payload: dict) -> dict:
    """Pre-evaluation gate. Returns {allowed, reason, message, signals}."""
    template_key = quest.get("template_key") or "custom"
    signals: list[str] = []

    if quest.get("status") in ("verified", "expired", "abandoned"):
        return {"allowed": False, "reason": "quest_closed",
                "message": "This quest is already closed.", "signals": signals}

    same_day = same_day_completions(user_id, template_key)
    if template_key != "custom" and same_day >= SAME_DAY_LIMIT:
        return {
            "allowed": False,
            "reason": "repetition",
            "message": ("You've already completed this quest several times today. "
                        "Try a higher-level challenge — repeating it further won't "
                        "move your character."),
            "signals": ["same_day_repetition"],
        }

    if submission_burst(user_id) >= BURST_LIMIT:
        return {
            "allowed": False,
            "reason": "rate",
            "message": ("That's a lot of submissions in a few minutes. Take the time the "
                        "quests actually need — come back in a little while."),
            "signals": ["submission_burst"],
        }

    template = None
    from .catalog import TEMPLATES_BY_KEY
    template = TEMPLATES_BY_KEY.get(template_key)
    if template:
        remaining = cooldown_remaining_hours(user_id, template_key, template["cooldown_hours"])
        if remaining > 0 and quest.get("kind") in ("weekly", "milestone", "epic"):
            return {
                "allowed": False,
                "reason": "cooldown",
                "message": (f"This quest is on cooldown for another {remaining:.0f} hours. "
                            "It's designed to be completed once per cycle."),
                "signals": ["cooldown"],
            }

    digest = proof_digest(payload)
    if duplicate_proof(user_id, digest):
        signals.append("duplicate_proof")

    started_at = quest.get("started_at")
    estimated = int(quest.get("estimated_time") or 0)
    if started_at and estimated:
        try:
            started = datetime.strptime(started_at, "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=timezone.utc)
            elapsed_minutes = (_utcnow() - started).total_seconds() / 60.0
            if elapsed_minutes < estimated * 0.2:
                signals.append("suspiciously_fast")
        except ValueError:
            pass

    claimed = (payload.get("structured") or {}).get("minutes")
    if claimed:
        try:
            if int(claimed) > estimated * 4 and estimated:
                signals.append("implausible_duration")
        except (TypeError, ValueError):
            pass

    return {"allowed": True, "reason": None, "message": "", "signals": signals,
            "digest": digest}


def anomaly_check(user_id: int, award: int) -> list[str]:
    """Progress anomaly detection: a day wildly out of line with recent history."""
    average = trailing_daily_average(user_id, 14)
    today = xp_earned_today(user_id)
    signals = []
    if average > 50 and (today + award) > average * 6:
        signals.append("xp_anomaly")
    return signals


def finalise_award(user_id: int, quest: dict, base_reward: int, quality: float,
                   level: int, skill_bonus: float) -> dict:
    """Apply repetition decay, skill bonuses and the daily cap. Server-authoritative."""
    template_key = quest.get("template_key") or "custom"
    prior = recent_completions(user_id, template_key)
    repetition = repetition_multiplier(prior)
    quality = max(0.0, min(1.15, float(quality)))

    raw = base_reward * quality * repetition * (1.0 + skill_bonus)
    award = max(1, int(round(raw)))

    earned = xp_earned_today(user_id)
    capped_award, was_capped = xp_mod.apply_daily_cap(
        earned, award, level, quest.get("kind", "daily"))

    anomalies = anomaly_check(user_id, capped_award)
    if anomalies:
        capped_award = max(1, int(round(capped_award * 0.5)))

    return {
        "xp": capped_award,
        "base": base_reward,
        "quality": round(quality, 3),
        "repetition": repetition,
        "priorCompletions": prior,
        "skillBonus": round(skill_bonus, 3),
        "capped": was_capped,
        "dailyCap": xp_mod.daily_xp_cap(level),
        "earnedToday": earned,
        "anomalies": anomalies,
    }


def record_json(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)
