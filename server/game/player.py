"""Player profile service: XP ledger, levels, streaks, attributes, snapshots."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from .. import db
from . import achievements as achievements_mod
from . import avatar as avatar_mod
from . import ranks as ranks_mod
from . import skills as skills_mod
from . import xp as xp_mod

DOMAINS = xp_mod.DOMAINS


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def create_profile(user_id: int) -> None:
    db.execute(
        "INSERT OR IGNORE INTO player_profiles (user_id, created_at) VALUES (?, ?)",
        (user_id, _now()),
    )
    db.execute(
        "INSERT OR IGNORE INTO player_model (user_id, updated_at) VALUES (?, ?)",
        (user_id, _now()),
    )


def get_profile(user_id: int) -> dict:
    row = db.query_one("SELECT * FROM player_profiles WHERE user_id=?", (user_id,))
    if row is None:
        create_profile(user_id)
        row = db.query_one("SELECT * FROM player_profiles WHERE user_id=?", (user_id,))
    return dict(row)


def get_model(user_id: int) -> dict:
    row = db.query_one("SELECT * FROM player_model WHERE user_id=?", (user_id,))
    if row is None:
        create_profile(user_id)
        row = db.query_one("SELECT * FROM player_model WHERE user_id=?", (user_id,))
    data = dict(row)
    for key in ("academic_subjects", "passion_interests", "passion_curious",
                "physical_activities", "existing_skills"):
        try:
            data[key] = json.loads(data.get(key) or "[]")
        except ValueError:
            data[key] = []
    try:
        data["difficulty_offset"] = json.loads(data.get("difficulty_offset") or "{}")
    except ValueError:
        data["difficulty_offset"] = {}
    for domain in DOMAINS:
        data["difficulty_offset"].setdefault(domain, 0)
    data["avatar"] = avatar_mod.load(data.get("avatar"))
    return data


def save_avatar(user_id: int, config: dict) -> dict:
    """Validate an avatar against the catalog and this player's unlocks."""
    profile = get_profile(user_id)
    counts = domain_quest_counts(user_id)
    clean = avatar_mod.sanitise(config, int(profile["level"]), counts)
    db.execute("UPDATE player_model SET avatar=?, updated_at=? WHERE user_id=?",
               (avatar_mod.dumps(clean), _now(), user_id))
    return clean


def avatar_options(user_id: int) -> dict:
    profile = get_profile(user_id)
    counts = domain_quest_counts(user_id)
    level = int(profile["level"])
    return {
        "slots": avatar_mod.options_for(level, counts),
        "summary": avatar_mod.unlock_summary(level, counts),
        "avatar": get_model(user_id)["avatar"],
        "level": level,
        "domainQuests": counts,
    }


def save_model(user_id: int, updates: dict) -> dict:
    allowed_json = ("academic_subjects", "passion_interests", "passion_curious",
                    "physical_activities", "existing_skills")
    allowed_text = ("display_name", "age_band", "activity_level",
                    "short_term_goals", "long_term_goals")
    fields, values = [], []
    for key in allowed_json:
        if key in updates:
            fields.append(f"{key}=?")
            values.append(json.dumps([str(v)[:60] for v in (updates[key] or [])][:12]))
    for key in allowed_text:
        if key in updates:
            fields.append(f"{key}=?")
            values.append(str(updates[key] or "")[:400])
    if "minutes_per_day" in updates:
        try:
            minutes = max(10, min(480, int(updates["minutes_per_day"])))
        except (TypeError, ValueError):
            minutes = 45
        fields.append("minutes_per_day=?")
        values.append(minutes)
    if "difficulty_offset" in updates:
        fields.append("difficulty_offset=?")
        values.append(json.dumps(updates["difficulty_offset"]))
    if fields:
        fields.append("updated_at=?")
        values.append(_now())
        values.append(user_id)
        db.execute(f"UPDATE player_model SET {', '.join(fields)} WHERE user_id=?", values)
    return get_model(user_id)


def domain_quest_counts(user_id: int) -> dict[str, int]:
    rows = db.query(
        """SELECT q.domain AS domain, COUNT(*) AS n
             FROM quest_completions c JOIN quests q ON q.id=c.quest_id
            WHERE c.user_id=? AND c.status='verified'
            GROUP BY q.domain""",
        (user_id,),
    )
    counts = {d: 0 for d in DOMAINS}
    for row in rows:
        counts[row["domain"]] = int(row["n"])
    return counts


def active_days(user_id: int, days: int = 28) -> int:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    row = db.query_one(
        "SELECT COUNT(DISTINCT day) AS n FROM xp_events WHERE user_id=? AND day >= ?",
        (user_id, since),
    )
    return int(row["n"]) if row else 0


def touch_activity(user_id: int) -> dict:
    """Update streak/consistency for today. Missing a day costs the streak but
    never the progression (§20)."""
    profile = get_profile(user_id)
    today = _today()
    last = profile.get("last_active_date")
    streak = int(profile.get("streak_current") or 0)
    best = int(profile.get("streak_best") or 0)

    if last == today:
        pass
    elif last:
        try:
            last_date = datetime.strptime(last, "%Y-%m-%d").date()
            delta = (datetime.strptime(today, "%Y-%m-%d").date() - last_date).days
        except ValueError:
            delta = 99
        if delta == 1:
            streak += 1
        elif delta > 1:
            streak = 1
    else:
        streak = 1

    best = max(best, streak)
    consistency = xp_mod.consistency_score(max(active_days(user_id), 1 if streak else 0))
    db.execute(
        """UPDATE player_profiles
              SET streak_current=?, streak_best=?, last_active_date=?, consistency_score=?
            WHERE user_id=?""",
        (streak, best, today, consistency, user_id),
    )
    return {"streak": streak, "best": best, "consistency": consistency}


