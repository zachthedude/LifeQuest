"""Quest lifecycle service — the spine of the gameplay loop (§21).

    generate -> start -> complete in real life -> submit proof -> AI evaluation
    -> XP -> attributes -> achievements/skills -> next quest adapts
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timedelta, timezone

from .. import config, db
from ..ai import difficulty as difficulty_mod
from ..ai import guide as guide_mod
from ..ai import proof_evaluator, quest_generator
from . import anticheat, catalog, player, safety
from . import skills as skills_mod
from . import xp as xp_mod

DAILY_BASE_SLOTS = 3          # one per domain
WEEKLY_SLOTS = 1
DAILY_EXPIRY_HOURS = 36
WEEKLY_EXPIRY_DAYS = 8

# Generation reads the player's open quests, decides, and only then writes. Two
# requests overlapping in that window both see the same "nothing open yet" and
# both issue the same archetype — which is exactly what a player does when a
# slow generate makes them press the button again. Serialising per player closes
# the window; the lock is only ever held by one player's generation, so a slow
# model call cannot block anyone else.
_generation_locks: dict[int, threading.Lock] = {}
_locks_guard = threading.Lock()


def _generation_lock(user_id: int) -> threading.Lock:
    with _locks_guard:
        lock = _generation_locks.get(user_id)
        if lock is None:
            lock = threading.Lock()
            _generation_locks[user_id] = lock
        return lock


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def serialize(row) -> dict:
    data = dict(row)
    return {
        "id": data["id"],
        "templateKey": data["template_key"],
        "title": data["title"],
        "description": data["description"],
        "domain": data["domain"],
        "kind": data["kind"],
        "difficulty": data["difficulty"],
        "difficultyLabel": xp_mod.DIFFICULTY_LABELS.get(data["difficulty"], "MODERATE"),
        "estimatedTime": data["estimated_time"],
        "xpReward": data["xp_reward"],
        "levelRequirement": data["level_requirement"],
        "requirements": json.loads(data["requirements"] or "[]"),
        "proofType": json.loads(data["proof_types"] or "[]"),
        "skills": json.loads(data["skills"] or "[]"),
        "aiEvaluationCriteria": json.loads(data["evaluation_criteria"] or "[]"),
        "completionCriteria": data["completion_criteria"],
        "status": data["status"],
        "source": data["source"],
        "chainKey": data["chain_key"],
        "chainStep": data["chain_step"],
        "createdAt": data["created_at"],
        "startedAt": data["started_at"],
        "expiresAt": data["expires_at"],
        "completedAt": data["completed_at"],
    }


def _expiry_for(kind: str) -> str | None:
    now = datetime.now(timezone.utc)
    if kind == "daily":
        return (now + timedelta(hours=DAILY_EXPIRY_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
    if kind == "weekly":
        return (now + timedelta(days=WEEKLY_EXPIRY_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    return None


def insert_quest(user_id: int, spec: dict) -> int:
    return db.insert(
        """INSERT INTO quests (user_id, template_key, title, description, domain, kind,
                               difficulty, estimated_time, xp_reward, level_requirement,
                               requirements, proof_types, skills, evaluation_criteria,
                               completion_criteria, status, source, chain_key, chain_step,
                               created_at, expires_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            user_id, spec.get("templateKey", "custom"), spec["title"], spec["description"],
            spec["domain"], spec["kind"], spec["difficulty"], spec["estimatedTime"],
            spec["xpReward"], spec.get("levelRequirement", 1),
            json.dumps(spec.get("requirements", [])),
            json.dumps(spec.get("proofType", ["text"])),
            json.dumps(spec.get("skills", [])),
            json.dumps(spec.get("aiEvaluationCriteria", [])),
            spec.get("completionCriteria", ""), "available", spec.get("source", "system"),
            spec.get("chainKey"), spec.get("chainStep"),
            _now(), _expiry_for(spec["kind"]),
        ),
    )


