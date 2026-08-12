"""Avatar catalog: the options a player can choose, and how they unlock.

The server owns the catalog (ids, labels, colours, unlock rules) and validates
every save against it. The browser owns the drawing code for those same ids —
`tests/test_avatar.py` fails if the two ever drift apart.

Unlock policy, deliberately: **identity is never earned.** Skin tones, base hair
styles, hair colours found in nature, eyes and mouths are always available. Only
flashy extras — armour, lab coats, unnatural hair colours, accessories — are
gated behind levels or domain work, so progression adds expression without ever
withholding someone's own likeness from them.
"""

from __future__ import annotations

import json
from typing import Any


def _option(key: str, label: str, *, level: int = 0, domain: str | None = None,
            quests: int = 0, swatch: str | None = None) -> dict:
    """One selectable option. `level`/`domain`+`quests` describe its unlock."""
    entry: dict[str, Any] = {"key": key, "label": label}
    if level:
        entry["level"] = level
    if domain and quests:
        entry["domain"] = domain
        entry["quests"] = quests
    if swatch:
        entry["swatch"] = swatch
    return entry


# --- palettes ---------------------------------------------------------------
SKIN_TONES = [
    _option("skin1", "Porcelain", swatch="#ffdcc0"),
    _option("skin2", "Light", swatch="#f6c9a0"),
    _option("skin3", "Warm", swatch="#e8ac7c"),
    _option("skin4", "Golden", swatch="#d2915c"),
    _option("skin5", "Tan", swatch="#b8763f"),
    _option("skin6", "Bronze", swatch="#94572b"),
    _option("skin7", "Deep", swatch="#6f3f20"),
    _option("skin8", "Rich", swatch="#4c2a15"),
]

HAIR_STYLES = [
    _option("bald", "Shaved"),
    _option("buzz", "Buzz cut"),
    _option("short", "Short"),
    _option("wavy", "Wavy bob"),
    _option("curls", "Curls"),
    _option("afro", "Afro"),
    _option("long", "Long"),
    _option("ponytail", "Ponytail"),
    _option("bun", "Top bun"),
    _option("braids", "Braids"),
    _option("locs", "Locs"),
    _option("hijab", "Hijab"),
    _option("spiky", "Spiky", level=5),
    _option("mohawk", "Mohawk", level=20),
]

HAIR_COLORS = [
    _option("noir", "Black", swatch="#221f22"),
    _option("espresso", "Dark brown", swatch="#3d2a1e"),
    _option("chestnut", "Brown", swatch="#6b4423"),
    _option("auburn", "Auburn", swatch="#a2542a"),
    _option("ginger", "Ginger", swatch="#c96a2b"),
    _option("honey", "Blonde", swatch="#dcb46a"),
    _option("platinum", "Platinum", swatch="#e8e2d6"),
    _option("silver", "Silver", swatch="#b3bac7"),
    _option("azure", "Electric blue", swatch="#4a90d9", level=15),
    _option("bloom", "Pink", swatch="#e26aa5", level=15),
    _option("moss", "Green", swatch="#4caf78", level=15),
    _option("violet", "Violet", swatch="#9b6cf0", level=25),
]

EYES = [
    _option("open", "Open"),
    _option("happy", "Happy"),
    _option("focused", "Focused"),
    _option("sleepy", "Sleepy"),
    _option("wink", "Wink"),
    _option("bright", "Bright"),
]

MOUTHS = [
    _option("smile", "Smile"),
    _option("grin", "Grin"),
    _option("neutral", "Neutral"),
    _option("smirk", "Smirk"),
    _option("oh", "Surprised"),
]

OUTFITS = [
    _option("tee", "T-shirt"),
    _option("hoodie", "Hoodie"),
    _option("jacket", "Jacket"),
    _option("athlete", "Training kit", domain="physical", quests=10),
    _option("labcoat", "Lab coat", domain="academic", quests=10),
    _option("artist", "Work apron", domain="passion", quests=10),
    _option("formal", "Smart", level=30),
    _option("armor", "Champion's plate", level=50),
]

OUTFIT_COLORS = [
    _option("ember", "Ember", swatch="#e8543f"),
    _option("amber", "Amber", swatch="#f2a03d"),
    _option("gold", "Gold", swatch="#ffcf5c"),
    _option("moss", "Moss", swatch="#5cb87a"),
    _option("teal", "Teal", swatch="#38b2ac"),
    _option("sky", "Sky", swatch="#4a90d9"),
    _option("indigo", "Indigo", swatch="#7c6cf5"),
    _option("orchid", "Orchid", swatch="#b57bff"),
    _option("rose", "Rose", swatch="#ec6ea5"),
    _option("slate", "Slate", swatch="#39435c"),
    _option("bone", "Bone", swatch="#e6e8f0"),
    _option("ink", "Ink", swatch="#1f2637"),
]

