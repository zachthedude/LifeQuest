"""AI module 3 — Difficulty Engine (§14).

Learns the player's ability from outcomes and moves a per-domain difficulty
offset (-3..+3). The offset feeds back into quest selection: it shifts the
effective level used to pick an archetype tier and nudges star rating.

Target success band is 55-80%. Above it the player is coasting; below it the
quests are set too hard and the engine backs off and splits objectives.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .. import db

WINDOW = 20
TARGET_LOW = 0.55
TARGET_HIGH = 0.80
MIN_SAMPLE = 5
MAX_OFFSET = 3


def domain_outcomes(user_id: int, domain: str, limit: int = WINDOW) -> list[str]:
    """Most recent outcomes for a domain: 'verified' | 'needs_info' | 'rejected' | 'failed'."""
    rows = db.query(
        """SELECT c.status AS status
             FROM quest_completions c JOIN quests q ON q.id=c.quest_id
            WHERE c.user_id=? AND q.domain=?
            ORDER BY c.id DESC LIMIT ?""",
        (user_id, domain, limit),
    )
    outcomes = [row["status"] for row in rows]

    since = (datetime.now(timezone.utc) - timedelta(days=21)).strftime("%Y-%m-%d %H:%M:%S")
    abandoned = db.query(
        """SELECT status FROM quests
            WHERE user_id=? AND domain=? AND status IN ('expired','abandoned')
              AND created_at >= ? ORDER BY id DESC LIMIT ?""",
        (user_id, domain, since, max(0, limit - len(outcomes))),
    )
    outcomes.extend("failed" for _ in abandoned)
    return outcomes[:limit]


def success_rate(outcomes: list[str]) -> float | None:
    if len(outcomes) < MIN_SAMPLE:
        return None
    wins = sum(1 for o in outcomes if o == "verified")
    return round(wins / len(outcomes), 3)


def evaluate_domain(user_id: int, domain: str, current_offset: int) -> dict:
    outcomes = domain_outcomes(user_id, domain)
    rate = success_rate(outcomes)
    offset = int(current_offset)
    action = "hold"
    message = ""

    if rate is None:
        return {
            "domain": domain, "successRate": None, "sample": len(outcomes),
            "offset": offset, "action": "calibrating",
            "message": "Still calibrating — complete a few more quests in this domain.",
            "split": False,
        }

    if rate > TARGET_HIGH and len(outcomes) >= MIN_SAMPLE:
        offset = min(MAX_OFFSET, offset + 1)
        action = "increase" if offset != current_offset else "hold"
        message = (f"Your {domain} success rate is {rate * 100:.0f}%. These quests are too "
                   f"easy for you now — difficulty increased.")
    elif rate < 0.45:
        offset = max(-MAX_OFFSET, offset - 1)
        action = "decrease" if offset != current_offset else "hold"
        message = (f"Your {domain} success rate is {rate * 100:.0f}%. Difficulty reduced, and "
                   f"the next objective will be broken into smaller steps.")
    else:
        message = (f"Your {domain} success rate is {rate * 100:.0f}% — right in the band where "
                   f"progress is fastest. Holding difficulty steady.")

    return {
        "domain": domain,
        "successRate": rate,
        "sample": len(outcomes),
        "offset": offset,
        "previousOffset": int(current_offset),
        "action": action,
        "message": message,
        "split": rate < 0.45,
    }


def evaluate(user_id: int, offsets: dict) -> dict:
    """Evaluate all three domains. Returns {domain: report} plus new offsets."""
    reports = {}
    new_offsets = {}
    for domain in ("physical", "academic", "passion"):
        report = evaluate_domain(user_id, domain, int(offsets.get(domain, 0) or 0))
        reports[domain] = report
        new_offsets[domain] = report["offset"]
    return {"reports": reports, "offsets": new_offsets}


def split_objective(spec: dict) -> list[dict]:
    """Break a quest into three smaller objectives when the player is struggling."""
    minutes = max(10, int(spec.get("estimatedTime", 30)))
    third = max(8, minutes // 3)
    phases = [
        ("Phase 1 — Start", "Get the first third done. Just begin: momentum is the objective."),
        ("Phase 2 — Continue", "Pick it back up and push through the middle section."),
        ("Phase 3 — Finish", "Close it out and record what you completed."),
    ]
    out = []
    for index, (label, blurb) in enumerate(phases, start=1):
        child = dict(spec)
        child.update({
            "title": f"{spec['title']} · {label}",
            "description": f"{blurb}\n\nOriginal objective: {spec['description']}",
            "estimatedTime": third,
            "difficulty": max(1, int(spec.get("difficulty", 2)) - 1),
            "chainStep": index,
        })
        out.append(child)
    return out