def expire_stale(user_id: int) -> int:
    cur = db.execute(
        """UPDATE quests SET status='expired'
            WHERE user_id=? AND status IN ('available','active')
              AND expires_at IS NOT NULL AND expires_at < ?""",
        (user_id, _now()),
    )
    return cur.rowcount or 0


def open_quests(user_id: int) -> list[dict]:
    rows = db.query(
        """SELECT * FROM quests WHERE user_id=? AND status IN ('available','active')
            ORDER BY CASE kind WHEN 'daily' THEN 0 WHEN 'weekly' THEN 1
                               WHEN 'milestone' THEN 2 ELSE 3 END, id""",
        (user_id,),
    )
    return [serialize(row) for row in rows]


def list_quests(user_id: int, status: str | None = None, limit: int = 100) -> list[dict]:
    if status and status != "all":
        rows = db.query(
            "SELECT * FROM quests WHERE user_id=? AND status=? ORDER BY id DESC LIMIT ?",
            (user_id, status, limit))
    else:
        rows = db.query(
            "SELECT * FROM quests WHERE user_id=? ORDER BY id DESC LIMIT ?", (user_id, limit))
    return [serialize(row) for row in rows]


def get_quest(user_id: int, quest_id: int) -> dict | None:
    row = db.query_one("SELECT * FROM quests WHERE id=? AND user_id=?", (quest_id, user_id))
    return serialize(row) if row else None


def _raw_quest(user_id: int, quest_id: int):
    return db.query_one("SELECT * FROM quests WHERE id=? AND user_id=?", (quest_id, user_id))


def _generated_today(user_id: int, kind: str) -> int:
    row = db.query_one(
        "SELECT COUNT(*) AS n FROM quests WHERE user_id=? AND kind=? AND substr(created_at,1,10)=?",
        (user_id, kind, _today()),
    )
    return int(row["n"]) if row else 0


def _has_open(user_id: int, kind: str) -> int:
    row = db.query_one(
        """SELECT COUNT(*) AS n FROM quests
            WHERE user_id=? AND kind=? AND status IN ('available','active')""",
        (user_id, kind),
    )
    return int(row["n"]) if row else 0


def generate_one(user_id: int, domain: str, kind: str = "daily",
                 use_model: bool = True, salt: str = "",
                 deadline: float | None = None) -> dict | None:
    with _generation_lock(user_id):
        return _generate_one_locked(user_id, domain, kind, use_model, salt, deadline)


def _generate_one_locked(user_id: int, domain: str, kind: str, use_model: bool,
                         salt: str, deadline: float | None) -> dict | None:
    snapshot = player.snapshot(user_id)
    model = player.get_model(user_id)
    level = snapshot["level"]
    unlocked_tags = set(snapshot["skillEffects"]["tags"]) | {"base", "explore"}
    offset = int(model["difficulty_offset"].get(domain, 0) or 0)

    spec = quest_generator.generate(
        user_id, domain, kind, level, model, snapshot, unlocked_tags,
        difficulty_offset=offset, use_model=use_model, salt=salt, deadline=deadline)
    if spec is None:
        return None
    quest_id = insert_quest(user_id, spec)
    return get_quest(user_id, quest_id)


