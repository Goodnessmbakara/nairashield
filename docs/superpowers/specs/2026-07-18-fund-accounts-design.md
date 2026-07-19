# Retegol Fund Accounts — Design Spec
**Date:** 2026-07-18
**Status:** Approved

---

## Overview

Allow authenticated users to deposit USDC on Solana into a shared trading pool, view their proportional share, and request withdrawals. The pool is managed by the existing Retegol agent (Kamino yield + Jupiter Predict market-making). Share accounting is a simple ledger: `net_usdc / pool_total` at query time. All amounts stored as micro-USDC (BIGINT, 6 decimal places; 1 USDC = 1_000_000).

---

## Data Model

Three new Neon PostgreSQL tables added via `migrations/0003_fund_accounts.sql`.

### `user_wallets`
One row per user. Custodial deposit address generated on first call to `POST /account/wallet`.

```sql
user_sub          TEXT PRIMARY KEY
deposit_address   TEXT NOT NULL UNIQUE
encrypted_privkey TEXT NOT NULL        -- AES-GCM: base64(IV[12] || ciphertext)
withdrawal_address TEXT                -- user's own Solana wallet for payouts
locked_usdc       BIGINT NOT NULL DEFAULT 0  -- micro-USDC held by pending withdrawals
created_at        BIGINT NOT NULL
```

Private key bytes are encrypted with AES-GCM using `ACCOUNT_MASTER_KEY` (32-byte hex wrangler secret). The master key never touches the DB. Decryption only happens in the cron sweep to sign the USDC sweep transaction.

### `fund_transactions`
Every deposit, withdrawal request, and withdrawal execution.

```sql
id            TEXT PRIMARY KEY           -- uuid v4
user_sub      TEXT NOT NULL
type          TEXT NOT NULL              -- 'deposit' | 'withdrawal_request' | 'withdrawal_executed'
amount_usdc   BIGINT NOT NULL            -- micro-USDC
status        TEXT NOT NULL DEFAULT 'pending'
              -- deposit:              pending → confirmed
              -- withdrawal_request:  pending → completed | rejected
              --   (completed means admin approved AND on-chain send succeeded;
              --    a separate withdrawal_executed row tracks the on-chain tx)
              -- withdrawal_executed: pending → completed | failed
tx_signature  TEXT UNIQUE                -- on-chain tx; UNIQUE prevents double-credit
notes         TEXT
created_at    BIGINT NOT NULL
updated_at    BIGINT NOT NULL
```

`tx_signature` has a `UNIQUE` constraint. The cron uses `INSERT ... ON CONFLICT (tx_signature) DO NOTHING` to prevent double-crediting the same on-chain transaction.

### `fund_snapshots`
Total pool USDC recorded at the end of each cron tick.

```sql
id           BIGSERIAL PRIMARY KEY
total_usdc   BIGINT NOT NULL            -- micro-USDC, sum of all confirmed net balances
recorded_at  BIGINT NOT NULL
```

---

## Balance Calculation

Computed at query time from `fund_transactions`:

```
confirmed_in   = SUM(amount_usdc) WHERE type='deposit'               AND status='confirmed'
completed_out  = SUM(amount_usdc) WHERE type='withdrawal_executed'   AND status='completed'
net_usdc       = confirmed_in - completed_out - locked_usdc
pool_total     = SUM(net_usdc) across all users
share_pct      = net_usdc / pool_total
estimated_value = share_pct * current_kamino_balance_usdc
```

---

## Admin Identity

Admins are identified by email. `ADMIN_EMAILS` is a comma-separated wrangler secret (e.g. `"alice@example.com,bob@example.com"`). Any authenticated session whose `user.email` appears in `ADMIN_EMAILS` is treated as an admin. Checked at the route handler level before any admin operation.

---

## API Routes

### User routes (require valid session)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/account/wallet` | Generate custodial deposit address. Idempotent — returns existing if already created. |
| `GET` | `/account/wallet` | Return `deposit_address`, `withdrawal_address`. |
| `PUT` | `/account/wallet/withdrawal` | Set `withdrawal_address` (validated as a valid Solana pubkey). |
| `GET` | `/account/balance` | Return `net_usdc`, `share_pct`, `estimated_value_usdc`, `locked_usdc`. |
| `GET` | `/account/transactions` | Paginated `fund_transactions` for the authed user. Query params: `limit`, `offset`. |
| `GET` | `/account/snapshots` | Pool NAV history from `fund_snapshots`. Query param: `days` (default 30). |
| `POST` | `/account/withdraw` | Queue a withdrawal request. Body: `{ amount_usdc }`. Validates `amount_usdc <= net_usdc`. Adds to `locked_usdc`. |
| `GET` | `/account/withdraw` | List authed user's withdrawal requests. |

