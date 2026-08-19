"""AI module 2 — Proof Evaluator (§10, §12).

Evaluates submitted evidence on five axes: relevance, completion evidence,
quality, reflection, and authenticity signals. It never asserts that something
is fake — it reports confidence and asks for more information when the evidence
doesn't support the claim.

The heuristic evaluator is the floor: it always runs, produces a full
assessment, and owns the authenticity signals. When a model is configured its
rubric judgement is blended in for relevance/completion/quality/reflection, but
the server-side anti-cheat signals are applied afterwards and cannot be talked
out of by anything the player wrote.
"""

from __future__ import annotations

import re
from ..game import safety
from .provider import get_provider

ASSESSMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "relevance": {"type": "integer"},
        "completion": {"type": "integer"},
        "quality": {"type": "integer"},
        "reflection": {"type": "integer"},
        "verdict": {"type": "string", "enum": ["verified", "needs_info", "rejected"]},
        "feedback": {"type": "string"},
        "followUpQuestion": {"type": "string"},
    },
    "required": ["relevance", "completion", "quality", "reflection", "verdict", "feedback",
                 "followUpQuestion"],
    "additionalProperties": False,
}

SYSTEM = (
    "You review evidence that a real-world quest was completed.\n"
    "Score four axes from 0-100: relevance (does the evidence match the quest), "
    "completion (does it show the task was actually done), quality (was meaningful "
    "effort made), reflection (does the writing show understanding).\n"
    "Verdicts: 'verified' when the evidence reasonably supports completion, "
    "'needs_info' when it is plausible but too thin to tell, 'rejected' only when the "
    "evidence clearly describes something else.\n"
    "Never accuse the player of lying and never claim certainty that something is "
    "fabricated. If unconvinced, ask one specific question instead.\n"
    "Feedback is 1-2 sentences, direct, addressed to the player, no praise padding."
)

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at",
    "by", "from", "as", "is", "are", "was", "were", "be", "been", "it", "this", "that",
    "you", "your", "yours", "i", "me", "my", "we", "our", "they", "them", "then", "than",
    "so", "if", "not", "no", "do", "did", "does", "done", "have", "has", "had", "will",
    "would", "can", "could", "should", "one", "some", "any", "all", "more", "most",
    "just", "about", "into", "out", "up", "down", "over", "after", "before", "its",
    "minutes", "minute", "quest", "today", "complete", "completed", "spend", "spent",
}

# Domain vocabularies. A quest and its evidence rarely share exact wording, so
# domain-consistent language counts as relevance signal alongside literal overlap.
_LEXICONS = {
    "physical": {
        "walk", "run", "ran", "jog", "swim", "swam", "cycle", "bike", "gym", "workout",
        "train", "session", "stretch", "mobility", "warmup", "cooldown", "rep", "set",
        "lap", "km", "mile", "step", "climb", "sport", "match", "game", "recovery",
        "rest", "sleep", "yoga", "pilate", "hike", "drill", "balance", "coordination",
        "pace", "distance", "endurance", "strength", "cardio", "row", "push", "pull",
        "squat", "plank", "hip", "shoulder", "ankle", "knee", "hamstring", "calf",
        "spine", "core", "breath", "sore", "tight", "loose", "posture", "route",
    },
    "academic": {
        "study", "read", "chapter", "book", "note", "problem", "exercise", "revision",
        "revise", "concept", "topic", "theory", "formula", "equation", "proof",
        "math", "maths", "mathematic", "physic", "chemistry", "biology", "history",
        "essay", "lecture", "course", "quiz", "test", "exam", "recall", "flashcard",
        "explain", "understood", "understand", "research", "source", "textbook",
        "solve", "learn", "learnt", "taught", "teach", "question", "answer", "summary",
        "summarise", "summarize", "paper", "article", "integral", "derivative",
        "vocabulary", "language", "translate", "definition", "example", "worked",
    },
    "passion": {
        "build", "built", "made", "make", "design", "sketch", "draw", "drew", "paint",
        "wrote", "write", "code", "program", "prototype", "project", "practise",
        "practice", "record", "photo", "song", "music", "instrument", "robot",
        "robotic", "circuit", "model", "video", "edit", "publish", "share", "feedback",
        "explore", "experiment", "create", "craft", "piece", "draft", "iteration",
        "camera", "shot", "chord", "scale", "layout", "colour", "color", "render",
        "servo", "motor", "sensor", "arduino", "print", "assemble", "tool", "material",
    },
}

