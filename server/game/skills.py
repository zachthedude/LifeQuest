"""The skill tree (§18) and the level milestones that gate real capabilities (§42).

Skill effects are functional, not cosmetic: they change XP maths, unlock quest
archetypes, add daily quest slots, or open whole features.
"""

from __future__ import annotations

from typing import Any

from .. import db

# --- Level milestones -------------------------------------------------------
# Each milestone unlocks a capability the rest of the system actually checks.
LEVEL_MILESTONES: list[dict] = [
    {"level": 5,   "key": "weekly_quests",     "name": "Weekly Objectives",
     "description": "Weekly quests start appearing alongside your dailies."},
    {"level": 10,  "key": "advanced_quests",   "name": "Advanced Quests",
     "description": "Tier-2 quest archetypes and 4-star difficulty unlock."},
    {"level": 12,  "key": "quest_chains",      "name": "Questlines",
     "description": "Multi-step questlines become available."},
    {"level": 20,  "key": "specialisation",    "name": "Skill Specialisation",
     "description": "Tier-3 skill nodes unlock in the skill tree."},
    {"level": 30,  "key": "custom_quests",     "name": "Custom Quest Creation",
     "description": "Design your own quests; the AI reviews and balances them."},
    {"level": 40,  "key": "advanced_guidance", "name": "Advanced AI Guidance",
     "description": "The Guide gains deep analysis and long-range planning."},
    {"level": 50,  "key": "epic_chains",       "name": "Epic Questlines",
     "description": "Epic multi-phase questlines and 5-star quests unlock."},
    {"level": 75,  "key": "elite_challenges",  "name": "Elite Challenges",
     "description": "Elite challenge quests with the highest rewards unlock."},
    {"level": 100, "key": "master_of_life",    "name": "Master of Life",
     "description": "Every archetype, every chain, every challenge. Mastery."},
]


def unlocked_milestones(level: int) -> list[dict]:
    return [m for m in LEVEL_MILESTONES if level >= m["level"]]


def has_capability(level: int, key: str) -> bool:
    for milestone in LEVEL_MILESTONES:
        if milestone["key"] == key:
            return level >= milestone["level"]
    return False


def next_milestone(level: int) -> dict | None:
    for milestone in LEVEL_MILESTONES:
        if milestone["level"] > level:
            return milestone
    return None


# --- Skill tree -------------------------------------------------------------
# effect types:
#   xp_bonus     -> +value fraction of XP in that domain
#   quest_slot   -> +value extra daily quest slots
#   unlock_tag   -> makes quest templates carrying `tag` eligible
#   quality_floor-> raises the minimum quality multiplier on verified proof
def _skill(key, name, domain, tier, description, requires=None, level_required=1,
           quests_required=0, effect=None) -> dict:
    return {
        "key": key, "name": name, "domain": domain, "tier": tier,
        "description": description, "requires": requires or [],
        "level_required": level_required, "quests_required": quests_required,
        "effect": effect or {},
    }