def ensure_daily_set(user_id: int, use_model: bool = True) -> list[dict]:
    """Guarantee the player has today's quests (§41 / §15).

    The whole set is generated under one lock and one clock: the lock so a
    double-tap cannot produce two sets, and the clock so a set is bounded by
    `AI_QUEST_BUDGET` no matter how slow the model is. Quests past the budget
    are rendered locally rather than dropped — the player always leaves with a
    full set.
    """
    with _generation_lock(user_id):
        expire_stale(user_id)
        snapshot = player.snapshot(user_id)
        level = snapshot["level"]
        extra_slots = snapshot["skillEffects"]["questSlots"]
        deadline = time.monotonic() + config.AI_QUEST_BUDGET if use_model else None

        existing = open_quests(user_id)
        open_by_domain = {"physical": 0, "academic": 0, "passion": 0}
        for quest in existing:
            if quest["kind"] == "daily":
                open_by_domain[quest["domain"]] += 1

        created: list[dict] = []
        for domain in ("physical", "academic", "passion"):
            if open_by_domain[domain] == 0:
                quest = _generate_one_locked(user_id, domain, "daily", use_model, "", deadline)
                if quest:
                    created.append(quest)

        if extra_slots > 0:
            attrs = snapshot["attributes"]
            weakest = sorted(("physical", "academic", "passion"), key=lambda d: attrs[d])[0]
            for index in range(extra_slots):
                if _has_open(user_id, "daily") >= DAILY_BASE_SLOTS + extra_slots:
                    break
                quest = _generate_one_locked(user_id, weakest, "daily", use_model,
                                             f"bonus{index}", deadline)
                if quest:
                    created.append(quest)

        if skills_mod.has_capability(level, "weekly_quests") and _has_open(user_id, "weekly") == 0:
            attrs = snapshot["attributes"]
            weakest = sorted(("physical", "academic", "passion"), key=lambda d: attrs[d])[0]
            quest = _generate_one_locked(user_id, weakest, "weekly", use_model, "", deadline)
            if quest:
                created.append(quest)

        return created


def starter_quests(user_id: int) -> list[dict]:
    """First-time experience (§41): one per domain plus a teaching first mission."""
    created = []
    tutorial = {
        "templateKey": "tutorial_first_mission",
        "title": "First Mission: 15 minutes that improve you",
        "description": (
            "Do one 15-minute activity that makes you better physically, academically or "
            "creatively. Anything counts as long as it's real. Then come back and tell me "
            "what you did — that's how every quest in LifeQuest works."),
        "domain": "passion",
        "kind": "daily",
        "difficulty": 1,
        "estimatedTime": 15,
        "xpReward": xp_mod.quest_xp_reward(1, "daily", 1, 15),
        "requirements": [],
        "proofType": ["text", "photo"],
        "skills": [],
        "levelRequirement": 1,
        "aiEvaluationCriteria": ["Describes a real 15-minute activity",
                                 "Says what it improved"],
        "completionCriteria": "A 15-minute activity described in your own words",
        "source": "system",
    }
    # Domain quests first, so the tutorial doesn't occupy the passion slot.
    created.extend(q for q in ensure_daily_set(user_id, use_model=False) if q)
    quest_id = insert_quest(user_id, tutorial)
    created.insert(0, get_quest(user_id, quest_id))
    return created


def start(user_id: int, quest_id: int) -> dict | None:
    quest = get_quest(user_id, quest_id)
    if not quest or quest["status"] not in ("available", "active"):
        return None
    db.execute(
        "UPDATE quests SET status='active', started_at=COALESCE(started_at, ?) WHERE id=?",
        (_now(), quest_id),
    )
    return get_quest(user_id, quest_id)


def abandon(user_id: int, quest_id: int) -> dict | None:
    quest = get_quest(user_id, quest_id)
    if not quest or quest["status"] in ("verified", "expired", "abandoned"):
        return None
    db.execute("UPDATE quests SET status='abandoned' WHERE id=?", (quest_id,))
    return get_quest(user_id, quest_id)