### Admin routes (require valid session + email in `ADMIN_EMAILS`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/withdrawals` | List all `pending` withdrawal requests across all users. |
| `POST` | `/admin/withdrawals/:id/approve` | Trigger on-chain USDC send from pool wallet → user's `withdrawal_address`. On confirmation: status → `completed`, release `locked_usdc`. |
| `POST` | `/admin/withdrawals/:id/reject` | Reject request: status → `rejected`, release `locked_usdc`. |
| `GET` | `/admin/fund/balance` | Total pool USDC, per-user share summary. |

---

## Deposit Sweep (Cron)

Runs inside the existing cron tick, **before** settlement and trading. Order:

1. **Sweep deposits** — scan all `user_wallets.deposit_address` for new inbound USDC
2. Settlement (existing)
3. Risk manager (existing)
4. Trading decision (existing)
5. **Snapshot** — record `fund_snapshots` row with updated total pool USDC

**Sweep logic per deposit address:**
1. Fetch confirmed USDC token account balance on-chain for `deposit_address`
2. Fetch recent confirmed transactions for that address
3. For each transaction whose `signature` is NOT already in `fund_transactions`:
   - Verify the USDC amount on-chain (never trust a cached value)
   - Decrypt `encrypted_privkey` with `ACCOUNT_MASTER_KEY`
   - Sign + broadcast sweep transaction: move USDC from deposit address → pool wallet
   - Await sweep confirmation (with timeout)
   - `INSERT INTO fund_transactions (...) ON CONFLICT (tx_signature) DO NOTHING`
   - Status set to `confirmed` only after sweep tx is confirmed on-chain
4. Credit is only applied after the sweep is confirmed — never on detection alone

---

## Withdrawal Execution (Admin Approve)

1. Verify request status is `pending` and `user.locked_usdc >= request.amount_usdc`
2. Verify `withdrawal_address` is set on the user's wallet record
3. Sign + broadcast USDC transfer from pool wallet (`SOLANA_PRIVATE_KEY`) → `withdrawal_address`
4. On confirmation:
   - Insert `fund_transactions` row: type=`withdrawal_executed`, status=`completed`
   - Decrement `locked_usdc` by `amount_usdc`
   - Update `withdrawal_request` status → `completed`
5. On failure:
   - Update `withdrawal_request` status → `pending` (retry-able)
   - Append failure detail to `notes`

---

## Key Encryption

- `ACCOUNT_MASTER_KEY`: 32-byte hex string, stored as a wrangler secret
- Encryption: Web Crypto AES-GCM, 256-bit key, random 12-byte IV per encryption
- Stored as base64(`IV[12 bytes] || ciphertext`)
- Decryption performed only at sweep time, in-memory, never logged

---

## New Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ACCOUNT_MASTER_KEY` | Wrangler secret | AES-GCM key for deposit address private keys |
| `ADMIN_EMAILS` | Wrangler secret | Comma-separated admin email addresses |

---

## New Files

```
src/account/
  wallet.ts       -- keypair generation, AES-GCM encrypt/decrypt
  ledger.ts       -- balance calculation, share_pct, fund_snapshots
  sweep.ts        -- cron deposit sweep logic
  withdraw.ts     -- withdrawal request + admin execution
  routes.ts       -- /account/* and /admin/* route handlers
migrations/
  0003_fund_accounts.sql
```

---

## Security Properties

- One leaked `ACCOUNT_MASTER_KEY` is the single point of failure for custodial keys — rotate it by re-encrypting all `encrypted_privkey` rows
- `tx_signature` UNIQUE constraint is the hard guard against double-crediting
- `locked_usdc` is decremented atomically with withdrawal status updates to prevent double-spend
- Admin identity is checked against `ADMIN_EMAILS` on every admin route call — no cached admin flag
- On-chain amount always verified from the transaction; ledger amount is never sourced from user input alone
- All USDC amounts are BIGINT micro-USDC — no floating point on the ledger
- Withdrawal destination address validated as a valid Solana base58 pubkey before being stored