_SUFFIXES = ("ings", "ing", "ies", "ied", "ed", "es", "s", "ly")


def _stem(word: str) -> str:
    """Crude suffix stripper — enough to make lexicon matching forgiving."""
    for suffix in _SUFFIXES:
        if len(word) > len(suffix) + 2 and word.endswith(suffix):
            trimmed = word[: -len(suffix)]
            if suffix in ("ies", "ied"):
                trimmed += "y"
            return trimmed
    return word

_DOMAIN_WORDS = {
    "physical": ("physical", "physically", "body", "movement", "fitness"),
    "academic": ("academic", "academically", "study", "learning", "mind"),
    "passion": ("passion", "creative", "creatively", "craft", "project"),
}

_REFLECTION_MARKERS = (
    "i learned", "i realised", "i realized", "i noticed", "i struggled", "i found",
    "next time", "harder than", "easier than", "surprised", "didn't expect",
    "did not expect", "went wrong", "worked well", "i understood", "i now",
    "the tricky part", "what helped", "i got stuck", "made sense",
)

_LOW_EFFORT = (
    "done", "did it", "finished", "completed it", "yes", "ok", "okay", "yep",
    "complete", "finished it", "did the thing", "n/a", "na", "-", ".",
)


def _tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9']+", (text or "").lower())
            if len(w) > 2 and w not in _STOPWORDS]


def _band(score: float) -> str:
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _combined_text(payload: dict) -> str:
    parts = [payload.get("text") or "", payload.get("reflection") or ""]
    structured = payload.get("structured") or {}
    for key, value in structured.items():
        parts.append(f"{key} {value}")
    return " ".join(str(p) for p in parts).strip()


def _relevant_lexicons(quest: dict) -> set[str]:
    """Which vocabularies count for this quest. A quest that explicitly spans
    domains (the tutorial, cross-domain challenges) accepts all of them."""
    text = (f"{quest.get('title','')} {quest.get('description','')} "
            f"{quest.get('completion_criteria','')}").lower()
    mentioned = {domain for domain, words in _DOMAIN_WORDS.items()
                 if any(word in text for word in words)}
    if len(mentioned) >= 2:
        return set().union(*_LEXICONS.values())
    return set(_LEXICONS.get(quest.get("domain", ""), set()))


def score_relevance(quest: dict, payload: dict) -> float:
    quest_terms = set(_tokens(
        f"{quest.get('title','')} {quest.get('description','')} "
        f"{quest.get('completion_criteria','')}"))
    proof_terms = set(_tokens(_combined_text(payload)))
    if not proof_terms:
        return 0.0
    if not quest_terms:
        return 60.0

    literal = quest_terms & proof_terms
    lexicon = _relevant_lexicons(quest)
    proof_stems = {_stem(word) for word in proof_terms}
    lexical = {stem for stem in proof_stems if stem in lexicon}
    lexical -= {_stem(word) for word in literal}
    weighted = len(literal) + 0.7 * len(lexical)
    ratio = weighted / max(3, min(len(quest_terms), 9))
    base = min(100.0, ratio * 110.0)

    # A link or file that exists is weak but real corroboration.
    if payload.get("link") or payload.get("files"):
        base = min(100.0, base + 12.0)

    # A logged duration close to the quest's own estimate, alongside a real
    # description, is evidence of the right activity even when the wording differs.
    structured = payload.get("structured") or {}
    estimated = int(quest.get("estimated_time") or 0)
    try:
        minutes = int(structured.get("minutes"))
    except (TypeError, ValueError):
        minutes = 0
    if minutes and estimated and minutes >= estimated * 0.5 and len(payload.get("text") or "") >= 30:
        base = min(100.0, base + 10.0)

    return round(base, 1)