# --------------------------------------------------------------- submission --
def submit(user_id: int, quest_id: int, payload: dict) -> dict:
    """The core loop step: evidence in, evaluated progression out."""
    raw = _raw_quest(user_id, quest_id)
    if raw is None:
        return {"ok": False, "error": "not_found", "message": "Quest not found."}

    quest = dict(raw)
    quest["evaluation_criteria"] = json.loads(quest.get("evaluation_criteria") or "[]")
    proof_types = json.loads(quest.get("proof_types") or "[]")

    if quest["status"] == "verified":
        return {"ok": False, "error": "already_verified",
                "message": "This quest has already been verified."}

    gate = anticheat.gate_submission(user_id, quest, payload)
    if not gate["allowed"]:
        return {"ok": False, "error": gate["reason"], "message": gate["message"]}

    snapshot = player.snapshot(user_id)
    model = player.get_model(user_id)
    context = (f"Level {snapshot['level']}, attributes {snapshot['attributes']}, "
               f"subjects {model.get('academic_subjects')}, passions "
               f"{model.get('passion_interests')}")

    assessment = proof_evaluator.evaluate(
        quest, payload, gate.get("signals", []), proof_types, context)

    submitted_at = _now()
    digest = gate.get("digest", "")
    verdict = assessment["verdict"]

    if verdict != "verified":
        db.execute("UPDATE quests SET status='submitted' WHERE id=?", (quest_id,))
        db.insert(
            """INSERT INTO quest_completions (user_id, quest_id, submitted_at, status, proof,
                                              proof_digest, assessment, xp_awarded,
                                              quality_multiplier, evaluator)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (user_id, quest_id, submitted_at, verdict, json.dumps(payload), digest,
             json.dumps(assessment), 0, assessment["qualityMultiplier"],
             assessment["evaluator"]),
        )
        guide_mod.record(user_id, "proof_evaluator", f"quest:{quest_id}",
                         assessment.get("feedback", ""), assessment["evaluator"])
        return {
            "ok": True,
            "verdict": verdict,
            "assessment": assessment,
            "xp": None,
            "quest": get_quest(user_id, quest_id),
            "message": assessment.get("feedback", ""),
        }

    # ---- verified: award XP and cascade every derived system -------------
    skill_keys = skills_mod.user_skill_keys(user_id)
    effects = skills_mod.aggregate_effects(skill_keys)
    skill_bonus = effects["xp_bonus"].get(quest["domain"], 0.0)
    quality = max(assessment["qualityMultiplier"], effects["quality_floor"] or 0.0)

    award = anticheat.finalise_award(
        user_id, quest, int(quest["xp_reward"]), quality, snapshot["level"], skill_bonus)

    db.execute(
        "UPDATE quests SET status='verified', completed_at=? WHERE id=?",
        (submitted_at, quest_id),
    )
    db.insert(
        """INSERT INTO quest_completions (user_id, quest_id, submitted_at, completed_at, status,
                                          proof, proof_digest, assessment, xp_awarded,
                                          quality_multiplier, evaluator)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (user_id, quest_id, submitted_at, submitted_at, "verified", json.dumps(payload),
         digest, json.dumps(assessment), award["xp"], quality, assessment["evaluator"]),
    )

    xp_delta = player.award_xp(user_id, quest["domain"], award["xp"],
                              f"quest:{quest['template_key']}", quest_id)
    streak = player.touch_activity(user_id)
    derived = player.refresh_derived(user_id)

    chain_result = _advance_chain(user_id, quest)
    passion_result = _track_passion(user_id, quest, payload)
    difficulty_report = _update_difficulty(user_id, model)

    new_snapshot = player.snapshot(user_id)
    notify = []
    if xp_delta["leveledUp"]:
        notify.append(f"Level {xp_delta['levelAfter']} reached.")
    for achievement in derived["achievements"]:
        notify.append(f"Achievement unlocked: {achievement['name']}.")
    for skill in derived["skills"]:
        notify.append(f"Skill unlocked: {skill['name']}.")
    for message in notify:
        db.execute(
            "INSERT INTO notifications (user_id, kind, body, created_at) VALUES (?,?,?,?)",
            (user_id, "progress", message, _now()),
        )

    return {
        "ok": True,
        "verdict": "verified",
        "assessment": assessment,
        "xp": {
            "awarded": award["xp"],
            "base": award["base"],
            "quality": award["quality"],
            "repetition": award["repetition"],
            "skillBonus": award["skillBonus"],
            "capped": award["capped"],
            "dailyCap": award["dailyCap"],
            "domain": quest["domain"],
            "leveledUp": xp_delta["leveledUp"],
            "levelBefore": xp_delta["levelBefore"],
            "levelAfter": xp_delta["levelAfter"],
        },
        "streak": streak,
        "achievements": derived["achievements"],
        "skills": derived["skills"],
        "chain": chain_result,
        "passionPath": passion_result,
        "difficulty": difficulty_report,
        "snapshot": new_snapshot,
        "quest": get_quest(user_id, quest_id),
        "message": assessment.get("feedback", ""),
    }


