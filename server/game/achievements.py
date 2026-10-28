"""Achievements (§19). Definitions plus the evaluator that awards them."""

from __future__ import annotations

from typing import Any, Callable

from .. import db


def _a(key, name, description, requirement, tier="bronze", icon="star",
       numeral="") -> dict:
    """One achievement.

    `icon` is a *name* from web/js/components/icons.js, not a character: the
    client draws the glyph. Emoji looked like a different product on every
    operating system and could not take the tier colour the tile is built
    around, which a stroked `currentColor` icon does for free.

    `numeral` is the exception, and only the level achievements have one — a
    Roman numeral set in the display face says "level 25" better than any
    picture of a medal could, so those tiles show the numeral and keep the icon
    only as a fallback.
    """
    return {"key": key, "name": name, "description": description,
            "requirement": requirement, "tier": tier, "icon": icon,
            "numeral": numeral}


ALL_ACHIEVEMENTS: list[dict] = [
    _a("first_step", "First Step", "Complete your first quest.",
       "Verify 1 quest", "bronze", "check"),
    _a("consistent", "Consistent", "Complete quests seven days in a row.",
       "7 day streak", "silver", "flame"),
    _a("unbroken", "Unbroken", "Thirty consecutive active days.",
       "30 day streak", "gold", "flame"),
    _a("explorer", "Explorer", "Try five different passion categories.",
       "5 passion paths explored", "silver", "compass"),
    _a("thinker", "Thinker", "Complete fifty academic quests.",
       "50 academic quests", "gold", "brain"),
    _a("athlete", "Athlete", "Complete fifty physical quests.",
       "50 physical quests", "gold", "bolt"),
    _a("creator", "Creator", "Complete your first major passion project.",
       "1 milestone or epic passion quest", "silver", "sparkles"),
    _a("first_creation", "First Creation", "Finish and document something you built.",
       "1 milestone passion quest with a document or link", "silver", "hammer"),
    _a("balanced", "Balanced", "Keep all three domains meaningfully active.",
       "All three attributes above 20", "silver", "scale"),
    _a("equilibrium", "Equilibrium", "All three attributes above 60.",
       "All three attributes above 60", "gold", "target"),
    _a("master_builder", "Master Builder", "Complete an entire questline.",
       "Finish 1 quest chain", "gold", "layers"),
    _a("deep_work", "Deep Work", "Complete a session of 90 minutes or more.",
       "1 quest with 90+ recorded minutes", "bronze", "hourglass"),
    _a("scholar", "Scholar", "Reach 60 Academic.",
       "Academic attribute 60", "gold", "book"),
    _a("veteran", "Veteran", "Complete one hundred quests.",
       "100 verified quests", "gold", "shield"),
    _a("level_10", "Apprentice", "Reach level 10.", "Level 10", "bronze", "medal", "X"),
    _a("level_25", "Adept", "Reach level 25.", "Level 25", "silver", "medal", "XXV"),
    _a("level_50", "Expert", "Reach level 50.", "Level 50", "gold", "medal", "L"),
    _a("level_75", "Elite", "Reach level 75.", "Level 75", "platinum", "medal", "LXXV"),
    _a("level_100", "Master of Life", "Reach the maximum level.",
       "Level 100", "platinum", "crown", "C"),
]

ACHIEVEMENTS_BY_KEY = {a["key"]: a for a in ALL_ACHIEVEMENTS}


def _stats(user_id: int) -> dict[str, Any]:
    row = db.query_one(
        """SELECT
             (SELECT COUNT(*) FROM quest_completions WHERE user_id=? AND status='verified') AS verified,
             (SELECT COUNT(*) FROM quest_completions c JOIN quests q ON q.id=c.quest_id
                WHERE c.user_id=? AND c.status='verified' AND q.domain='academic') AS academic,
             (SELECT COUNT(*) FROM quest_completions c JOIN quests q ON q.id=c.quest_id
                WHERE c.user_id=? AND c.status='verified' AND q.domain='physical') AS physical,
             (SELECT COUNT(*) FROM quest_completions c JOIN quests q ON q.id=c.quest_id
                WHERE c.user_id=? AND c.status='verified' AND q.domain='passion') AS passion,
             (SELECT COUNT(*) FROM quest_completions c JOIN quests q ON q.id=c.quest_id
                WHERE c.user_id=? AND c.status='verified' AND q.domain='passion'
                  AND q.kind IN ('milestone','epic')) AS passion_major,
             (SELECT COUNT(*) FROM passion_paths WHERE user_id=?) AS paths,
             (SELECT COUNT(*) FROM chain_progress WHERE user_id=? AND status='complete') AS chains
        """,
        (user_id, user_id, user_id, user_id, user_id, user_id, user_id),
    )
    return dict(row) if row else {}