def _has_video(payload: dict) -> bool:
    return any((f.get("contentType") or "").startswith("video/")
               for f in (payload.get("files") or []))


def score_completion(quest: dict, payload: dict, proof_types: list[str]) -> float:
    score = 25.0
    text = (payload.get("text") or "").strip()
    if len(text) >= 40:
        score += 25.0
    elif len(text) >= 15:
        score += 12.0

    structured = payload.get("structured") or {}
    if structured:
        score += 15.0
        minutes = structured.get("minutes")
        estimated = int(quest.get("estimated_time") or 0)
        try:
            minutes = int(minutes)
            if estimated and minutes >= estimated * 0.6:
                score += 15.0
            elif estimated and minutes < estimated * 0.25:
                score -= 15.0
        except (TypeError, ValueError):
            pass

    if "photo" in proof_types or "document" in proof_types:
        score += 20.0 if payload.get("files") else -12.0
    if "video" in proof_types:
        # Video is the strongest evidence the app can collect: it is filmed on
        # the spot rather than chosen from a library, so it is worth more than a
        # photo — but its absence is not punished as hard, because a player
        # without a working camera must still be able to complete the quest.
        score += 24.0 if _has_video(payload) else -6.0
    if "link" in proof_types:
        score += 15.0 if payload.get("link") else -8.0
    if "reflection" in proof_types:
        score += 12.0 if len(payload.get("reflection") or "") >= 40 else -10.0

    return round(max(0.0, min(100.0, score)), 1)


def score_quality(payload: dict) -> float:
    text = _combined_text(payload)
    stripped = text.strip().lower()
    if not stripped or stripped in _LOW_EFFORT:
        return 5.0

    words = _tokens(text)
    if not words:
        return 8.0

    length_score = min(45.0, len(words) * 1.6)
    unique_ratio = len(set(words)) / len(words)
    variety_score = unique_ratio * 25.0
    specificity = 0.0
    if re.search(r"\d", text):
        specificity += 12.0
    if re.search(r"\b[A-Z][a-z]{2,}\b", text):          # named things
        specificity += 8.0
    if len(re.findall(r"[.!?]", text)) >= 2:            # structured writing
        specificity += 6.0
    if payload.get("files") or payload.get("link"):
        specificity += 6.0

    return round(max(0.0, min(100.0, length_score + variety_score + specificity)), 1)


def score_reflection(payload: dict, required: bool) -> float:
    text = ((payload.get("reflection") or "") + " " + (payload.get("text") or "")).lower()
    if not text.strip():
        return 0.0 if required else 40.0
    hits = sum(1 for marker in _REFLECTION_MARKERS if marker in text)
    words = len(_tokens(text))
    score = min(60.0, hits * 22.0) + min(40.0, words * 1.1)
    return round(max(0.0, min(100.0, score)), 1)


def authenticity(payload: dict, signals: list[str]) -> tuple[float, list[str]]:
    """Returns (score 0-100, human-readable notes). Lower means more concerns."""
    score = 92.0
    notes: list[str] = []
    text = _combined_text(payload)

    if "duplicate_proof" in signals:
        score -= 45.0
        notes.append("This evidence is identical to a previous submission.")
    if "suspiciously_fast" in signals:
        score -= 25.0
        notes.append("The quest was submitted far faster than its estimated duration.")
    if "implausible_duration" in signals:
        score -= 20.0
        notes.append("The recorded time is much longer than the quest's scope.")

    words = _tokens(text)
    if len(words) < 5:
        score -= 25.0
        notes.append("There is very little detail to review.")
    elif len(set(words)) / max(1, len(words)) < 0.35:
        score -= 12.0
        notes.append("The description is highly repetitive.")

    return round(max(0.0, min(100.0, score)), 1), notes


