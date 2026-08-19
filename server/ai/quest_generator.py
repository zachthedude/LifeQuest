"""AI module 1 — Quest Generator.

Picks *what the player should be asked to do next*. It runs in two stages:

  1. Selection (always local, always deterministic): score every archetype in the
     catalog against the player model — level tier, interests, domain deficit,
     recent history, unlocked skill tags, difficulty offset from the difficulty
     engine — and pick the best fit. This is genuine adaptation with no model
     required.
  2. Personalisation (model-backed when a key is configured): hand the chosen
     archetype plus the player context to the LLM and ask for a sharper,
     player-specific rewrite in a fixed JSON schema. Anything that fails schema
     validation, safety screening or reward sanity checks is discarded and the
     locally rendered quest is used instead.
"""

from __future__ import annotations

import hashlib
import random
import time
from datetime import datetime, timedelta, timezone

from .. import config, db
from ..game import catalog, safety
from ..game import xp as xp_mod
from .provider import get_provider

QUEST_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "difficulty": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
        "estimatedTime": {"type": "integer"},
        "completionCriteria": {"type": "string"},
        "evaluationCriteria": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "description", "difficulty", "estimatedTime",
                 "completionCriteria", "evaluationCriteria"],
    "additionalProperties": False,
}

SYSTEM = (
    "You design quests for LifeQuest, an RPG whose quests are real-life actions.\n"
    "Rules you must follow:\n"
    "- The quest must be completable by one person, today, with ordinary resources.\n"
    "- Physical quests target capability, movement and wellbeing. Never appearance, "
    "weight, body composition, dieting, or training to exhaustion.\n"
    "- Never suggest sleep deprivation, unsafe experiments, or anything illegal.\n"
    "- Be concrete and specific to this player. Avoid generic self-help phrasing.\n"
    "- Difficulty and estimated time must match the player's level and available time.\n"
    "- Write the description in second person, 2-3 sentences, no preamble."
)


def _seeded_random(user_id: int, salt: str) -> random.Random:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    digest = hashlib.sha256(f"{user_id}:{today}:{salt}".encode()).hexdigest()
    return random.Random(int(digest[:12], 16))


def _recent_template_uses(user_id: int, days: int = 14) -> dict[str, int]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    rows = db.query(
        """SELECT template_key, COUNT(*) AS n FROM quests
            WHERE user_id=? AND created_at >= ? GROUP BY template_key""",
        (user_id, since),
    )
    return {row["template_key"]: int(row["n"]) for row in rows}


def _open_template_keys(user_id: int) -> set[str]:
    rows = db.query(
        "SELECT template_key FROM quests WHERE user_id=? AND status IN ('available','active','submitted')",
        (user_id,),
    )
    return {row["template_key"] for row in rows}


def _tokens(model: dict, rng: random.Random, domain: str) -> dict[str, str]:
    subjects = model.get("academic_subjects") or []
    activities = model.get("physical_activities") or []
    passions = model.get("passion_interests") or []
    curious = model.get("passion_curious") or []
    return {
        "subject": rng.choice(subjects) if subjects else "",
        "activity": rng.choice(activities) if activities else "",
        "passion": rng.choice(passions) if passions else "",
        "curious": rng.choice(curious) if curious else (rng.choice(passions) if passions else ""),
    }


def score_template(template: dict, *, level: int, target_tier: int, uses: dict[str, int],
                   open_keys: set[str], unlocked_tags: set[str], model: dict,
                   rng: random.Random, allow_open: bool = False) -> float:
    """Higher is better. Returns -inf for ineligible templates.

    `allow_open` is the relaxed second pass: an archetype the player already has
    open is normally ineligible, but when *everything* is open it is far better
    to issue a second push-up quest than to hand back "no quests available".
    """
    if level < template["min_level"]:
        return float("-inf")
    if template["key"] in open_keys:
        if not allow_open:
            return float("-inf")

    gated_tags = {t for t in template["tags"] if t not in ("base", "explore")}
    if gated_tags and not (gated_tags & unlocked_tags):
        # Tag-gated archetypes stay locked until the matching skill is unlocked,
        # except at low tiers where they act as the on-ramp.
        if template["tier"] > 1:
            return float("-inf")

    score = 100.0
    score -= abs(template["tier"] - target_tier) * 22.0
    score -= uses.get(template["key"], 0) * 14.0          # novelty pressure
    if template["key"] in open_keys:
        # Only reachable on the relaxed pass: still the last thing we'd pick.
        score -= 60.0

    interests = [s.lower() for s in (model.get("passion_interests") or [])]
    curious = [s.lower() for s in (model.get("passion_curious") or [])]
    if template["domain"] == "passion":
        if "explore" in template["tags"] and curious:
            score += 12.0
        if "craft" in template["tags"] and interests:
            score += 8.0

    minutes_budget = int(model.get("minutes_per_day") or 45)
    if template["kind"] == "daily" and template["minutes"] > minutes_budget * 1.6:
        score -= 25.0
    elif template["kind"] == "daily" and template["minutes"] <= minutes_budget:
        score += 6.0

    score += rng.uniform(0, 9.0)
    return score