def _long_session(user_id: int) -> bool:
    row = db.query_one(
        """SELECT proof FROM quest_completions
            WHERE user_id=? AND status='verified' AND proof LIKE '%minutes%'""",
        (user_id,),
    )
    if not row:
        return False
    rows = db.query(
        "SELECT proof FROM quest_completions WHERE user_id=? AND status='verified'", (user_id,))
    import json
    for r in rows:
        try:
            payload = json.loads(r["proof"] or "{}")
        except ValueError:
            continue
        structured = payload.get("structured") or {}
        try:
            if int(structured.get("minutes") or 0) >= 90:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _documented_creation(user_id: int) -> bool:
    import json
    rows = db.query(
        """SELECT c.proof FROM quest_completions c JOIN quests q ON q.id=c.quest_id
            WHERE c.user_id=? AND c.status='verified' AND q.domain='passion'
              AND q.kind IN ('milestone','epic')""",
        (user_id,),
    )
    for r in rows:
        try:
            payload = json.loads(r["proof"] or "{}")
        except ValueError:
            continue
        if payload.get("link") or payload.get("files"):
            return True
    return False


def evaluate(user_id: int, profile: dict, attributes: dict) -> list[dict]:
    """Award every achievement whose condition now holds. Returns new unlocks."""
    owned = {r["achievement_key"] for r in db.query(
        "SELECT achievement_key FROM user_achievements WHERE user_id=?", (user_id,))}
    stats = _stats(user_id)
    level = int(profile.get("level", 1))
    streak = int(profile.get("streak_best", 0))

    conditions: dict[str, Callable[[], bool]] = {
        "first_step": lambda: stats.get("verified", 0) >= 1,
        "consistent": lambda: streak >= 7,
        "unbroken": lambda: streak >= 30,
        "explorer": lambda: stats.get("paths", 0) >= 5,
        "thinker": lambda: stats.get("academic", 0) >= 50,
        "athlete": lambda: stats.get("physical", 0) >= 50,
        "creator": lambda: stats.get("passion_major", 0) >= 1,
        "first_creation": lambda: _documented_creation(user_id),
        "balanced": lambda: min(attributes["physical"], attributes["academic"],
                                attributes["passion"]) >= 20,
        "equilibrium": lambda: min(attributes["physical"], attributes["academic"],
                                   attributes["passion"]) >= 60,
        "master_builder": lambda: stats.get("chains", 0) >= 1,
        "deep_work": lambda: _long_session(user_id),
        "scholar": lambda: attributes["academic"] >= 60,
        "veteran": lambda: stats.get("verified", 0) >= 100,
        "level_10": lambda: level >= 10,
        "level_25": lambda: level >= 25,
        "level_50": lambda: level >= 50,
        "level_75": lambda: level >= 75,
        "level_100": lambda: level >= 100,
    }

    newly: list[dict] = []
    for key, condition in conditions.items():
        if key in owned:
            continue
        try:
            if condition():
                db.execute(
                    "INSERT OR IGNORE INTO user_achievements (user_id, achievement_key, unlocked_at) "
                    "VALUES (?,?,datetime('now'))",
                    (user_id, key),
                )
                newly.append(ACHIEVEMENTS_BY_KEY[key])
        except Exception:
            continue
    return newly


def for_user(user_id: int) -> list[dict]:
    unlocked = {r["achievement_key"]: r["unlocked_at"] for r in db.query(
        "SELECT achievement_key, unlocked_at FROM user_achievements WHERE user_id=?", (user_id,))}
    out = []
    for ach in ALL_ACHIEVEMENTS:
        out.append({
            **ach,
            "unlocked": ach["key"] in unlocked,
            "unlockedAt": unlocked.get(ach["key"]),
        })
    return out
