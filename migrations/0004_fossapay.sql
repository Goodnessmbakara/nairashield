-- FossaPay wallet custody (v1) — Solana USDC deposits via managed wallets.

ALTER TABLE user_wallets
  ADD COLUMN IF NOT EXISTS fossapay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS fossapay_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'local';

-- FossaPay wallets have no local secret; local provider still stores encrypted_privkey.
ALTER TABLE user_wallets
  ALTER COLUMN encrypted_privkey DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_wallets_fossapay_customer
  ON user_wallets (fossapay_customer_id)
  WHERE fossapay_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_sub       TEXT PRIMARY KEY,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  email          TEXT NOT NULL,
  mobile_number  TEXT NOT NULL,
  dob            TEXT NOT NULL,          -- YYYY-MM-DD
  address        TEXT NOT NULL,
  city           TEXT NOT NULL,
  country        TEXT NOT NULL,
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS fossapay_webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  customer_id  TEXT,
  payload      TEXT NOT NULL DEFAULT '{}',
  processed_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fossapay_webhook_processed
  ON fossapay_webhook_events (processed_at DESC);
