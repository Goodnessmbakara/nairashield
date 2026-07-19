-- Retegol D1 schema — migration 0001
-- Users: email/password accounts. Google OAuth users are NOT stored here
-- (their identity lives in the session only; sub prefix = "google:").

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sub         TEXT    NOT NULL UNIQUE,   -- "email:<email>" stable identifier
  email       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL DEFAULT '',
  password_hash TEXT  NOT NULL,          -- "pbkdf2:<iter>:<salt_hex>:<hash_hex>"
  created_at  INTEGER NOT NULL           -- Unix ms
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Tick history: agent decisions persisted per run.
-- KV (AGENT_STATE) remains the primary store for ticks — this is a mirror
-- for queryable history (filter by action, date range, etc.).
CREATE TABLE IF NOT EXISTS ticks (
  id          TEXT    PRIMARY KEY,       -- "tick_<timestamp>"
  at          TEXT    NOT NULL,          -- ISO timestamp
  status      TEXT    NOT NULL,          -- Executed | Skipped | Error
  action      TEXT    NOT NULL,          -- TRADE | HOLD | SETTLE
  reason      TEXT    NOT NULL DEFAULT '',
  market_match TEXT,                     -- "Team A vs Team B"
  yield_usdc  REAL,
  duration_ms INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticks_at ON ticks(at DESC);
CREATE INDEX IF NOT EXISTS idx_ticks_action ON ticks(action);