def award_xp(user_id: int, domain: str, amount: int, reason: str,
             quest_id: int | None = None) -> dict:
    """Append to the XP ledger and recompute derived state. Returns a delta."""
    if domain not in DOMAINS:
        raise ValueError(f"unknown domain: {domain}")
    amount = max(0, int(amount))
    before = get_profile(user_id)
    before_level = int(before["level"])

    db.execute(
        """INSERT INTO xp_events (user_id, domain, amount, reason, quest_id, created_at, day)
           VALUES (?,?,?,?,?,?,?)""",
        (user_id, domain, amount, reason, quest_id, _now(), _today()),
    )

    column = f"xp_{domain}"
    db.execute(
        f"""UPDATE player_profiles
               SET xp_total = xp_total + ?, {column} = {column} + ?
             WHERE user_id=?""",
        (amount, amount, user_id),
    )

    after = get_profile(user_id)
    new_level = xp_mod.level_for_xp(int(after["xp_total"]))
    if new_level != before_level:
        db.execute("UPDATE player_profiles SET level=? WHERE user_id=?", (new_level, user_id))
        after["level"] = new_level

    return {
        "amount": amount,
        "domain": domain,
        "levelBefore": before_level,
        "levelAfter": new_level,
        "leveledUp": new_level > before_level,
        "xpTotal": int(after["xp_total"]),
    }


def attributes(user_id: int, profile: dict | None = None) -> dict:
    profile = profile or get_profile(user_id)
    return xp_mod.attributes_from_xp(
        int(profile["xp_physical"]), int(profile["xp_academic"]), int(profile["xp_passion"]))


def title_for(level: int) -> str:
    ladder = [
        (100, "Master of Life"), (75, "Elite"), (50, "Expert"), (40, "Veteran"),
        (30, "Practitioner"), (20, "Adept"), (10, "Apprentice"), (5, "Initiate"),
        (1, "Novice"),
    ]
    for threshold, name in ladder:
        if level >= threshold:
            return name
    return "Novice"


def refresh_derived(user_id: int) -> dict:
    """Re-evaluate achievements and skills after any state change."""
    profile = get_profile(user_id)
    attrs = attributes(user_id, profile)
    level = int(profile["level"])
    title = title_for(level)
    if profile.get("title") != title:
        db.execute("UPDATE player_profiles SET title=? WHERE user_id=?", (title, user_id))
        profile["title"] = title
    counts = domain_quest_counts(user_id)
    new_skills = skills_mod.evaluate(user_id, level, counts)
    new_achievements = achievements_mod.evaluate(user_id, profile, attrs)
    return {"skills": new_skills, "achievements": new_achievements,
            "attributes": attrs, "profile": profile}


def snapshot(user_id: int) -> dict:
    """Everything the character screen and dashboard header need."""
    profile = get_profile(user_id)
    attrs = attributes(user_id, profile)
    level = int(profile["level"])
    progress = xp_mod.level_progress(int(profile["xp_total"]))
    counts = domain_quest_counts(user_id)
    skill_keys = skills_mod.user_skill_keys(user_id)
    effects = skills_mod.aggregate_effects(skill_keys)

    totals = db.query_one(
        """SELECT
             (SELECT COUNT(*) FROM quest_completions WHERE user_id=? AND status='verified') AS verified,
             (SELECT COUNT(*) FROM quests WHERE user_id=? AND status='active') AS active,
             (SELECT COUNT(*) FROM quests WHERE user_id=? AND status='available') AS available,
             (SELECT COUNT(*) FROM user_achievements WHERE user_id=?) AS achievements""",
        (user_id, user_id, user_id, user_id),
    )

    return {
        "level": level,
        "title": profile.get("title") or title_for(level),
        "tier": ranks_mod.tier_for_level(level),
        "avatar": avatar_mod.load(
            (db.query_one("SELECT avatar FROM player_model WHERE user_id=?", (user_id,))
             or {"avatar": None})["avatar"]),
        "xp": progress,
        "attributes": attrs,
        "domainXp": {
            "physical": int(profile["xp_physical"]),
            "academic": int(profile["xp_academic"]),
            "passion": int(profile["xp_passion"]),
        },
        "streak": {
            "current": int(profile["streak_current"] or 0),
            "best": int(profile["streak_best"] or 0),
            "consistency": float(profile["consistency_score"] or 0),
            "lastActive": profile.get("last_active_date"),
        },
        "questCounts": {
            "verified": int(totals["verified"]) if totals else 0,
            "active": int(totals["active"]) if totals else 0,
            "available": int(totals["available"]) if totals else 0,
            "byDomain": counts,
        },
        "achievementsUnlocked": int(totals["achievements"]) if totals else 0,
        "achievementsTotal": len(achievements_mod.ALL_ACHIEVEMENTS),
        "skills": sorted(skill_keys),
        "skillEffects": {
            "xpBonus": effects["xp_bonus"],
            "questSlots": effects["quest_slots"],
            "tags": sorted(effects["tags"]),
            "qualityFloor": effects["quality_floor"],
        },
        "milestones": {
            "unlocked": skills_mod.unlocked_milestones(level),
            "next": skills_mod.next_milestone(level),
        },
        "dailyCap": xp_mod.daily_xp_cap(level),
        "capabilities": {
            m["key"]: level >= m["level"] for m in skills_mod.LEVEL_MILESTONES
        },
    }