ALL_SKILLS: list[dict] = [
    # ---- Physical ----
    _skill("phys_foundation", "Foundation", "physical", 1,
           "You show up. Movement is part of your week now.",
           level_required=1, quests_required=1,
           effect={"type": "xp_bonus", "domain": "physical", "value": 0.03}),
    _skill("phys_endurance", "Endurance", "physical", 2,
           "Sustained effort over longer sessions.",
           requires=["phys_foundation"], level_required=8, quests_required=8,
           effect={"type": "unlock_tag", "tag": "endurance"}),
    _skill("phys_strength", "Strength", "physical", 2,
           "Controlled, progressive resistance work.",
           requires=["phys_foundation"], level_required=8, quests_required=8,
           effect={"type": "unlock_tag", "tag": "strength"}),
    _skill("phys_mobility", "Mobility", "physical", 2,
           "Range of motion and joint control.",
           requires=["phys_foundation"], level_required=6, quests_required=5,
           effect={"type": "unlock_tag", "tag": "mobility"}),
    _skill("phys_coordination", "Coordination", "physical", 3,
           "Skill-based movement: sport, balance, agility.",
           requires=["phys_mobility"], level_required=20, quests_required=20,
           effect={"type": "unlock_tag", "tag": "coordination"}),
    _skill("phys_recovery", "Recovery", "physical", 3,
           "Rest, sleep and deload are training too.",
           requires=["phys_endurance"], level_required=20, quests_required=18,
           effect={"type": "xp_bonus", "domain": "physical", "value": 0.05}),
    _skill("phys_discipline", "Discipline", "physical", 2,
           "You train on the days you do not feel like training.",
           requires=["phys_foundation"], level_required=10, quests_required=10,
           effect={"type": "quality_floor", "value": 0.80}),
    _skill("phys_conditioning", "Conditioning", "physical", 3,
           "A base deep enough that hard sessions stop being a shock.",
           requires=["phys_endurance"], level_required=20, quests_required=20,
           effect={"type": "xp_bonus", "domain": "physical", "value": 0.04}),
    _skill("phys_power", "Power", "physical", 3,
           "Force produced quickly: jumping, throwing, sprinting.",
           requires=["phys_strength"], level_required=22, quests_required=20,
           effect={"type": "xp_bonus", "domain": "physical", "value": 0.04}),
    _skill("phys_athlete", "Athlete", "physical", 4,
           "Physical capability is now a defining strength.",
           requires=["phys_coordination", "phys_recovery"], level_required=45, quests_required=60,
           effect={"type": "xp_bonus", "domain": "physical", "value": 0.08}),
    _skill("phys_resilience", "Resilience", "physical", 4,
           "You absorb a hard week and come back the same person.",
           requires=["phys_conditioning", "phys_power"], level_required=50, quests_required=70,
           effect={"type": "quality_floor", "value": 0.90}),

    # ---- Academic ----
    _skill("acad_foundation", "Study Habit", "academic", 1,
           "Regular, deliberate study sessions.",
           level_required=1, quests_required=1,
           effect={"type": "xp_bonus", "domain": "academic", "value": 0.03}),
    _skill("acad_focus", "Focus", "academic", 2,
           "Longer uninterrupted concentration.",
           requires=["acad_foundation"], level_required=6, quests_required=5,
           effect={"type": "unlock_tag", "tag": "focus"}),
    _skill("acad_memory", "Memory", "academic", 2,
           "Active recall and spaced repetition.",
           requires=["acad_foundation"], level_required=8, quests_required=8,
           effect={"type": "unlock_tag", "tag": "memory"}),
    _skill("acad_problem_solving", "Problem Solving", "academic", 2,
           "Structured attack on unfamiliar problems.",
           requires=["acad_foundation"], level_required=8, quests_required=8,
           effect={"type": "unlock_tag", "tag": "problem_solving"}),
    _skill("acad_critical", "Critical Thinking", "academic", 3,
           "Evaluating claims, evidence and your own reasoning.",
           requires=["acad_problem_solving"], level_required=20, quests_required=20,
           effect={"type": "unlock_tag", "tag": "critical"}),
    _skill("acad_research", "Research", "academic", 3,
           "Finding, judging and synthesising sources.",
           requires=["acad_memory"], level_required=20, quests_required=18,
           effect={"type": "unlock_tag", "tag": "research"}),
    _skill("acad_communication", "Communication", "academic", 3,
           "Explaining what you know so others understand it.",
           requires=["acad_focus"], level_required=22, quests_required=20,
           effect={"type": "unlock_tag", "tag": "teaching"}),
    _skill("acad_breadth", "Breadth", "academic", 2,
           "More than one subject, deliberately, so ideas can cross.",
           requires=["acad_foundation"], level_required=10, quests_required=10,
           effect={"type": "xp_bonus", "domain": "academic", "value": 0.03}),
    _skill("acad_synthesis", "Synthesis", "academic", 3,
           "Pulling separate sources into one argument that is yours.",
           requires=["acad_memory"], level_required=24, quests_required=22,
           effect={"type": "xp_bonus", "domain": "academic", "value": 0.04}),
    _skill("acad_rigour", "Rigour", "academic", 3,
           "You check your own work before anyone else has to.",
           requires=["acad_problem_solving"], level_required=24, quests_required=22,
           effect={"type": "quality_floor", "value": 0.85}),
    _skill("acad_scholar", "Scholar", "academic", 4,
           "You can learn anything you decide to learn.",
           requires=["acad_critical", "acad_research"], level_required=45, quests_required=60,
           effect={"type": "xp_bonus", "domain": "academic", "value": 0.08}),
    _skill("acad_polymath", "Polymath", "academic", 4,
           "Depth in several fields, and the sense to connect them.",
           requires=["acad_synthesis", "acad_communication"], level_required=50,
           quests_required=75,
           effect={"type": "xp_bonus", "domain": "academic", "value": 0.05}),

    # ---- Passion ----
    _skill("pass_curiosity", "Curiosity", "passion", 1,
           "You try things before deciding what you love.",
           level_required=1, quests_required=1,
           effect={"type": "xp_bonus", "domain": "passion", "value": 0.03}),
    _skill("pass_explorer", "Explorer", "passion", 2,
           "Deliberate exploration across several fields.",
           requires=["pass_curiosity"], level_required=6, quests_required=5,
           effect={"type": "quest_slot", "value": 1}),
    _skill("pass_craft", "Craft", "passion", 2,
           "Deliberate practice inside a chosen field.",
           requires=["pass_curiosity"], level_required=8, quests_required=8,
           effect={"type": "unlock_tag", "tag": "craft"}),
    _skill("pass_builder", "Builder", "passion", 3,
           "You finish things and ship them.",
           requires=["pass_craft"], level_required=20, quests_required=18,
           effect={"type": "unlock_tag", "tag": "project"}),
    _skill("pass_documenter", "Documenter", "passion", 3,
           "Your work is written down and shareable.",
           requires=["pass_craft"], level_required=22, quests_required=20,
           effect={"type": "quality_floor", "value": 0.85}),
    _skill("pass_discipline", "Discipline", "passion", 2,
           "The work continues after the excitement has worn off.",
           requires=["pass_curiosity"], level_required=10, quests_required=10,
           effect={"type": "xp_bonus", "domain": "passion", "value": 0.04}),
    _skill("pass_audience", "Audience", "passion", 3,
           "You put the work in front of someone who is not you.",
           requires=["pass_craft"], level_required=24, quests_required=22,
           effect={"type": "xp_bonus", "domain": "passion", "value": 0.04}),
    _skill("pass_taste", "Taste", "passion", 3,
           "You can tell good from nearly-good, including your own.",
           requires=["pass_explorer"], level_required=24, quests_required=22,
           effect={"type": "quality_floor", "value": 0.85}),
    _skill("pass_creator", "Creator", "passion", 4,
           "You make things that exist in the world.",
           requires=["pass_builder", "pass_documenter"], level_required=45, quests_required=60,
           effect={"type": "xp_bonus", "domain": "passion", "value": 0.08}),
    _skill("pass_mastery", "Mastery", "passion", 4,
           "The field is yours. What you make now teaches other people.",
           requires=["pass_audience", "pass_taste"], level_required=50, quests_required=75,
           effect={"type": "xp_bonus", "domain": "passion", "value": 0.05}),
]