def select_template(user_id: int, domain: str, kind: str, level: int, model: dict,
                    unlocked_tags: set[str], difficulty_offset: int = 0,
                    salt: str = "") -> dict | None:
    rng = _seeded_random(user_id, f"{domain}:{kind}:{salt}")
    effective_level = max(1, level + difficulty_offset * 5)
    target_tier = catalog.tier_for_level(effective_level)
    uses = _recent_template_uses(user_id)
    open_keys = _open_template_keys(user_id)

    candidates = catalog.templates_for(domain=domain, kinds=(kind,))

    # Two passes. The first refuses to repeat anything already open, which is
    # what keeps a quest list varied. The second drops only that rule, so a
    # player who has opened every archetype in a domain still gets a quest —
    # the alternative was a dead end the player could not clear without
    # abandoning work they had already started.
    for allow_open in (False, True):
        scored = [
            (score_template(t, level=level, target_tier=target_tier, uses=uses,
                            open_keys=open_keys, unlocked_tags=unlocked_tags,
                            model=model, rng=rng, allow_open=allow_open), t)
            for t in candidates
        ]
        scored = [(s, t) for s, t in scored if s != float("-inf")]
        if scored:
            scored.sort(key=lambda pair: pair[0], reverse=True)
            return scored[0][1]
    return None


def render_template(template: dict, model: dict, level: int, user_id: int,
                    difficulty_offset: int = 0) -> dict:
    """Turn an archetype into a concrete quest spec (no model involved)."""
    rng = _seeded_random(user_id, template["key"])
    tokens = _tokens(model, rng, template["domain"])
    difficulty = max(1, min(5, template["difficulty"] + max(-1, min(1, difficulty_offset))))
    minutes = template["minutes"]
    if template["kind"] == "daily":
        budget = int(model.get("minutes_per_day") or 45)
        minutes = max(10, min(template["minutes"], max(15, budget)))

    return {
        "templateKey": template["key"],
        "title": catalog.fill(template["title"], tokens),
        "description": catalog.fill(template["description"], tokens),
        "domain": template["domain"],
        "kind": template["kind"],
        "difficulty": difficulty,
        "estimatedTime": minutes,
        "xpReward": xp_mod.quest_xp_reward(difficulty, template["kind"], level, minutes),
        "requirements": template["requirements"],
        "proofType": template["proof_types"],
        "skills": template["skills"],
        "levelRequirement": template["min_level"],
        "aiEvaluationCriteria": template["evaluation_criteria"],
        "completionCriteria": catalog.fill(template["completion_criteria"], tokens),
        "source": "system",
        "tags": template["tags"],
    }


def _player_brief(model: dict, level: int, snapshot: dict) -> str:
    attrs = snapshot.get("attributes", {})
    return (
        f"Player level: {level}\n"
        f"Attributes — physical {attrs.get('physical', 0)}, academic {attrs.get('academic', 0)}, "
        f"passion {attrs.get('passion', 0)} (0-100)\n"
        f"Time available per day: {model.get('minutes_per_day', 45)} minutes\n"
        f"Age band: {model.get('age_band', 'adult')}\n"
        f"Academic subjects: {', '.join(model.get('academic_subjects') or []) or 'unspecified'}\n"
        f"Physical activities: {', '.join(model.get('physical_activities') or []) or 'unspecified'}\n"
        f"Passions: {', '.join(model.get('passion_interests') or []) or 'unspecified'}\n"
        f"Curious about: {', '.join(model.get('passion_curious') or []) or 'unspecified'}\n"
        f"Short-term goal: {model.get('short_term_goals') or 'unspecified'}\n"
        f"Long-term goal: {model.get('long_term_goals') or 'unspecified'}\n"
        f"Current streak: {snapshot.get('streak', {}).get('current', 0)} days"
    )


