"""Progression mathematics: the level curve, attributes and quest XP formula.

Design goals (§6 of the product spec):
  * early levels feel rewarding      -> level 10 sits at a few thousand XP
  * middle levels require consistency
  * level 100 represents months/years of genuine development

The per-level requirement grows geometrically with a *decaying* growth rate:

    req(1)   = 100
    req(n+1) = req(n) * g(n)          g(n) = FLOOR + SPAN * exp(-(n-1)/DECAY)

g(1) = 1.50 (level 1 -> 2 costs 100, 2 -> 3 costs 150, 3 -> 4 costs ~213) which
matches the spec's example curve, and decays toward FLOOR = 1.02 so the top of
the curve stays reachable instead of exploding exponentially.
"""

from __future__ import annotations

import math
from functools import lru_cache

MAX_LEVEL = 100

_BASE = 100.0
_FLOOR = 1.02
_SPAN = 0.48
_DECAY = 8.0

DOMAINS = ("physical", "academic", "passion")

# Attribute curve: attribute = 100 * (domain_xp / CAP) ** EXP, clamped to 100.
_ATTR_CAP = 250_000.0
_ATTR_EXP = 0.55

# Quest reward tuning.
_DIFFICULTY_BASE = {1: 22, 2: 45, 3: 90, 4: 190, 5: 420}
_KIND_MULTIPLIER = {"daily": 1.0, "weekly": 1.6, "milestone": 3.5, "epic": 6.0}
_LEVEL_SCALE_PER_LEVEL = 0.05

# Long-form real-world achievements are exempt from the daily cap (§27): a
# finished project should not be gutted because you also stretched that morning.
UNCAPPED_KINDS = ("milestone", "epic")

DIFFICULTY_LABELS = {1: "EASY", 2: "EASY", 3: "MODERATE", 4: "HARD", 5: "EPIC"}


def growth_rate(level: int) -> float:
    return _FLOOR + _SPAN * math.exp(-(level - 1) / _DECAY)


@lru_cache(maxsize=1)
def _requirement_table() -> tuple[int, ...]:
    """requirement[n] = XP needed to go from level n to n+1 (index 0 unused)."""
    table = [0, int(round(_BASE))]
    value = _BASE
    for level in range(1, MAX_LEVEL - 1):
        value *= growth_rate(level)
        table.append(int(round(value)))
    return tuple(table)


@lru_cache(maxsize=1)
def _cumulative_table() -> tuple[int, ...]:
    """cumulative[n] = total XP required to *reach* level n."""
    req = _requirement_table()
    out = [0, 0]
    running = 0
    for level in range(1, MAX_LEVEL):
        running += req[level]
        out.append(running)
    return tuple(out)


def xp_for_next_level(level: int) -> int:
    """XP required to move from `level` to `level + 1`. 0 at max level."""
    if level >= MAX_LEVEL:
        return 0
    return _requirement_table()[max(1, level)]


def total_xp_for_level(level: int) -> int:
    """Cumulative XP required to have reached `level`."""
    level = max(1, min(MAX_LEVEL, level))
    return _cumulative_table()[level]


def level_for_xp(total_xp: int) -> int:
    """The level a player with `total_xp` lifetime XP has reached."""
    cumulative = _cumulative_table()
    if total_xp >= cumulative[MAX_LEVEL]:
        return MAX_LEVEL
    lo, hi = 1, MAX_LEVEL
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if cumulative[mid] <= total_xp:
            lo = mid
        else:
            hi = mid - 1
    return lo


def level_progress(total_xp: int) -> dict:
    """Everything the UI needs to draw the XP bar."""
    level = level_for_xp(total_xp)
    floor_xp = total_xp_for_level(level)
    needed = xp_for_next_level(level)
    into = total_xp - floor_xp
    return {
        "level": level,
        "xpTotal": total_xp,
        "xpIntoLevel": into,
        "xpForNextLevel": needed,
        "xpRemaining": max(0, needed - into) if needed else 0,
        "percent": 100.0 if needed == 0 else round(min(100.0, into / needed * 100), 2),
        "isMaxLevel": level >= MAX_LEVEL,
    }


def attribute_value(domain_xp: int) -> float:
    """Map lifetime domain XP onto a 0-100 attribute score."""
    if domain_xp <= 0:
        return 0.0
    ratio = min(1.0, domain_xp / _ATTR_CAP)
    return round(min(100.0, 100.0 * (ratio ** _ATTR_EXP)), 1)


def attributes_from_xp(physical: int, academic: int, passion: int) -> dict:
    values = {
        "physical": attribute_value(physical),
        "academic": attribute_value(academic),
        "passion": attribute_value(passion),
    }
    values["overall"] = round(sum(values.values()) / 3, 1)
    return values


def quest_xp_reward(difficulty: int, kind: str, level: int, estimated_minutes: int) -> int:
    """Reward attached to a quest at generation time.

    Considers difficulty, effort/duration, quest class and the player's level so
    a level-50 session is worth meaningfully more than the level-5 version of
    the same activity (§9).
    """
    difficulty = max(1, min(5, int(difficulty)))
    base = _DIFFICULTY_BASE[difficulty]
    kind_mult = _KIND_MULTIPLIER.get(kind, 1.0)
    # Duration factor is deliberately sub-linear: three hours is not six times
    # as valuable as thirty minutes.
    minutes = max(5, min(1200, int(estimated_minutes or 30)))
    duration_factor = (minutes / 30.0) ** 0.4
    duration_factor = max(0.6, min(2.0, duration_factor))
    level_scale = 1.0 + _LEVEL_SCALE_PER_LEVEL * (max(1, level) - 1)
    return int(round(base * kind_mult * duration_factor * level_scale))


def daily_xp_cap(level: int) -> int:
    """Soft ceiling on XP per day; beyond it XP is heavily reduced (§13)."""
    return 300 + 60 * max(1, level)


def apply_daily_cap(earned_today: int, award: int, level: int, kind: str = "daily") -> tuple[int, bool]:
    """Return (adjusted_award, was_capped)."""
    if kind in UNCAPPED_KINDS:
        return award, False
    cap = daily_xp_cap(level)
    if earned_today >= cap:
        return max(1, int(round(award * 0.2))), True
    if earned_today + award <= cap:
        return award, False
    under = cap - earned_today
    over = award - under
    return int(round(under + over * 0.2)), True


def consistency_score(active_days_last_28: int) -> float:
    """Weekly/monthly completion rate expressed 0-100 (§20)."""
    return round(min(100.0, active_days_last_28 / 28.0 * 100), 1)


def curve_summary() -> list[dict]:
    """Diagnostic table used by tests, the README and the progress screen."""
    marks = [1, 2, 3, 5, 10, 20, 30, 40, 50, 60, 75, 90, 99, 100]
    return [
        {
            "level": lvl,
            "xpToNext": xp_for_next_level(lvl),
            "cumulative": total_xp_for_level(lvl),
        }
        for lvl in marks
    ]