def heuristic_assessment(quest: dict, payload: dict, signals: list[str],
                         proof_types: list[str]) -> dict:
    relevance = score_relevance(quest, payload)
    completion = score_completion(quest, payload, proof_types)
    quality = score_quality(payload)
    reflection_required = "reflection" in proof_types
    reflection = score_reflection(payload, reflection_required)
    auth_score, auth_notes = authenticity(payload, signals)

    weights = {"relevance": 0.32, "completion": 0.30, "quality": 0.22, "reflection": 0.16}
    composite = (relevance * weights["relevance"] + completion * weights["completion"]
                 + quality * weights["quality"] + reflection * weights["reflection"])
    confidence = round(composite * 0.75 + auth_score * 0.25, 1)

    if auth_score < 45 or relevance < 18 or completion < 22:
        verdict = "needs_info"
    elif confidence >= 58 and relevance >= 30:
        verdict = "verified"
    elif confidence >= 35:
        verdict = "needs_info"
    else:
        verdict = "needs_info"

    corroborated = bool(payload.get("files") or payload.get("link")
                        or (payload.get("structured") or {}).get("minutes"))
    if relevance < 10 and not corroborated and len(_tokens(_combined_text(payload))) >= 12:
        # Plenty written, none of it about this quest, and nothing corroborating it.
        verdict = "rejected"

    return {
        "relevance": relevance,
        "completion": completion,
        "quality": quality,
        "reflection": reflection,
        "authenticity": auth_score,
        "confidence": confidence,
        "verdict": verdict,
        "notes": auth_notes,
        "evaluator": "heuristic",
    }


def _quality_multiplier(assessment: dict) -> float:
    """Map an assessment onto the XP multiplier (0.55 - 1.15)."""
    composite = (assessment["relevance"] * 0.3 + assessment["completion"] * 0.3
                 + assessment["quality"] * 0.25 + assessment["reflection"] * 0.15)
    multiplier = 0.55 + (composite / 100.0) * 0.6
    if assessment["authenticity"] < 60:
        multiplier *= 0.7
    return round(max(0.4, min(1.15, multiplier)), 3)


def _feedback(quest: dict, assessment: dict) -> str:
    if assessment["verdict"] == "verified":
        if assessment["quality"] >= 75:
            return ("Strong evidence — specific, and it clearly maps to what the quest "
                    "asked for. Full credit.")
        if assessment["reflection"] < 35:
            return ("Verified. The evidence holds up, but there's little reflection here — "
                    "writing what changed is where most of the learning gets locked in.")
        return "Verified. The evidence lines up with what the quest asked for."
    if assessment["verdict"] == "rejected":
        return ("This describes something different from what the quest asked for. "
                "Re-read the completion criteria and submit again.")
    if assessment["relevance"] < 30:
        return ("The submitted proof doesn't clearly demonstrate completion of this quest. "
                "Tell me what you actually did and how it connects to the objective.")
    if assessment["completion"] < 40:
        return ("This is plausible but thin. Add the specifics — what you covered, how "
                "long it took, what the result was.")
    return ("Almost there. A little more detail on what you actually did would let me "
            "verify this.")


def _follow_up(quest: dict, assessment: dict, proof_types: list[str]) -> str:
    if assessment["verdict"] == "verified":
        return ""
    if "video" in proof_types:
        return "Record a short clip of a set — even ten seconds is enough to verify this."
    if "photo" in proof_types or "document" in proof_types:
        return "What did you produce, and can you attach it?"
    if assessment["reflection"] < 30 and "reflection" in proof_types:
        return "What was the hardest part, and what would you do differently next time?"
    return f"In one or two sentences: what did you actually do for '{quest.get('title','this quest')}'?"


