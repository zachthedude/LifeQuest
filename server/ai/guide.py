"""AI module 5 — The Guide (§11, §22).

VERA is the player's mentor. Consistent personality: observant, direct, and
specific. She reads the player's actual history and never says "great job!".

Every reply is grounded in a locally computed briefing, so the Guide works with
no model configured — the model, when present, only changes the prose, never the
facts.
"""

from __future__ import annotations

import re

from .. import db
from ..game import safety
from .provider import get_provider

GUIDE_NAME = "VERA"

SYSTEM = (
    "You are VERA, the guide inside LifeQuest — an RPG where the quests are real "
    "actions in the player's life.\n"
    "Personality: observant, direct, specific, quietly encouraging. You have read the "
    "player's whole history and you refer to it concretely.\n"
    "Hard rules:\n"
    "- Never open with praise or filler ('Great job!', 'I'd be happy to'). Lead with the "
    "observation that matters.\n"
    "- Ground every claim in the briefing you are given. Never invent numbers.\n"
    "- Physical guidance is about capability and wellbeing, never appearance, weight or "
    "training to exhaustion. Never suggest sleep deprivation or anything unsafe.\n"
    "- 2-5 sentences unless the player asks for depth. No bullet lists unless asked.\n"
    "- Address the player as 'you'. Do not roleplay actions or use asterisks."
)


def briefing(user_id: int, snapshot: dict, profile: dict, report: dict,
             quests: list[dict]) -> str:
    """The factual context every reply is built on."""
    attrs = snapshot["attributes"]
    xp = snapshot["xp"]
    streak = snapshot["streak"]
    inactivity = report["daysSinceActivity"]
    perf = report["questPerformance"]

    lines = [
        f"Level {snapshot['level']} ({snapshot['title']}), "
        f"{xp['xpIntoLevel']}/{xp['xpForNextLevel']} XP toward level {snapshot['level'] + 1} "
        f"({xp['percent']}%)",
        f"Attributes: physical {attrs['physical']}, academic {attrs['academic']}, "
        f"passion {attrs['passion']}, overall {attrs['overall']}",
        f"Streak: {streak['current']} days (best {streak['best']}), "
        f"consistency {streak['consistency']}%",
        f"Quests verified: {snapshot['questCounts']['verified']}, "
        f"active now: {snapshot['questCounts']['active']}",
    ]
    for domain, days in inactivity.items():
        if days is None:
            lines.append(f"{domain}: no activity ever recorded")
        elif days > 0:
            lines.append(f"{domain}: last active {days} days ago")
        else:
            lines.append(f"{domain}: active today")
    for domain, stats in perf.items():
        if stats.get("successRate") is not None:
            lines.append(f"{domain} success rate: {stats['successRate']}% "
                         f"over {stats['attempts']} attempts")
    if quests:
        lines.append("Open quests: " + "; ".join(
            f"[{q['domain']}] {q['title']} (+{q['xpReward']} XP)" for q in quests[:6]))
    else:
        lines.append("Open quests: none")

    milestone = snapshot["milestones"]["next"]
    if milestone:
        needed = milestone["level"] - snapshot["level"]
        lines.append(f"Next milestone: level {milestone['level']} — {milestone['name']} "
                     f"({needed} levels away, unlocks: {milestone['description']})")
    for insight in report["insights"][:4]:
        lines.append(f"Insight: {insight['title']} — {insight['body']}")
    return "\n".join(lines)


# ------------------------------------------------------------------ intents --
INTENTS = [
    ("today", r"(what should i do|what.*today|where do i start|next quest|what.*next)"),
    ("stuck_level", r"(not level(l)?ing|why.*(stuck|no progress)|why am i not|slow progress)"),
    ("struggling", r"(struggl|too hard|can'?t do|failing|overwhelm|burn(ed|t) out)"),
    ("harder", r"(harder|too easy|more challeng|push me|bored)"),
    ("explore", r"(new passion|explore|try something|don'?t know what i (like|love)|discover)"),
    ("weakest", r"(weakest|worst at|behind|neglect|weak spot)"),
    ("progress", r"(how am i doing|progress|improving|stats|analytics)"),
]


def classify(message: str) -> str:
    text = (message or "").lower()
    for intent, pattern in INTENTS:
        if re.search(pattern, text):
            return intent
    return "general"


