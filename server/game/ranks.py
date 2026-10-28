"""Rank tiers and leaderboards.

Two different ideas, deliberately kept apart:

  * A **tier** is absolute. It is derived from your level alone, so it never
    moves because somebody else played today. A solo player still has a rank.
  * A **leaderboard** is relative, and only meaningful once several people share
    the server. It is opt-out — the app promises your data stays on your
    machine, so appearing next to other accounts is something you can decline.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from .. import db
from . import avatar as avatar_mod
from . import xp as xp_mod

# How many rows a board shows before the viewer's own row is pinned on the end.
BOARD_SIZE = 25

# `icon` is a name from web/js/components/icons.js — the client draws it. The
# ladder climbs on purpose: a shield, then a medal, a star, a trophy, a gem, a
# diamond and a crown.
TIERS = [
    {"key": "iron",     "name": "Iron",     "minLevel": 1,   "color": "#8d95a6", "icon": "shield"},
    {"key": "bronze",   "name": "Bronze",   "minLevel": 5,   "color": "#c8813f", "icon": "medal"},
    {"key": "silver",   "name": "Silver",   "minLevel": 15,  "color": "#c3ccdd", "icon": "star"},
    {"key": "gold",     "name": "Gold",     "minLevel": 30,  "color": "#ffcf5c", "icon": "trophy"},
    {"key": "platinum", "name": "Platinum", "minLevel": 50,  "color": "#7fe3d4", "icon": "gem"},
    {"key": "diamond",  "name": "Diamond",  "minLevel": 70,  "color": "#8fd0ff", "icon": "diamond"},
    {"key": "legend",   "name": "Legend",   "minLevel": 90,  "color": "#bd85ff", "icon": "crown"},
]

# Each tier is split into three divisions so there is always a near target.
DIVISIONS = ["III", "II", "I"]


def tier_for_level(level: int) -> dict:
    level = max(1, min(xp_mod.MAX_LEVEL, int(level)))
    current = TIERS[0]
    index = 0
    for position, tier in enumerate(TIERS):
        if level >= tier["minLevel"]:
            current = tier
            index = position
    nxt = TIERS[index + 1] if index + 1 < len(TIERS) else None

    span_start = current["minLevel"]
    span_end = nxt["minLevel"] if nxt else xp_mod.MAX_LEVEL + 1
    span = max(1, span_end - span_start)
    through = (level - span_start) / span
    division = DIVISIONS[min(len(DIVISIONS) - 1, int(through * len(DIVISIONS)))]

    return {
        "key": current["key"],
        "name": current["name"],
        "division": division,
        "label": f"{current['name']} {division}",
        "color": current["color"],
        "icon": current["icon"],
        "progress": round(min(100.0, through * 100), 1),
        "next": (
            {"name": nxt["name"], "minLevel": nxt["minLevel"],
             "levelsAway": nxt["minLevel"] - level, "color": nxt["color"]}
            if nxt else None
        ),
    }


def ladder() -> list[dict]:
    return [
        {**tier, "maxLevel": (TIERS[i + 1]["minLevel"] - 1) if i + 1 < len(TIERS)
         else xp_mod.MAX_LEVEL}
        for i, tier in enumerate(TIERS)
    ]


def _opted_in(preferences: str | None) -> bool:
    try:
        return bool(json.loads(preferences or "{}").get("leaderboard", True))
    except (TypeError, ValueError):
        return True


def _row_to_entry(row, viewer_id: int) -> dict:
    level = int(row["level"])
    return {
        "userId": int(row["user_id"]),
        "name": row["display_name"] or row["username"],
        "isViewer": int(row["user_id"]) == viewer_id,
        "level": level,
        "title": row["title"],
        "xpTotal": int(row["xp_total"]),
        "streak": int(row["streak_current"] or 0),
        "bestStreak": int(row["streak_best"] or 0),
        "consistency": float(row["consistency_score"] or 0),
        "tier": tier_for_level(level),
        "avatar": avatar_mod.load(row["avatar"] if "avatar" in row.keys() else None),
        "attributes": xp_mod.attributes_from_xp(
            int(row["xp_physical"]), int(row["xp_academic"]), int(row["xp_passion"])),
        "domainXp": {
            "physical": int(row["xp_physical"]),
            "academic": int(row["xp_academic"]),
            "passion": int(row["xp_passion"]),
        },
    }


def _players(viewer_id: int) -> list[dict]:
    rows = db.query(
        """SELECT p.user_id AS user_id, p.level, p.xp_total, p.xp_physical, p.xp_academic,
                  p.xp_passion, p.streak_current, p.streak_best, p.consistency_score, p.title,
                  u.username AS username, u.preferences AS preferences,
                  m.display_name AS display_name, m.avatar AS avatar
             FROM player_profiles p
             JOIN users u ON u.id = p.user_id
             LEFT JOIN player_model m ON m.user_id = p.user_id"""
    )
    entries = []
    for row in rows:
        if int(row["user_id"]) != viewer_id and not _opted_in(row["preferences"]):
            continue
        entries.append(_row_to_entry(row, viewer_id))
    return entries


def _rank(entries: list[dict], key, viewer_id: int) -> dict:
    ordered = sorted(entries, key=key, reverse=True)
    board = []
    for position, entry in enumerate(ordered, start=1):
        board.append({**entry, "rank": position})
    viewer = next((e for e in board if e["userId"] == viewer_id), None)

    # The top of the board answers "who is ahead?"; the player opened it to ask
    # "where am I?". Cutting at BOARD_SIZE answers the first question and drops
    # the one row they came for, so their own row is pinned on the end whenever
    # the cut would have lost it. It carries its true rank, which is what keeps
    # it readable as "...and you are 148th" rather than as 26th place.
    shown = board[:BOARD_SIZE]
    if viewer is not None and all(e["userId"] != viewer_id for e in shown):
        shown = [*shown, viewer]

    return {
        "entries": shown,
        "total": len(board),
        "viewerRank": viewer["rank"] if viewer else None,
    }


def _week_start() -> str:
    today = datetime.now(timezone.utc).date()
    return (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")


def weekly_xp(viewer_id: int) -> dict[int, int]:
    rows = db.query(
        "SELECT user_id, COALESCE(SUM(amount),0) AS total FROM xp_events "
        "WHERE day >= ? GROUP BY user_id",
        (_week_start(),),
    )
    return {int(row["user_id"]): int(row["total"]) for row in rows}


def leaderboards(viewer_id: int) -> dict:
    entries = _players(viewer_id)
    weekly = weekly_xp(viewer_id)
    for entry in entries:
        entry["weeklyXp"] = weekly.get(entry["userId"], 0)

    boards = {
        "overall": _rank(entries, lambda e: (e["xpTotal"], e["level"]), viewer_id),
        "weekly": _rank(entries, lambda e: (e["weeklyXp"], e["xpTotal"]), viewer_id),
        "streak": _rank(entries, lambda e: (e["bestStreak"], e["streak"]), viewer_id),
        "consistency": _rank(entries, lambda e: (e["consistency"], e["xpTotal"]), viewer_id),
    }
    for domain in ("physical", "academic", "passion"):
        boards[domain] = _rank(
            entries, lambda e, d=domain: (e["domainXp"][d], e["xpTotal"]), viewer_id)
    return boards


def viewer_standing(viewer_id: int, profile: dict) -> dict:
    entries = _players(viewer_id)
    ordered = sorted(entries, key=lambda e: (e["xpTotal"], e["level"]), reverse=True)
    rank = next((i for i, e in enumerate(ordered, start=1)
                 if e["userId"] == viewer_id), None)
    total = len(ordered)
    percentile = None
    if rank and total > 1:
        percentile = round(100 * (total - rank) / (total - 1))
    return {
        "tier": tier_for_level(int(profile["level"])),
        "rank": rank,
        "players": total,
        "percentile": percentile,
        "ladder": ladder(),
    }