SKILLS_BY_KEY = {s["key"]: s for s in ALL_SKILLS}
MAX_SKILL_TIER = max(s["tier"] for s in ALL_SKILLS)
MAX_TIER_FOR_LEVEL = [(20, 3), (0, 2)]  # tier 3+ needs the specialisation milestone


def tier_available(level: int, tier: int) -> bool:
    if tier <= 2:
        return True
    if tier == 3:
        return has_capability(level, "specialisation")
    return level >= 45


def evaluate(user_id: int, level: int, domain_quest_counts: dict[str, int]) -> list[dict]:
    """Unlock every skill whose requirements are now met. Returns new unlocks."""
    owned = {r["skill_key"] for r in db.query(
        "SELECT skill_key FROM user_skills WHERE user_id=?", (user_id,))}
    newly: list[dict] = []
    # Multiple passes so a chain of prerequisites can unlock in one evaluation.
    # One pass per tier: a player who arrives at level 50 with the quest counts
    # already banked has to be able to unlock a root, its branch, the specialism
    # above it and the capstone above that in a single call.
    for _ in range(MAX_SKILL_TIER):
        progressed = False
        for skill in ALL_SKILLS:
            if skill["key"] in owned:
                continue
            if level < skill["level_required"]:
                continue
            if not tier_available(level, skill["tier"]):
                continue
            if domain_quest_counts.get(skill["domain"], 0) < skill["quests_required"]:
                continue
            if any(req not in owned for req in skill["requires"]):
                continue
            db.execute(
                "INSERT OR IGNORE INTO user_skills (user_id, skill_key, unlocked_at) "
                "VALUES (?,?,datetime('now'))",
                (user_id, skill["key"]),
            )
            owned.add(skill["key"])
            newly.append(skill)
            progressed = True
        if not progressed:
            break
    return newly


