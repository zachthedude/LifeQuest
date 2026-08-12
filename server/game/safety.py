"""Safety rails (§31).

Applied in two places: to anything the user asks the AI for, and to anything the
AI proposes back. The physical domain is about capability and wellbeing, never
appearance or weight.
"""

from __future__ import annotations

import re

_UNSAFE_PATTERNS: list[tuple[str, str]] = [
    (r"\b(lose|losing|cut|drop)\s+(weight|fat|\d+\s*(kg|lbs?|pounds))", "body_composition"),
    (r"\b(calorie[- ]?deficit|cutting|bulking|fast(ing)? for \d+|starve|starving)\b", "dieting"),
    (r"\b(skip(ping)? (meals?|breakfast|dinner)|eat(ing)? nothing|purge|purging)\b", "dieting"),
    (r"\b(all[- ]?nighter|no sleep|stay up all night|sleep deprivation|pull an all nighter)\b", "sleep"),
    (r"\b(\d{3,}\s*(push[- ]?ups|sit[- ]?ups|burpees|pull[- ]?ups))\b", "overtraining"),
    (r"\b(train|run|workout|exercise)\w*\s+(until|till)\s+(you\s+)?(collapse|failure|vomit|pass out)", "overtraining"),
    (r"\b(max(imum)?\s+out|one[- ]?rep max|1rm)\b", "unsafe_lifting"),
    (r"\b(\d+)\s*(hour|hr)s?\s+(straight|nonstop|non[- ]stop|without (a )?break)", "overtraining"),
    (r"\b(marathon|ultra)\s+(today|tomorrow|this week)\b", "overtraining"),
    (r"\b(steroid|sarms|clenbuterol|adderall to study|modafinil)\b", "substances"),
    (r"\b(six[- ]?pack|abs by|shredded|skinny|thigh gap|body ?fat percentage)\b", "body_image"),
    (r"\b(hack|ddos|exploit|steal|shoplift|counterfeit|break into)\b", "illegal"),
    (r"\b(explosiv|thermite|pipe bomb|homemade (gun|weapon))\w*", "dangerous_experiment"),
]

_COMPILED = [(re.compile(pattern, re.IGNORECASE), label) for pattern, label in _UNSAFE_PATTERNS]

SAFE_ALTERNATIVES = {
    "body_composition": "a capability goal — for example, moving comfortably for 25 minutes",
    "dieting": "a wellbeing habit — for example, cooking one balanced meal and noting how you felt",
    "sleep": "a recovery quest — a consistent wind-down routine and a full night's sleep",
    "overtraining": "a sustainable session with a built-in warm-up, rest and cool-down",
    "unsafe_lifting": "a technique-focused session at a comfortable, controlled effort",
    "substances": "an evidence-based focus routine — a timed session with planned breaks",
    "body_image": "a capability marker — what your body can *do*, tracked over time",
    "illegal": "a legitimate, legal version of the same skill",
    "dangerous_experiment": "a documented, supervised project with a clear safety plan",
}


def scan(text: str) -> list[str]:
    """Return the list of safety concern labels present in `text`."""
    if not text:
        return []
    found: list[str] = []
    for pattern, label in _COMPILED:
        if pattern.search(text) and label not in found:
            found.append(label)
    return found


def is_safe(text: str) -> bool:
    return not scan(text)


def redirect_message(labels: list[str]) -> str:
    """A non-judgemental redirect toward a safe alternative."""
    if not labels:
        return ""
    suggestion = SAFE_ALTERNATIVES.get(labels[0], "a safe, sustainable version of this goal")
    return (
        "I can't build that one. LifeQuest measures capability, learning and wellbeing "
        "rather than appearance, intensity or risk. Let's aim at " + suggestion + " instead."
    )


def youth_guard(text: str, age_band: str) -> list[str]:
    """Extra restrictions for younger players (§2)."""
    if age_band not in ("youth", "teen"):
        return []
    extra = []
    if re.search(r"\b(heavy|max|barbell|deadlift|bench press|weighted)\b", text, re.IGNORECASE):
        extra.append("youth_loading")
    return extra
