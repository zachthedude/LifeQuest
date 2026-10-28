-- LifeQuest relational schema (SQLite)
-- All game state is server-authoritative. The client never writes XP or levels.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    password_salt   TEXT    NOT NULL,
    created_at      TEXT    NOT NULL,
    preferences     TEXT    NOT NULL DEFAULT '{}',   -- JSON: notifications, sound, motion, theme
    onboarded       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash      TEXT    PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token      TEXT    NOT NULL,
    created_at      TEXT    NOT NULL,
    expires_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Password recovery. Only the hash of a code is ever stored, exactly as for a
-- session token: a stolen database yields no usable codes. Rows are single-use
-- and short-lived, and `used_at` is kept rather than deleted so a code cannot be
-- replayed inside its own expiry window.
CREATE TABLE IF NOT EXISTS password_resets (
    code_hash       TEXT    PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TEXT    NOT NULL,
    expires_at      TEXT    NOT NULL,
    used_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS player_profiles (
    user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    level               INTEGER NOT NULL DEFAULT 1,
    xp_total            INTEGER NOT NULL DEFAULT 0,
    xp_physical         INTEGER NOT NULL DEFAULT 0,
    xp_academic         INTEGER NOT NULL DEFAULT 0,
    xp_passion          INTEGER NOT NULL DEFAULT 0,
    streak_current      INTEGER NOT NULL DEFAULT 0,
    streak_best         INTEGER NOT NULL DEFAULT 0,
    last_active_date    TEXT,
    consistency_score   REAL    NOT NULL DEFAULT 0,
    title               TEXT    NOT NULL DEFAULT 'Novice',
    created_at          TEXT    NOT NULL
);

-- The player model that drives personalisation (§24).
CREATE TABLE IF NOT EXISTS player_model (
    user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name        TEXT    NOT NULL DEFAULT '',
    age_band            TEXT    NOT NULL DEFAULT 'adult',   -- youth | teen | adult
    activity_level      TEXT    NOT NULL DEFAULT 'moderate',
    minutes_per_day     INTEGER NOT NULL DEFAULT 45,
    academic_subjects   TEXT    NOT NULL DEFAULT '[]',      -- JSON array
    passion_interests   TEXT    NOT NULL DEFAULT '[]',
    passion_curious     TEXT    NOT NULL DEFAULT '[]',
    physical_activities TEXT    NOT NULL DEFAULT '[]',
    existing_skills     TEXT    NOT NULL DEFAULT '[]',
    short_term_goals    TEXT    NOT NULL DEFAULT '',
    long_term_goals     TEXT    NOT NULL DEFAULT '',
    difficulty_offset   TEXT    NOT NULL DEFAULT '{"physical":0,"academic":0,"passion":0}',
    avatar              TEXT    NOT NULL DEFAULT '',      -- JSON appearance config
    updated_at          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS quests (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key        TEXT    NOT NULL DEFAULT 'custom',
    title               TEXT    NOT NULL,
    description         TEXT    NOT NULL,
    domain              TEXT    NOT NULL CHECK (domain IN ('physical','academic','passion')),
    kind                TEXT    NOT NULL CHECK (kind IN ('daily','weekly','milestone','epic')),
    difficulty          INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    estimated_time      INTEGER NOT NULL,
    xp_reward           INTEGER NOT NULL,
    level_requirement   INTEGER NOT NULL DEFAULT 1,
    requirements        TEXT    NOT NULL DEFAULT '[]',      -- JSON array of strings
    proof_types         TEXT    NOT NULL DEFAULT '[]',      -- JSON array: text|photo|document|link|reflection|structured
    skills              TEXT    NOT NULL DEFAULT '[]',      -- JSON array of skill keys
    evaluation_criteria TEXT    NOT NULL DEFAULT '[]',      -- JSON array of strings
    completion_criteria TEXT    NOT NULL DEFAULT '',
    status              TEXT    NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available','active','submitted','verified','rejected','expired','abandoned')),
    source              TEXT    NOT NULL DEFAULT 'system',  -- system | ai | user
    chain_key           TEXT,
    chain_step          INTEGER,
    created_at          TEXT    NOT NULL,
    started_at          TEXT,
    expires_at          TEXT,
    completed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_quests_user_status ON quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_user_created ON quests(user_id, created_at);

CREATE TABLE IF NOT EXISTS quest_completions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id            INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    submitted_at        TEXT    NOT NULL,
    completed_at        TEXT,
    status              TEXT    NOT NULL CHECK (status IN ('verified','needs_info','rejected')),
    proof               TEXT    NOT NULL DEFAULT '{}',      -- JSON payload of submitted evidence
    proof_digest        TEXT    NOT NULL DEFAULT '',        -- hash for duplicate detection
    assessment          TEXT    NOT NULL DEFAULT '{}',      -- JSON: relevance/completion/quality/confidence
    xp_awarded          INTEGER NOT NULL DEFAULT 0,
    quality_multiplier  REAL    NOT NULL DEFAULT 1.0,
    evaluator           TEXT    NOT NULL DEFAULT 'heuristic'
);
CREATE INDEX IF NOT EXISTS idx_completions_user ON quest_completions(user_id, submitted_at);

-- Immutable XP ledger. Attributes and levels are always derivable from this.
CREATE TABLE IF NOT EXISTS xp_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain          TEXT    NOT NULL,
    amount          INTEGER NOT NULL,
    reason          TEXT    NOT NULL,
    quest_id        INTEGER,
    created_at      TEXT    NOT NULL,
    day             TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_user_day ON xp_events(user_id, day);

CREATE TABLE IF NOT EXISTS skills (
    key             TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    domain          TEXT NOT NULL,
    tier            INTEGER NOT NULL,
    description     TEXT NOT NULL,
    requires        TEXT NOT NULL DEFAULT '[]',   -- JSON array of prerequisite skill keys
    level_required  INTEGER NOT NULL DEFAULT 1,
    quests_required INTEGER NOT NULL DEFAULT 0,
    effect          TEXT NOT NULL DEFAULT '{}'    -- JSON: {"type":"xp_bonus","value":0.05,...}
);

CREATE TABLE IF NOT EXISTS user_skills (
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_key       TEXT    NOT NULL REFERENCES skills(key),
    unlocked_at     TEXT    NOT NULL,
    progress        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, skill_key)
);

CREATE TABLE IF NOT EXISTS achievements (
    key             TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    requirement     TEXT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'bronze',
    icon            TEXT NOT NULL DEFAULT '★'
);

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_key TEXT    NOT NULL REFERENCES achievements(key),
    unlocked_at     TEXT    NOT NULL,
    PRIMARY KEY (user_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS chain_progress (
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chain_key       TEXT    NOT NULL,
    step            INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'active',
    started_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    PRIMARY KEY (user_id, chain_key)
);

CREATE TABLE IF NOT EXISTS passion_paths (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'exploring', -- exploring | pursuing | paused | retired
    interest_score  REAL    NOT NULL DEFAULT 0.5,
    sessions        INTEGER NOT NULL DEFAULT 0,
    notes           TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paths_user ON passion_paths(user_id);

CREATE TABLE IF NOT EXISTS ai_interactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module          TEXT    NOT NULL,   -- guide | quest_generator | proof_evaluator | analyst | difficulty
    interaction     TEXT    NOT NULL,
    response        TEXT    NOT NULL,
    provider        TEXT    NOT NULL DEFAULT 'local',
    created_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_interactions(user_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            TEXT    NOT NULL,
    body            TEXT    NOT NULL,
    read            INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