ACCESSORIES = [
    _option("none", "None"),
    _option("glasses", "Glasses"),
    _option("earring", "Earring"),
    _option("headband", "Headband", level=5),
    _option("cap", "Cap", level=10),
    _option("headphones", "Headphones", level=15),
    _option("shades", "Shades", level=25),
    _option("visor", "Focus visor", level=40),
]

BACKGROUNDS = [
    _option("slate", "Slate", swatch="#2b3148"),
    _option("dusk", "Dusk", swatch="#4a3a6b"),
    _option("ember", "Ember", swatch="#8a4a2c"),
    _option("deep", "Deep sea", swatch="#1f4d63"),
    _option("moss", "Moss", swatch="#2f5c46"),
    _option("plum", "Plum", swatch="#5c2f52"),
    _option("gold", "Gilded", swatch="#8a6a2c", level=25),
    _option("aurora", "Aurora", swatch="#2f5c8a", level=50),
]

CATALOG: dict[str, list[dict]] = {
    "skinTone": SKIN_TONES,
    "hair": HAIR_STYLES,
    "hairColor": HAIR_COLORS,
    "eyes": EYES,
    "mouth": MOUTHS,
    "outfit": OUTFITS,
    "outfitColor": OUTFIT_COLORS,
    "accessory": ACCESSORIES,
    "background": BACKGROUNDS,
}

SLOT_LABELS = {
    "skinTone": "Skin tone",
    "hair": "Hair",
    "hairColor": "Hair colour",
    "eyes": "Eyes",
    "mouth": "Expression",
    "outfit": "Outfit",
    "outfitColor": "Outfit colour",
    "accessory": "Accessory",
    "background": "Backdrop",
}

DEFAULT_AVATAR = {
    "skinTone": "skin3",
    "hair": "short",
    "hairColor": "espresso",
    "eyes": "open",
    "mouth": "smile",
    "outfit": "tee",
    "outfitColor": "sky",
    "accessory": "none",
    "background": "slate",
}


def is_unlocked(option: dict, level: int, domain_counts: dict[str, int]) -> bool:
    if option.get("level", 0) > level:
        return False
    domain = option.get("domain")
    if domain and domain_counts.get(domain, 0) < option.get("quests", 0):
        return False
    return True


def unlock_hint(option: dict) -> str:
    if "level" in option:
        return f"Unlocks at level {option['level']}"
    if "domain" in option:
        return f"Unlocks after {option['quests']} {option['domain']} quests"
    return ""


def options_for(level: int, domain_counts: dict[str, int]) -> list[dict]:
    """The full catalog, annotated with what this player has unlocked."""
    slots = []
    for slot, entries in CATALOG.items():
        slots.append({
            "slot": slot,
            "label": SLOT_LABELS[slot],
            "options": [
                {
                    **entry,
                    "unlocked": is_unlocked(entry, level, domain_counts),
                    "hint": unlock_hint(entry),
                }
                for entry in entries
            ],
        })
    return slots


def sanitise(config: Any, level: int, domain_counts: dict[str, int]) -> dict:
    """Coerce arbitrary input into a valid, unlocked avatar configuration.

    Anything unknown or still locked falls back to the default for that slot,
    so a crafted request can never dress a level-1 character in armour.
    """
    if not isinstance(config, dict):
        config = {}
    result: dict[str, str] = {}
    for slot, entries in CATALOG.items():
        chosen = config.get(slot)
        entry = next((e for e in entries if e["key"] == chosen), None)
        if entry is None or not is_unlocked(entry, level, domain_counts):
            result[slot] = DEFAULT_AVATAR[slot]
        else:
            result[slot] = entry["key"]
    return result


def load(raw: str | None) -> dict:
    """Read a stored avatar, tolerating absent or corrupt values."""
    if not raw:
        return dict(DEFAULT_AVATAR)
    try:
        stored = json.loads(raw)
    except (TypeError, ValueError):
        return dict(DEFAULT_AVATAR)
    if not isinstance(stored, dict):
        return dict(DEFAULT_AVATAR)
    merged = dict(DEFAULT_AVATAR)
    for slot in CATALOG:
        value = stored.get(slot)
        if isinstance(value, str) and any(e["key"] == value for e in CATALOG[slot]):
            merged[slot] = value
    return merged


def dumps(config: dict) -> str:
    return json.dumps(config, separators=(",", ":"))


def unlock_summary(level: int, domain_counts: dict[str, int]) -> dict:
    total = sum(len(entries) for entries in CATALOG.values())
    unlocked = sum(
        1 for entries in CATALOG.values() for entry in entries
        if is_unlocked(entry, level, domain_counts)
    )
    upcoming = []
    for slot, entries in CATALOG.items():
        for entry in entries:
            if is_unlocked(entry, level, domain_counts):
                continue
            upcoming.append({
                "slot": slot,
                "slotLabel": SLOT_LABELS[slot],
                "label": entry["label"],
                "hint": unlock_hint(entry),
                "level": entry.get("level", 0),
            })
    upcoming.sort(key=lambda item: (item["level"] or 999))
    return {"unlocked": unlocked, "total": total, "next": upcoming[:4]}