def _update_difficulty(user_id: int, model: dict) -> dict:
    result = difficulty_mod.evaluate(user_id, model.get("difficulty_offset", {}))
    player.save_model(user_id, {"difficulty_offset": result["offsets"]})
    return result["reports"]


def _track_passion(user_id: int, quest: dict, payload: dict) -> dict | None:
    """Passion work feeds the passion-path model (§4).

    Exploration quests are the primary source, but any passion quest where the
    player names the field they worked in counts — that is exactly the signal
    the recommendation engine needs.
    """
    if quest["domain"] != "passion":
        return None

    name = (payload.get("structured") or {}).get("field") or payload.get("pathName")
    if not name:
        return None
    name = str(name).strip()[:60]
    if not name:
        return None

    interest = payload.get("structured", {}).get("interest")
    try:
        interest_score = max(0.0, min(1.0, float(interest) / 5.0)) if interest else 0.5
    except (TypeError, ValueError):
        interest_score = 0.5

    row = db.query_one(
        "SELECT * FROM passion_paths WHERE user_id=? AND name=? COLLATE NOCASE", (user_id, name))
    if row:
        db.execute(
            """UPDATE passion_paths SET sessions=sessions+1, interest_score=?, updated_at=?
                WHERE id=?""",
            (round((float(row["interest_score"]) + interest_score) / 2, 3), _now(), row["id"]),
        )
        path_id = row["id"]
    else:
        path_id = db.insert(
            """INSERT INTO passion_paths (user_id, name, status, interest_score, sessions,
                                          notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (user_id, name, "exploring", interest_score, 1,
             (payload.get("link") or "")[:500], _now(), _now()),
        )

    # A path the player keeps returning to and rates highly graduates to 'pursuing'.
    row = db.query_one("SELECT * FROM passion_paths WHERE id=?", (path_id,))
    if row and int(row["sessions"]) >= 3 and float(row["interest_score"]) >= 0.6:
        db.execute("UPDATE passion_paths SET status='pursuing' WHERE id=?", (path_id,))
        model = player.get_model(user_id)
        interests = model.get("passion_interests") or []
        if row["name"] not in interests:
            player.save_model(user_id, {"passion_interests": interests + [row["name"]]})

    return {"id": path_id, "name": name, "interest": interest_score}


# ------------------------------------------------------------------ chains --
def chain_state(user_id: int) -> list[dict]:
    rows = db.query("SELECT * FROM chain_progress WHERE user_id=?", (user_id,))
    out = []
    for row in rows:
        definition = catalog.chain_definition(row["chain_key"])
        if not definition:
            continue
        out.append({
            "key": row["chain_key"],
            "name": definition["name"],
            "domain": definition["domain"],
            "description": definition["description"],
            "step": int(row["step"]),
            "totalSteps": len(definition["steps"]),
            "status": row["status"],
            "steps": [
                {"index": index + 1, "title": step["title"],
                 "done": index < int(row["step"])}
                for index, step in enumerate(definition["steps"])
            ],
        })
    return out


def available_chains(user_id: int, level: int) -> list[dict]:
    started = {row["chain_key"] for row in db.query(
        "SELECT chain_key FROM chain_progress WHERE user_id=?", (user_id,))}
    out = []
    for key, definition in catalog.CHAINS.items():
        min_level = definition["min_level"]
        if key == "creation" and not skills_mod.has_capability(level, "quest_chains"):
            continue
        out.append({
            "key": key,
            "name": definition["name"],
            "domain": definition["domain"],
            "description": definition["description"],
            "steps": len(definition["steps"]),
            "minLevel": min_level,
            "locked": level < min_level,
            "started": key in started,
        })
    return out


def start_chain(user_id: int, chain_key: str) -> dict:
    definition = catalog.chain_definition(chain_key)
    if not definition:
        return {"ok": False, "message": "Unknown questline."}
    snapshot = player.snapshot(user_id)
    if snapshot["level"] < definition["min_level"]:
        return {"ok": False,
                "message": f"Questlines unlock at level {definition['min_level']}."}
    existing = db.query_one(
        "SELECT * FROM chain_progress WHERE user_id=? AND chain_key=?", (user_id, chain_key))
    if existing and existing["status"] == "active":
        return {"ok": False, "message": "That questline is already running."}

    db.execute(
        """INSERT INTO chain_progress (user_id, chain_key, step, status, started_at, updated_at)
           VALUES (?,?,0,'active',?,?)
           ON CONFLICT(user_id, chain_key) DO UPDATE SET step=0, status='active', updated_at=?""",
        (user_id, chain_key, _now(), _now(), _now()),
    )
    quest = _spawn_chain_step(user_id, chain_key, 0)
    return {"ok": True, "quest": quest, "chain": chain_key}


def _spawn_chain_step(user_id: int, chain_key: str, step_index: int) -> dict | None:
    definition = catalog.chain_definition(chain_key)
    if not definition or step_index >= len(definition["steps"]):
        return None
    step = definition["steps"][step_index]
    model = player.get_model(user_id)
    snapshot = player.snapshot(user_id)
    rng_tokens = {
        "subject": (model.get("academic_subjects") or ["your main subject"])[0],
        "activity": (model.get("physical_activities") or ["walking"])[0],
        "passion": (model.get("passion_interests") or model.get("passion_curious")
                    or ["your passion path"])[0],
        "curious": (model.get("passion_curious") or ["something new"])[0],
    }
    spec = {
        "templateKey": f"chain:{chain_key}:{step_index + 1}",
        "title": catalog.fill(step["title"], rng_tokens),
        "description": catalog.fill(step["description"], rng_tokens),
        "domain": definition["domain"],
        "kind": step["kind"],
        "difficulty": step["difficulty"],
        "estimatedTime": step["minutes"],
        "xpReward": xp_mod.quest_xp_reward(
            step["difficulty"], step["kind"], snapshot["level"], step["minutes"]),
        "requirements": [],
        "proofType": step["proof_types"],
        "skills": [],
        "levelRequirement": definition["min_level"],
        "aiEvaluationCriteria": [step["completion"]],
        "completionCriteria": catalog.fill(step["completion"], rng_tokens),
        "source": "system",
        "chainKey": chain_key,
        "chainStep": step_index + 1,
    }
    quest_id = insert_quest(user_id, spec)
    return get_quest(user_id, quest_id)


def _advance_chain(user_id: int, quest: dict) -> dict | None:
    chain_key = quest.get("chain_key")
    if not chain_key:
        return None
    definition = catalog.chain_definition(chain_key)
    if not definition:
        return None
    row = db.query_one(
        "SELECT * FROM chain_progress WHERE user_id=? AND chain_key=?", (user_id, chain_key))
    if not row:
        return None

    step = int(quest.get("chain_step") or 0)
    new_step = max(int(row["step"]), step)
    total = len(definition["steps"])
    if new_step >= total:
        db.execute(
            "UPDATE chain_progress SET step=?, status='complete', updated_at=? "
            "WHERE user_id=? AND chain_key=?",
            (new_step, _now(), user_id, chain_key),
        )
        return {"key": chain_key, "complete": True, "step": new_step, "totalSteps": total,
                "nextQuest": None}

    db.execute(
        "UPDATE chain_progress SET step=?, updated_at=? WHERE user_id=? AND chain_key=?",
        (new_step, _now(), user_id, chain_key),
    )
    next_quest = _spawn_chain_step(user_id, chain_key, new_step)
    return {"key": chain_key, "complete": False, "step": new_step, "totalSteps": total,
            "nextQuest": next_quest}


# ---------------------------------------------------------- custom quests --
def create_custom(user_id: int, spec: dict) -> dict:
    snapshot = player.snapshot(user_id)
    level = snapshot["level"]
    if not skills_mod.has_capability(level, "custom_quests"):
        return {"ok": False, "message": "Custom quest creation unlocks at level 30."}

    title = str(spec.get("title") or "").strip()[:120]
    description = str(spec.get("description") or "").strip()[:800]
    if len(title) < 4 or len(description) < 10:
        return {"ok": False, "message": "Give the quest a title and a real objective."}

    domain = spec.get("domain")
    if domain not in ("physical", "academic", "passion"):
        return {"ok": False, "message": "Pick a domain."}

    concerns = safety.scan(f"{title} {description}")
    if concerns:
        return {"ok": False, "message": safety.redirect_message(concerns)}

    try:
        difficulty = max(1, min(5, int(spec.get("difficulty", 2))))
        minutes = max(5, min(1200, int(spec.get("estimatedTime", 30))))
    except (TypeError, ValueError):
        return {"ok": False, "message": "Difficulty and time must be numbers."}

    kind = spec.get("kind", "daily")
    if kind not in ("daily", "weekly", "milestone", "epic"):
        kind = "daily"
    if kind == "epic" and not skills_mod.has_capability(level, "epic_chains"):
        kind = "milestone"

    model = player.get_model(user_id)
    review = guide_mod.review_custom_quest(
        {"title": title, "description": description, "difficulty": difficulty,
         "estimatedTime": minutes, "kind": kind}, level, model)
    if not review["accepted"]:
        return {"ok": False, "message": review["message"]}

    kind = review.get("suggestedKind", kind)
    quest_spec = {
        "templateKey": "custom",
        "title": title,
        "description": description,
        "domain": domain,
        "kind": kind,
        "difficulty": difficulty,
        "estimatedTime": minutes,
        "xpReward": xp_mod.quest_xp_reward(difficulty, kind, level, minutes),
        "requirements": [],
        "proofType": spec.get("proofType") or ["text", "photo"],
        "skills": [],
        "levelRequirement": level,
        "aiEvaluationCriteria": ["Matches the objective the player defined",
                                 "Shows genuine effort"],
        "completionCriteria": str(spec.get("completionCriteria") or description)[:300],
        "source": "user",
    }

    created = []
    if review["phases"]:
        for index, phase in enumerate(review["phases"], start=1):
            child = dict(quest_spec)
            child.update({
                "title": f"{title} · {phase['name']}",
                "description": phase["description"],
                "estimatedTime": max(15, minutes // len(review["phases"])),
                "difficulty": max(1, difficulty - 1),
                "chainStep": index,
                "xpReward": xp_mod.quest_xp_reward(
                    max(1, difficulty - 1), kind, level, max(15, minutes // len(review["phases"]))),
            })
            created.append(get_quest(user_id, insert_quest(user_id, child)))
    else:
        created.append(get_quest(user_id, insert_quest(user_id, quest_spec)))

    return {"ok": True, "quests": created, "review": review}


def review_only(user_id: int, spec: dict) -> dict:
    snapshot = player.snapshot(user_id)
    model = player.get_model(user_id)
    return guide_mod.review_custom_quest(spec, snapshot["level"], model)