def user_skill_keys(user_id: int) -> set[str]:
    return {r["skill_key"] for r in db.query(
        "SELECT skill_key FROM user_skills WHERE user_id=?", (user_id,))}


def aggregate_effects(skill_keys: set[str]) -> dict[str, Any]:
    """Collapse unlocked skills into the numbers the engine consumes."""
    result = {
        "xp_bonus": {"physical": 0.0, "academic": 0.0, "passion": 0.0},
        "quest_slots": 0,
        "tags": set(),
        "quality_floor": 0.0,
    }
    for key in skill_keys:
        skill = SKILLS_BY_KEY.get(key)
        if not skill:
            continue
        effect = skill.get("effect") or {}
        kind = effect.get("type")
        if kind == "xp_bonus":
            result["xp_bonus"][effect["domain"]] += float(effect["value"])
        elif kind == "quest_slot":
            result["quest_slots"] += int(effect["value"])
        elif kind == "unlock_tag":
            result["tags"].add(effect["tag"])
        elif kind == "quality_floor":
            result["quality_floor"] = max(result["quality_floor"], float(effect["value"]))
    return result


def tree_for_user(user_id: int, level: int, domain_quest_counts: dict[str, int]) -> list[dict]:
    """Skill tree with per-node state for the UI."""
    owned = user_skill_keys(user_id)
    nodes = []
    for skill in ALL_SKILLS:
        completed_quests = domain_quest_counts.get(skill["domain"], 0)
        blockers = []
        if level < skill["level_required"]:
            blockers.append(f"Reach level {skill['level_required']}")
        if not tier_available(level, skill["tier"]):
            blockers.append("Unlock skill specialisation (level 20)")
        if completed_quests < skill["quests_required"]:
            blockers.append(
                f"{completed_quests}/{skill['quests_required']} {skill['domain']} quests")
        missing = [SKILLS_BY_KEY[r]["name"] for r in skill["requires"] if r not in owned]
        if missing:
            blockers.append("Requires " + ", ".join(missing))
        nodes.append({
            "key": skill["key"], "name": skill["name"], "domain": skill["domain"],
            "tier": skill["tier"], "description": skill["description"],
            "requires": skill["requires"], "levelRequired": skill["level_required"],
            "questsRequired": skill["quests_required"],
            "questsCompleted": completed_quests,
            "effect": skill["effect"],
            "unlocked": skill["key"] in owned,
            "blockers": [] if skill["key"] in owned else blockers,
        })
    return nodes
