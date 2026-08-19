"""SQLite access layer: connection handling, migrations and catalog seeding."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable

from . import config

_local = threading.local()
_init_lock = threading.Lock()
_initialised = False


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DATABASE_URL, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 8000")
    return conn


def connection() -> sqlite3.Connection:
    """One connection per thread (SQLite connections are not thread-safe)."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _connect()
        _local.conn = conn
    return conn


def close_thread_connection() -> None:
    conn = getattr(_local, "conn", None)
    if conn is not None:
        conn.close()
        _local.conn = None


def query(sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
    return connection().execute(sql, tuple(params)).fetchall()


def query_one(sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
    return connection().execute(sql, tuple(params)).fetchone()


def execute(sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
    return connection().execute(sql, tuple(params))


def insert(sql: str, params: Iterable[Any] = ()) -> int:
    cur = connection().execute(sql, tuple(params))
    return int(cur.lastrowid)


class transaction:
    """Context manager giving an IMMEDIATE transaction with rollback on error."""

    def __enter__(self) -> sqlite3.Connection:
        conn = connection()
        conn.execute("BEGIN IMMEDIATE")
        return conn

    def __exit__(self, exc_type, exc, tb) -> bool:
        conn = connection()
        if exc_type is None:
            conn.execute("COMMIT")
        else:
            conn.execute("ROLLBACK")
        return False


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def json_field(row: sqlite3.Row | dict, key: str, default: Any) -> Any:
    raw = row[key] if row is not None and key in row.keys() else None
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default


def init(force: bool = False) -> None:
    """Create the schema and seed static catalogs. Idempotent."""
    global _initialised
    with _init_lock:
        if _initialised and not force:
            return
        config.ensure_dirs()
        conn = connection()
        schema = (Path(__file__).resolve().parent / "schema.sql").read_text(encoding="utf-8")
        conn.executescript(schema)
        _migrate(conn)
        _seed_catalogs(conn)
        _initialised = True


# Columns added after the first release. `CREATE TABLE IF NOT EXISTS` leaves
# existing databases untouched, so new columns are added here instead — an
# upgrade must never cost a player their progress.
_ADDED_COLUMNS = [
    ("player_model", "avatar", "TEXT NOT NULL DEFAULT ''"),
]


def _migrate(conn: sqlite3.Connection) -> None:
    for table, column, definition in _ADDED_COLUMNS:
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if not existing:
            continue  # table not created yet; the schema owns it
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _seed_catalogs(conn: sqlite3.Connection) -> None:
    from .game import achievements as achievements_mod
    from .game import skills as skills_mod

    conn.execute("BEGIN IMMEDIATE")
    try:
        for skill in skills_mod.ALL_SKILLS:
            conn.execute(
                """INSERT INTO skills (key, name, domain, tier, description, requires,
                                       level_required, quests_required, effect)
                   VALUES (?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(key) DO UPDATE SET
                     name=excluded.name, domain=excluded.domain, tier=excluded.tier,
                     description=excluded.description, requires=excluded.requires,
                     level_required=excluded.level_required,
                     quests_required=excluded.quests_required, effect=excluded.effect""",
                (
                    skill["key"], skill["name"], skill["domain"], skill["tier"],
                    skill["description"], json.dumps(skill.get("requires", [])),
                    skill.get("level_required", 1), skill.get("quests_required", 0),
                    json.dumps(skill.get("effect", {})),
                ),
            )
        for ach in achievements_mod.ALL_ACHIEVEMENTS:
            conn.execute(
                """INSERT INTO achievements (key, name, description, requirement, tier, icon)
                   VALUES (?,?,?,?,?,?)
                   ON CONFLICT(key) DO UPDATE SET
                     name=excluded.name, description=excluded.description,
                     requirement=excluded.requirement, tier=excluded.tier, icon=excluded.icon""",
                (
                    ach["key"], ach["name"], ach["description"],
                    ach["requirement"], ach.get("tier", "bronze"), ach.get("icon", "★"),
                ),
            )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