def evaluate(quest: dict, payload: dict, signals: list[str], proof_types: list[str],
             player_context: str = "") -> dict:
    """Full evaluation. Always returns a complete assessment."""
    assessment = heuristic_assessment(quest, payload, signals, proof_types)

    provider = get_provider()
    if provider.available and len(_tokens(_combined_text(payload))) >= 3:
        prompt = (
            f"QUEST\nTitle: {quest.get('title','')}\n"
            f"Description: {quest.get('description','')}\n"
            f"Completion criteria: {quest.get('completion_criteria','')}\n"
            f"Estimated duration: {quest.get('estimated_time','?')} minutes\n"
            f"Reviewer checks: {'; '.join(quest.get('evaluation_criteria') or []) or 'none'}\n\n"
            f"PLAYER CONTEXT\n{player_context or 'none'}\n\n"
            f"SUBMITTED EVIDENCE\n"
            f"Description: {payload.get('text') or '(none)'}\n"
            f"Reflection: {payload.get('reflection') or '(none)'}\n"
            f"Link: {payload.get('link') or '(none)'}\n"
            f"Attachments: {len(payload.get('files') or [])}\n"
            f"Structured data: {payload.get('structured') or '(none)'}\n"
        )
        result = provider.complete_json(SYSTEM, prompt, ASSESSMENT_SCHEMA, max_tokens=600)
        if result:
            try:
                model_scores = {
                    "relevance": max(0, min(100, int(result["relevance"]))),
                    "completion": max(0, min(100, int(result["completion"]))),
                    "quality": max(0, min(100, int(result["quality"]))),
                    "reflection": max(0, min(100, int(result["reflection"]))),
                }
            except (KeyError, TypeError, ValueError):
                model_scores = None
            if model_scores:
                # Blend: the model leads on judgement, the heuristic anchors it.
                for axis, value in model_scores.items():
                    assessment[axis] = round(value * 0.7 + assessment[axis] * 0.3, 1)
                composite = (assessment["relevance"] * 0.32 + assessment["completion"] * 0.30
                             + assessment["quality"] * 0.22 + assessment["reflection"] * 0.16)
                assessment["confidence"] = round(
                    composite * 0.75 + assessment["authenticity"] * 0.25, 1)
                verdict = result.get("verdict")
                if verdict in ("verified", "needs_info", "rejected"):
                    assessment["verdict"] = verdict
                assessment["evaluator"] = "model"
                feedback = str(result.get("feedback") or "").strip()[:400]
                if feedback and safety.is_safe(feedback):
                    assessment["feedback"] = feedback
                follow_up = str(result.get("followUpQuestion") or "").strip()[:200]
                if follow_up:
                    assessment["followUp"] = follow_up

    # Server-side authenticity always gets the final word (§13). A model can be
    # persuaded by well-written text; these rules cannot.
    if assessment["verdict"] == "verified":
        if "duplicate_proof" in signals:
            assessment["verdict"] = "needs_info"
            assessment["notes"] = assessment.get("notes", []) + [
                "This is the same evidence as an earlier submission, so it can't verify "
                "a second quest. Describe this session specifically."]
        elif assessment["authenticity"] < 55:
            assessment["verdict"] = "needs_info"
            assessment["notes"] = assessment.get("notes", []) + [
                "Verification held back pending more detail."]

    assessment.setdefault("feedback", _feedback(quest, assessment))
    assessment.setdefault("followUp", _follow_up(quest, assessment, proof_types))
    if assessment["verdict"] != "verified":
        assessment["feedback"] = assessment.get("feedback") or _feedback(quest, assessment)

    assessment["bands"] = {
        "relevance": _band(assessment["relevance"]),
        "completion": _band(assessment["completion"]),
        "quality": _band(assessment["quality"]),
        "reflection": _band(assessment["reflection"]),
    }
    assessment["qualityMultiplier"] = _quality_multiplier(assessment)
    return assessment