def local_answer(intent: str, snapshot: dict, report: dict, quests: list[dict],
                 message: str = "") -> str:
    attrs = snapshot["attributes"]
    ranked = sorted(("physical", "academic", "passion"), key=lambda d: attrs[d])
    weakest = ranked[0]
    xp = snapshot["xp"]

    if intent == "today":
        if quests:
            listed = "; ".join(f"{q['title']} (+{q['xpReward']} XP)" for q in quests[:3])
            return (f"You have {len(quests)} open quests. Start with: {listed}. "
                    f"If you only do one, make it the {weakest} one — that's where your "
                    f"character has the most room to move.")
        return ("You have no open quests. Generate today's set from the Quests screen and "
                f"lead with {weakest} — it's your thinnest attribute right now.")

    if intent == "stuck_level":
        remaining = xp["xpRemaining"]
        recent = sum(day["total"] for day in report["xpOverTime"][-7:])
        pace = recent / 7 if recent else 0
        if pace <= 0:
            return (f"You need {remaining:,} more XP to reach level {snapshot['level'] + 1}, "
                    f"and you've earned nothing in the last seven days. The curve isn't the "
                    f"problem — the input is. One quest today restarts it.")
        days = max(1, round(remaining / max(pace, 1)))
        return (f"You need {remaining:,} XP for level {snapshot['level'] + 1}. Over the last "
                f"week you've averaged {pace:.0f} XP a day, which puts that level about "
                f"{days} days out. Levels get deliberately longer as you climb — the way to "
                f"speed it up is harder quests, not more of the same ones.")

    if intent == "struggling":
        return ("Then the quest is sized wrong, not you. I've noted it — your next objective "
                "in that domain will be split into three smaller steps, and difficulty will "
                "step down until your success rate recovers. Abandon the current one without "
                "penalty if it's blocking you.")

    if intent == "harder":
        return ("Noted — I'll raise difficulty on your next generation. If you want it "
                "immediately, take a milestone quest instead of a daily: they're worth far "
                "more XP and they ask for real evidence rather than a session log.")

    if intent == "explore":
        curious = "a field you've never tried"
        return (f"Then take an exploration quest: 30 minutes inside {curious}, followed by "
                f"three questions about what held your attention and what didn't. Exploration "
                f"quests are cheap on purpose — you're collecting evidence about yourself, "
                f"not committing to anything.")

    if intent == "weakest":
        return (f"{weakest.capitalize()}, at {attrs[weakest]:.0f}. Your strongest is "
                f"{ranked[-1]} at {attrs[ranked[-1]]:.0f}. That's not a failure — it's the "
                f"cheapest progress available to you, because early points in a domain come "
                f"faster than late ones.")

    if intent == "progress":
        insight = report["insights"][0]["body"] if report["insights"] else ""
        return (f"Level {snapshot['level']}, {xp['percent']}% into the next one. Overall "
                f"attribute {attrs['overall']:.0f}, consistency "
                f"{snapshot['streak']['consistency']:.0f}%. {insight}")

    if report["insights"]:
        primary = report["insights"][0]
        return (f"{primary['title']}. {primary['body']} Ask me for today's quests and I'll "
                f"point you at the highest-value one.")
    return ("I'm tracking your progression across all three domains. Ask me what to do today, "
            "why your level is moving slowly, or what you're weakest at.")


def answer(user_id: int, message: str, snapshot: dict, profile: dict,
           report: dict, quests: list[dict]) -> dict:
    """Answer a player question. Model-backed when available, local otherwise."""
    concerns = safety.scan(message)
    if concerns:
        response = safety.redirect_message(concerns)
        _record(user_id, "guide", message, response, "safety")
        return {"reply": response, "provider": "safety", "intent": "unsafe"}

    intent = classify(message)
    fallback = local_answer(intent, snapshot, report, quests, message)

    provider = get_provider()
    if provider.available:
        context = briefing(user_id, snapshot, profile, report, quests)
        history = _recent_history(user_id)
        prompt = (
            f"PLAYER BRIEFING\n{context}\n\n"
            + (f"RECENT CONVERSATION\n{history}\n\n" if history else "")
            + f"PLAYER SAYS\n{message}\n\n"
            "Reply as VERA. Use the briefing's real numbers."
        )
        reply = provider.complete_text(SYSTEM, prompt, max_tokens=600)
        if reply:
            reply = reply.strip()
            if reply and safety.is_safe(reply):
                _record(user_id, "guide", message, reply, provider.name)
                return {"reply": reply, "provider": provider.name, "intent": intent}

    _record(user_id, "guide", message, fallback, "local")
    return {"reply": fallback, "provider": "local", "intent": intent}


def recommendations(snapshot: dict, report: dict, quests: list[dict]) -> list[str]:
    """The '→' list on the Guide screen."""
    out: list[str] = []
    attrs = snapshot["attributes"]
    ranked = sorted(("physical", "academic", "passion"), key=lambda d: attrs[d])
    inactivity = report["daysSinceActivity"]

    for quest in quests[:2]:
        out.append(f"{quest['title']} (+{quest['xpReward']} {quest['domain']} XP)")

    stale = [d for d, days in inactivity.items() if days is not None and days >= 4]
    if stale:
        out.append(f"Restart {stale[0]} — nothing logged there for {inactivity[stale[0]]} days")
    elif not quests:
        out.append(f"Generate today's quests, leading with {ranked[0]}")

    milestone = snapshot["milestones"]["next"]
    if milestone:
        out.append(f"Push toward level {milestone['level']} to unlock {milestone['name']}")
    return out[:4]