def personalise(spec: dict, model: dict, level: int, snapshot: dict,
                recent_titles: list[str], deadline: float | None = None) -> dict:
    """Optional model pass. Returns the spec unchanged if anything is off.

    `deadline` is a `time.monotonic()` stamp shared across a batch. Prose is the
    only thing a model adds here, so when the clock runs out the locally
    rendered quest ships instead of the player watching a spinner.
    """
    provider = get_provider()
    if not provider.available:
        return spec

    budget = float(config.AI_QUEST_TIMEOUT)
    if deadline is not None:
        budget = min(budget, deadline - time.monotonic())
        if budget < 2.0:
            return spec

    prompt = (
        f"{_player_brief(model, level, snapshot)}\n\n"
        f"Recently issued quests (do not repeat these):\n"
        + ("\n".join(f"- {t}" for t in recent_titles[:8]) or "- none") + "\n\n"
        f"Archetype to personalise:\n"
        f"Domain: {spec['domain']}\nClass: {spec['kind']}\n"
        f"Title: {spec['title']}\nDescription: {spec['description']}\n"
        f"Target difficulty: {spec['difficulty']} of 5\n"
        f"Target duration: {spec['estimatedTime']} minutes\n"
        f"Completion criteria: {spec['completionCriteria']}\n\n"
        "Rewrite this as one specific quest for this player. Keep the same domain, "
        "class and rough duration. Difficulty may move by at most one step. "
        "evaluationCriteria should list 2-4 things a reviewer would check in the "
        "player's evidence."
    )
    result = provider.complete_json(SYSTEM, prompt, QUEST_SCHEMA, max_tokens=900,
                                    timeout=budget)
    if not result:
        return spec

    title = str(result.get("title", "")).strip()[:120]
    description = str(result.get("description", "")).strip()[:800]
    if len(title) < 4 or len(description) < 20:
        return spec

    combined = f"{title} {description}"
    if not safety.is_safe(combined):
        return spec
    if safety.youth_guard(combined, model.get("age_band", "adult")):
        return spec

    try:
        difficulty = int(result.get("difficulty", spec["difficulty"]))
        minutes = int(result.get("estimatedTime", spec["estimatedTime"]))
    except (TypeError, ValueError):
        return spec
    if abs(difficulty - spec["difficulty"]) > 1:
        difficulty = spec["difficulty"]
    minutes = max(5, min(1200, minutes))
    if spec["kind"] == "daily" and minutes > 180:
        minutes = spec["estimatedTime"]

    criteria = [str(c)[:160] for c in (result.get("evaluationCriteria") or [])][:4]

    personalised = dict(spec)
    personalised.update({
        "title": title,
        "description": description,
        "difficulty": difficulty,
        "estimatedTime": minutes,
        "completionCriteria": str(result.get("completionCriteria") or
                                  spec["completionCriteria"])[:300],
        "aiEvaluationCriteria": criteria or spec["aiEvaluationCriteria"],
        "xpReward": xp_mod.quest_xp_reward(difficulty, spec["kind"], level, minutes),
        "source": "ai",
    })
    return personalised


def generate(user_id: int, domain: str, kind: str, level: int, model: dict,
             snapshot: dict, unlocked_tags: set[str], difficulty_offset: int = 0,
             use_model: bool = True, salt: str = "",
             deadline: float | None = None) -> dict | None:
    template = select_template(user_id, domain, kind, level, model, unlocked_tags,
                               difficulty_offset, salt=salt)
    if template is None:
        return None
    spec = render_template(template, model, level, user_id, difficulty_offset)
    if use_model:
        recent = [row["title"] for row in db.query(
            "SELECT title FROM quests WHERE user_id=? ORDER BY id DESC LIMIT 8", (user_id,))]
        spec = personalise(spec, model, level, snapshot, recent, deadline=deadline)
    return spec
