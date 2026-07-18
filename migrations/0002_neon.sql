-- NairaShield Neon PostgreSQL schema
-- Run once against your Neon database to set up all tables.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  sub           TEXT    NOT NULL UNIQUE,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL DEFAULT '',
  password_hash TEXT    NOT NULL,
  created_at    BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS ticks (
  id          TEXT    PRIMARY KEY,
  at          TEXT    NOT NULL,
  status      TEXT    NOT NULL,
  action      TEXT    NOT NULL,
  reason      TEXT    NOT NULL DEFAULT '',
  market_match TEXT,
  yield_usdc  DOUBLE PRECISION,
  duration_ms INTEGER,
  payload     JSONB   NOT NULL DEFAULT '{}',
  created_at  BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticks_at     ON ticks(at DESC);
CREATE INDEX IF NOT EXISTS idx_ticks_action ON ticks(action);

CREATE TABLE IF NOT EXISTS positions (
  id          TEXT    PRIMARY KEY,   -- "yield" — only one yield snapshot
  protocol    TEXT    NOT NULL,
  asset       TEXT    NOT NULL,
  balance_usdc DOUBLE PRECISION NOT NULL,
  apy         DOUBLE PRECISION NOT NULL,
  last_txid   TEXT,
  source      TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS open_positions (
  id           TEXT    PRIMARY KEY,
  match_id     TEXT    NOT NULL,
  match_name   TEXT    NOT NULL,
  team         TEXT    NOT NULL,
  side         TEXT    NOT NULL,
  size_usdc    DOUBLE PRECISION NOT NULL,
  maker_odds   DOUBLE PRECISION NOT NULL,
  fair_odds    DOUBLE PRECISION NOT NULL,
  order_id     TEXT    NOT NULL,
  placed_at    TEXT    NOT NULL,
  settle_after TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open',
  pnl_usdc     DOUBLE PRECISION,
  settled_at   TEXT,
  redeposit_txid TEXT,
  exit_reason  TEXT,
  exit_txid    TEXT
);

CREATE INDEX IF NOT EXISTS idx_open_positions_status ON open_positions(status);