def briefing_summary(snapshot: dict, report: dict) -> str:
    """The headline paragraph on the Guide screen."""
    attrs = snapshot["attributes"]
    ranked = sorted(("physical", "academic", "passion"), key=lambda d: attrs[d])
    strongest, weakest = ranked[-1], ranked[0]
    inactivity = report["daysSinceActivity"]
    stale_days = inactivity.get(weakest)

    if attrs[strongest] <= 0:
        return ("Your character is at the starting line — no XP recorded yet. Complete one "
                "quest in any domain and I'll have something real to analyse. The first one "
                "is deliberately small.")

    parts = [f"You're making the strongest progress in {strongest} "
             f"({attrs[strongest]:.0f})."]
    if stale_days is None:
        parts.append(f"{weakest.capitalize()} has never been touched — that's the biggest "
                     f"single gap in your character.")
    elif stale_days >= 3:
        parts.append(f"{weakest.capitalize()} has been inactive for {stale_days} days.")
    else:
        parts.append(f"{weakest.capitalize()} is your thinnest attribute at {attrs[weakest]:.0f}.")

    consistency = snapshot["streak"]["consistency"]
    parts.append(f"Consistency is at {consistency:.0f}% over the last four weeks.")
    return " ".join(parts)


def _recent_history(user_id: int, limit: int = 4) -> str:
    rows = db.query(
        """SELECT interaction, response FROM ai_interactions
            WHERE user_id=? AND module='guide' ORDER BY id DESC LIMIT ?""",
        (user_id, limit),
    )
    entries = []
    for row in reversed(rows):
        entries.append(f"Player: {row['interaction'][:200]}\nVERA: {row['response'][:300]}")
    return "\n".join(entries)


def history(user_id: int, limit: int = 40) -> list[dict]:
    rows = db.query(
        """SELECT id, interaction, response, provider, created_at FROM ai_interactions
            WHERE user_id=? AND module='guide' ORDER BY id DESC LIMIT ?""",
        (user_id, limit),
    )
    return [
        {"id": row["id"], "message": row["interaction"], "reply": row["response"],
         "provider": row["provider"], "createdAt": row["created_at"]}
        for row in reversed(rows)
    ]


def _record(user_id: int, module: str, interaction: str, response: str, provider: str) -> None:
    db.execute(
        """INSERT INTO ai_interactions (user_id, module, interaction, response, provider, created_at)
           VALUES (?,?,?,?,?,datetime('now'))""",
        (user_id, module, interaction[:2000], response[:4000], provider),
    )


def record(user_id: int, module: str, interaction: str, response: str, provider: str) -> None:
    _record(user_id, module, interaction, response, provider)


def review_custom_quest(spec: dict, level: int, model: dict) -> dict:
    """AI quest review for player-created quests (§43, §44)."""
    concerns = safety.scan(f"{spec.get('title','')} {spec.get('description','')}")
    if concerns:
        return {
            "accepted": False,
            "message": safety.redirect_message(concerns),
            "suggestedDifficulty": None,
            "phases": [],
        }

    difficulty = max(1, min(5, int(spec.get("difficulty", 2))))
    minutes = max(5, min(1200, int(spec.get("estimatedTime", 30))))
    notes: list[str] = []
    phases: list[dict] = []

    # Is this far above the player's current level?
    expected_ceiling = 2 + level // 15
    if difficulty > expected_ceiling + 1:
        notes.append(
            f"This quest is significantly harder than your current level "
            f"({difficulty} stars at level {level}). I recommend splitting it into phases.")
        phases = [
            {"name": "Phase 1 — Research",
             "description": f"Understand what '{spec.get('title')}' actually requires before "
                            f"starting. Gather references and write down the plan."},
            {"name": "Phase 2 — Build",
             "description": "Do the core work. Aim for a rough, complete version rather than "
                            "a polished fragment."},
            {"name": "Phase 3 — Test and document",
             "description": "Check it works, fix the worst problem, and write up the result."},
        ]
    if minutes > 240 and spec.get("kind") == "daily":
        notes.append("Over four hours is a milestone quest, not a daily. I've reclassified it.")

    return {
        "accepted": True,
        "message": " ".join(notes) or "This looks well-scoped for your level.",
        "suggestedDifficulty": difficulty,
        "suggestedKind": "milestone" if minutes > 240 else spec.get("kind", "daily"),
        "phases": phases,
    }
