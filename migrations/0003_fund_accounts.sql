-- Retegol fund accounts schema

CREATE TABLE IF NOT EXISTS user_wallets (
  user_sub          TEXT PRIMARY KEY,
  deposit_address   TEXT NOT NULL UNIQUE,
  encrypted_privkey TEXT NOT NULL,
  withdrawal_address TEXT,
  locked_usdc       BIGINT NOT NULL DEFAULT 0,
  created_at        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS fund_transactions (
  id            TEXT PRIMARY KEY,
  user_sub      TEXT NOT NULL,
  type          TEXT NOT NULL,
  amount_usdc   BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  tx_signature  TEXT UNIQUE,
  notes         TEXT,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_tx_user_sub ON fund_transactions(user_sub);
CREATE INDEX IF NOT EXISTS idx_fund_tx_status   ON fund_transactions(status);
CREATE INDEX IF NOT EXISTS idx_fund_tx_type     ON fund_transactions(type);

CREATE TABLE IF NOT EXISTS fund_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  total_usdc   BIGINT NOT NULL,
  recorded_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_snapshots_at ON fund_snapshots(recorded_at DESC);
