"""AI module 4 — Player Analyst (§25, §26).

Turns the raw ledger into the numbers the Progress screen draws and the
insights the Guide speaks. All computation is local and deterministic; the
Guide is what optionally puts a model's voice on top of it.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from .. import db
from ..game import xp as xp_mod

DOMAINS = ("physical", "academic", "passion")


def _day_range(days: int) -> list[str]:
    today = datetime.now(timezone.utc).date()
    return [(today - timedelta(days=offset)).strftime("%Y-%m-%d")
            for offset in range(days - 1, -1, -1)]


def xp_over_time(user_id: int, days: int = 30) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = db.query(
        """SELECT day, domain, SUM(amount) AS total FROM xp_events
            WHERE user_id=? AND day >= ? GROUP BY day, domain""",
        (user_id, since),
    )
    buckets: dict[str, dict[str, int]] = {}
    for row in rows:
        entry = buckets.setdefault(row["day"], {d: 0 for d in DOMAINS})
        entry[row["domain"]] = int(row["total"])

    series = []
    cumulative = 0
    for day in _day_range(days):
        entry = buckets.get(day, {d: 0 for d in DOMAINS})
        total = sum(entry.values())
        cumulative += total
        series.append({"day": day, "total": total, "cumulative": cumulative, **entry})
    return series


def domain_balance(profile: dict) -> dict:
    totals = {d: int(profile.get(f"xp_{d}", 0)) for d in DOMAINS}
    grand = sum(totals.values()) or 1
    return {
        "totals": totals,
        "share": {d: round(totals[d] / grand * 100, 1) for d in DOMAINS},
        "attributes": xp_mod.attributes_from_xp(
            totals["physical"], totals["academic"], totals["passion"]),
    }


def consistency(user_id: int, days: int = 28) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = db.query(
        "SELECT DISTINCT day FROM xp_events WHERE user_id=? AND day >= ?", (user_id, since))
    active = {row["day"] for row in rows}
    calendar = [{"day": day, "active": day in active} for day in _day_range(days)]
    weekly = []
    for index in range(0, days, 7):
        chunk = calendar[index:index + 7]
        if not chunk:
            continue
        hits = sum(1 for c in chunk if c["active"])
        weekly.append({
            "weekStart": chunk[0]["day"],
            "activeDays": hits,
            "rate": round(hits / len(chunk) * 100, 1),
        })
    return {
        "calendar": calendar,
        "weekly": weekly,
        "activeDays": len(active),
        "windowDays": days,
        "score": xp_mod.consistency_score(len(active)),
    }


def quest_performance(user_id: int) -> dict:
    rows = db.query(
        """SELECT q.domain AS domain, c.status AS status, COUNT(*) AS n
             FROM quest_completions c JOIN quests q ON q.id=c.quest_id
            WHERE c.user_id=? GROUP BY q.domain, c.status""",
        (user_id,),
    )
    by_domain = {d: {"verified": 0, "needs_info": 0, "rejected": 0} for d in DOMAINS}
    for row in rows:
        by_domain.setdefault(row["domain"], {"verified": 0, "needs_info": 0, "rejected": 0})
        by_domain[row["domain"]][row["status"]] = int(row["n"])

    dropped = db.query(
        """SELECT domain, COUNT(*) AS n FROM quests
            WHERE user_id=? AND status IN ('expired','abandoned') GROUP BY domain""",
        (user_id,),
    )
    for row in dropped:
        by_domain.setdefault(row["domain"], {"verified": 0, "needs_info": 0, "rejected": 0})
        by_domain[row["domain"]]["abandoned"] = int(row["n"])

    summary = {}
    for domain, counts in by_domain.items():
        attempts = sum(counts.values())
        summary[domain] = {
            **counts,
            "attempts": attempts,
            "successRate": round(counts.get("verified", 0) / attempts * 100, 1) if attempts else None,
        }
    return summary


def time_investment(user_id: int, days: int = 30) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    rows = db.query(
        """SELECT q.domain AS domain, q.estimated_time AS est, c.proof AS proof
             FROM quest_completions c JOIN quests q ON q.id=c.quest_id
            WHERE c.user_id=? AND c.status='verified' AND c.submitted_at >= ?""",
        (user_id, since),
    )
    minutes = {d: 0 for d in DOMAINS}
    for row in rows:
        recorded = None
        try:
            payload = json.loads(row["proof"] or "{}")
            recorded = (payload.get("structured") or {}).get("minutes")
            recorded = int(recorded) if recorded is not None else None
        except (ValueError, TypeError):
            recorded = None
        minutes[row["domain"]] = minutes.get(row["domain"], 0) + int(
            recorded if recorded and 0 < recorded <= 600 else (row["est"] or 0))
    total = sum(minutes.values())
    return {
        "minutes": minutes,
        "totalMinutes": total,
        "hours": round(total / 60, 1),
        "share": {d: round(minutes[d] / total * 100, 1) if total else 0.0 for d in DOMAINS},
        "windowDays": days,
    }


def skill_development(user_id: int) -> list[dict]:
    rows = db.query(
        """SELECT s.key AS key, s.name AS name, s.domain AS domain, s.tier AS tier,
                  u.unlocked_at AS unlocked_at
             FROM user_skills u JOIN skills s ON s.key=u.skill_key
            WHERE u.user_id=? ORDER BY u.unlocked_at""",
        (user_id,),
    )
    return [dict(row) for row in rows]


def level_history(user_id: int) -> list[dict]:
    """Reconstruct level-ups from the XP ledger."""
    rows = db.query(
        "SELECT day, amount FROM xp_events WHERE user_id=? ORDER BY id", (user_id,))
    history: list[dict] = []
    running = 0
    level = 1
    for row in rows:
        running += int(row["amount"])
        new_level = xp_mod.level_for_xp(running)
        if new_level > level:
            history.append({"day": row["day"], "level": new_level, "xpTotal": running})
            level = new_level
    return history


def insights(profile: dict, balance: dict, performance: dict, consistency_data: dict,
             days_since_domain: dict) -> list[dict]:
    """The soft balance system (§26): identify the biggest growth opportunity."""
    out: list[dict] = []
    attrs = balance["attributes"]
    ranked = sorted(DOMAINS, key=lambda d: attrs[d])
    weakest, strongest = ranked[0], ranked[-1]

    if attrs[strongest] - attrs[weakest] >= 12:
        out.append({
            "type": "balance",
            "domain": weakest,
            "title": f"{weakest.capitalize()} is your largest growth opportunity",
            "body": (f"Your {strongest} progression is strong at {attrs[strongest]:.0f}. "
                     f"{weakest.capitalize()} sits at {attrs[weakest]:.0f} — that gap is where "
                     f"the fastest character growth is available right now."),
        })

    for domain, days in days_since_domain.items():
        if days is not None and days >= 6:
            out.append({
                "type": "inactivity",
                "domain": domain,
                "title": f"{domain.capitalize()} has been quiet for {days} days",
                "body": f"Nothing logged in {domain} for {days} days. One short quest restarts it.",
            })

    score = consistency_data["score"]
    if score >= 80:
        out.append({
            "type": "consistency",
            "domain": None,
            "title": f"Consistency at {score:.0f}%",
            "body": "You are active on most days. This is the single strongest predictor of "
                    "long-term progression.",
        })
    elif score < 40 and consistency_data["activeDays"] > 0:
        out.append({
            "type": "consistency",
            "domain": None,
            "title": f"Consistency at {score:.0f}%",
            "body": "Progression is built from frequency more than intensity. Two short "
                    "quests a week beats one long session a month.",
        })

    for domain, stats in performance.items():
        rate = stats.get("successRate")
        if rate is not None and stats["attempts"] >= 5:
            if rate >= 90:
                out.append({
                    "type": "difficulty",
                    "domain": domain,
                    "title": f"{domain.capitalize()} quests look too easy",
                    "body": f"A {rate:.0f}% success rate over {stats['attempts']} attempts means "
                            f"you're under-challenged. Difficulty has been raised.",
                })
            elif rate <= 45:
                out.append({
                    "type": "difficulty",
                    "domain": domain,
                    "title": f"{domain.capitalize()} quests are running hard",
                    "body": f"A {rate:.0f}% success rate suggests the objectives are oversized. "
                            f"They'll be broken into smaller steps.",
                })
    return out


def days_since_activity(user_id: int) -> dict[str, int | None]:
    out: dict[str, int | None] = {}
    today = datetime.now(timezone.utc).date()
    for domain in DOMAINS:
        row = db.query_one(
            "SELECT day FROM xp_events WHERE user_id=? AND domain=? ORDER BY id DESC LIMIT 1",
            (user_id, domain),
        )
        if not row:
            out[domain] = None
            continue
        try:
            last = datetime.strptime(row["day"], "%Y-%m-%d").date()
            out[domain] = (today - last).days
        except ValueError:
            out[domain] = None
    return out


def full_report(user_id: int, profile: dict) -> dict:
    balance = domain_balance(profile)
    performance = quest_performance(user_id)
    consistency_data = consistency(user_id)
    inactivity = days_since_activity(user_id)
    return {
        "xpOverTime": xp_over_time(user_id),
        "domainBalance": balance,
        "consistency": consistency_data,
        "questPerformance": performance,
        "timeInvestment": time_investment(user_id),
        "skillDevelopment": skill_development(user_id),
        "levelHistory": level_history(user_id),
        "daysSinceActivity": inactivity,
        "insights": insights(profile, balance, performance, consistency_data, inactivity),
    }
