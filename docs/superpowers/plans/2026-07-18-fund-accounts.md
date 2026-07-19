# Fund Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authenticated users to deposit USDC into a shared trading pool, track their proportional share, and request admin-approved withdrawals.

**Architecture:** Three Neon tables (`user_wallets`, `fund_transactions`, `fund_snapshots`) back a simple ledger. Each user gets a custodial Solana deposit address whose private key is AES-GCM encrypted at rest. The cron sweep detects inbound USDC, sweeps to the pool wallet, and credits the ledger only after on-chain confirmation. Admin identity is email-based via `ADMIN_EMAILS` wrangler secret.

**Tech Stack:** TypeScript, Cloudflare Workers, @neondatabase/serverless, @solana/web3.js, Web Crypto API (AES-GCM), Neon PostgreSQL.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `migrations/0003_fund_accounts.sql` | Create | DB schema for user_wallets, fund_transactions, fund_snapshots |
| `src/account/wallet.ts` | Create | Keypair generation, AES-GCM encrypt/decrypt, withdrawal address validation |
| `src/account/ledger.ts` | Create | Balance calculation, share_pct, pool snapshot recording |
| `src/account/sweep.ts` | Create | Cron deposit sweep — detect, verify, sweep, credit |
| `src/account/withdraw.ts` | Create | Withdrawal request queuing + admin approve/reject execution |
| `src/account/routes.ts` | Create | All `/account/*` and `/admin/*` route handlers |
| `src/types.ts` | Modify | Add `ACCOUNT_MASTER_KEY`, `ADMIN_EMAILS` to `Env` |
| `src/agent/pipeline.ts` | Modify | Call sweep at start of tick; snapshot at end |
| `src/http/router.ts` | Modify | Mount account and admin routes |
| `wrangler.toml` | Modify | Document new secrets in comments |

---

## Task 1: DB Migration

**Files:**
- Create: `migrations/0003_fund_accounts.sql`

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration to Neon**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const sql = neon('$(grep DATABASE_URL .dev.vars | cut -d= -f2-)');
const schema = fs.readFileSync('./migrations/0003_fund_accounts.sql', 'utf8');
const stmts = schema.split(';').map(s => s.trim()).filter(Boolean);
(async () => {
  for (const stmt of stmts) {
    await sql.query(stmt);
    console.log('OK:', stmt.split('\n')[0].slice(0, 60));
  }
  console.log('Done');
})().catch(e => console.error(e.message));
"
```

Expected output: each `CREATE TABLE` / `CREATE INDEX` printed as `OK: ...`, then `Done`.

- [ ] **Step 3: Verify tables exist**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon('$(grep DATABASE_URL .dev.vars | cut -d= -f2-)');
sql.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name\")
  .then(rows => rows.forEach(r => console.log(r.table_name)));
"
```

Expected output includes: `fund_snapshots`, `fund_transactions`, `open_positions`, `positions`, `ticks`, `user_wallets`, `users`.

- [ ] **Step 4: Commit**

```bash
git add migrations/0003_fund_accounts.sql
git commit -m "feat: add fund accounts DB migration"
```

---

## Task 2: Env Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add new env vars to the `Env` interface**

Open `src/types.ts`. After `SESSION_SECRET: string;` add:

```typescript
/** 32-byte hex key for AES-GCM encryption of custodial deposit keypairs */
ACCOUNT_MASTER_KEY: string;
/** Comma-separated admin emails, e.g. "alice@example.com,bob@example.com" */
ADMIN_EMAILS?: string;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ACCOUNT_MASTER_KEY and ADMIN_EMAILS to Env"
```

---

## Task 3: Wallet Key Crypto (`src/account/wallet.ts`)

**Files:**
- Create: `src/account/wallet.ts`

This module handles: generating custodial keypairs, encrypting/decrypting private keys with AES-GCM, validating Solana pubkey strings, and DB read/write for `user_wallets`.

- [ ] **Step 1: Create the file**

```typescript
import { Keypair, PublicKey } from "@solana/web3.js";
import { getDb } from "../db/client";
import type { Env } from "../types";

export type UserWallet = {
	userSub: string;
	depositAddress: string;
	withdrawalAddress: string | null;
	lockedUsdc: bigint;
	createdAt: number;
};

// ── Key encryption ──────────────────────────────────────────────────

async function masterKey(env: Env): Promise<CryptoKey> {
	const raw = hexToBytes(env.ACCOUNT_MASTER_KEY);
	return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
	if (hex.length !== 64) throw new Error("ACCOUNT_MASTER_KEY must be 32 bytes (64 hex chars)");
	const bytes = new Uint8Array(32);
	for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

export async function encryptPrivkey(env: Env, privkeyBytes: Uint8Array): Promise<string> {
	const key = await masterKey(env);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, privkeyBytes);
	const combined = new Uint8Array(12 + ciphertext.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(ciphertext), 12);
	return btoa(String.fromCharCode(...combined));
}

export async function decryptPrivkey(env: Env, encrypted: string): Promise<Uint8Array> {
	const key = await masterKey(env);
	const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
	const iv = combined.slice(0, 12);
	const ciphertext = combined.slice(12);
	const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return new Uint8Array(plain);
}

// ── Solana address validation ────────────────────────────────────────

export function isValidSolanaPubkey(address: string): boolean {
	try {
		new PublicKey(address);
		return true;
	} catch {
		return false;
	}
}

// ── DB operations ────────────────────────────────────────────────────

export async function getOrCreateWallet(env: Env, userSub: string): Promise<UserWallet> {
	const sql = getDb(env);
	const existing = await sql`
		SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1
	`;
	if (existing[0]) return rowToWallet(existing[0]);

	const keypair = Keypair.generate();
	const encrypted = await encryptPrivkey(env, keypair.secretKey);
	const depositAddress = keypair.publicKey.toBase58();

	await sql`
		INSERT INTO user_wallets (user_sub, deposit_address, encrypted_privkey, locked_usdc, created_at)
		VALUES (${userSub}, ${depositAddress}, ${encrypted}, 0, ${Date.now()})
		ON CONFLICT (user_sub) DO NOTHING
	`;

	// Re-fetch in case of race (ON CONFLICT DO NOTHING means another insert won)
	const row = await sql`SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	return rowToWallet(row[0]);
}

export async function getWallet(env: Env, userSub: string): Promise<UserWallet | null> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	return rows[0] ? rowToWallet(rows[0]) : null;
}

export async function setWithdrawalAddress(
	env: Env,
	userSub: string,
	address: string,
): Promise<void> {
	if (!isValidSolanaPubkey(address)) throw new Error("Invalid Solana address");
	const sql = getDb(env);
	await sql`
		UPDATE user_wallets SET withdrawal_address = ${address} WHERE user_sub = ${userSub}
	`;
}

export async function getAllWallets(env: Env): Promise<UserWallet[]> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM user_wallets`;
	return rows.map(rowToWallet);
}

export async function adjustLockedUsdc(
	env: Env,
	userSub: string,
	delta: bigint,
): Promise<void> {
	const sql = getDb(env);
	await sql`
		UPDATE user_wallets
		SET locked_usdc = locked_usdc + ${delta.toString()}
		WHERE user_sub = ${userSub}
	`;
}

function rowToWallet(row: Record<string, unknown>): UserWallet {
	return {
		userSub: row.user_sub as string,
		depositAddress: row.deposit_address as string,
		withdrawalAddress: (row.withdrawal_address as string) ?? null,
		lockedUsdc: BigInt(row.locked_usdc as string | number),
		createdAt: Number(row.created_at),
	};
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/account/wallet.ts
git commit -m "feat: custodial wallet keypair generation and AES-GCM key encryption"
```

---

## Task 4: Ledger (`src/account/ledger.ts`)

**Files:**
- Create: `src/account/ledger.ts`

- [ ] **Step 1: Create the file**

```typescript
import { getDb } from "../db/client";
import type { Env } from "../types";

export type UserBalance = {
	userSub: string;
	confirmedInUsdc: bigint;
	completedOutUsdc: bigint;
	lockedUsdc: bigint;
	netUsdc: bigint;
	sharePct: number;
	estimatedValueUsdc: bigint;
};

export type FundTransaction = {
	id: string;
	userSub: string;
	type: "deposit" | "withdrawal_request" | "withdrawal_executed";
	amountUsdc: bigint;
	status: string;
	txSignature: string | null;
	notes: string | null;
	createdAt: number;
	updatedAt: number;
};

// ── Balance ──────────────────────────────────────────────────────────

export async function getUserBalance(
	env: Env,
	userSub: string,
	kaminoBalanceUsdc: bigint,
): Promise<UserBalance> {
	const sql = getDb(env);

	const [inRow] = await sql`
		SELECT COALESCE(SUM(amount_usdc), 0) AS total
		FROM fund_transactions
		WHERE user_sub = ${userSub} AND type = 'deposit' AND status = 'confirmed'
	`;
	const [outRow] = await sql`
		SELECT COALESCE(SUM(amount_usdc), 0) AS total
		FROM fund_transactions
		WHERE user_sub = ${userSub} AND type = 'withdrawal_executed' AND status = 'completed'
	`;
	const [walletRow] = await sql`
		SELECT locked_usdc FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1
	`;

	const confirmedIn = BigInt(inRow.total as string | number);
	const completedOut = BigInt(outRow.total as string | number);
	const locked = walletRow ? BigInt(walletRow.locked_usdc as string | number) : 0n;
	const net = confirmedIn - completedOut - locked;

	const poolTotal = await getPoolTotalUsdc(env);
	const sharePct = poolTotal > 0n ? Number(net) / Number(poolTotal) : 0;
	const estimatedValue = poolTotal > 0n
		? BigInt(Math.floor(sharePct * Number(kaminoBalanceUsdc)))
		: 0n;

	return {
		userSub,
		confirmedInUsdc: confirmedIn,
		completedOutUsdc: completedOut,
		lockedUsdc: locked,
		netUsdc: net < 0n ? 0n : net,
		sharePct,
		estimatedValueUsdc: estimatedValue,
	};
}

export async function getPoolTotalUsdc(env: Env): Promise<bigint> {
	const sql = getDb(env);

	const [inRow] = await sql`
		SELECT COALESCE(SUM(amount_usdc), 0) AS total
		FROM fund_transactions
		WHERE type = 'deposit' AND status = 'confirmed'
	`;
	const [outRow] = await sql`
		SELECT COALESCE(SUM(amount_usdc), 0) AS total
		FROM fund_transactions
		WHERE type = 'withdrawal_executed' AND status = 'completed'
	`;
	const [lockedRow] = await sql`
		SELECT COALESCE(SUM(locked_usdc), 0) AS total FROM user_wallets
	`;

	const confirmedIn = BigInt(inRow.total as string | number);
	const completedOut = BigInt(outRow.total as string | number);
	const locked = BigInt(lockedRow.total as string | number);
	const total = confirmedIn - completedOut - locked;
	return total < 0n ? 0n : total;
}

// ── Transactions ─────────────────────────────────────────────────────

export async function listTransactions(
	env: Env,
	userSub: string,
	limit = 40,
	offset = 0,
): Promise<FundTransaction[]> {
	const sql = getDb(env);
	const rows = await sql`
		SELECT * FROM fund_transactions
		WHERE user_sub = ${userSub}
		ORDER BY created_at DESC
		LIMIT ${limit} OFFSET ${offset}
	`;
	return rows.map(rowToTx);
}

export async function insertTransaction(
	env: Env,
	tx: Omit<FundTransaction, "createdAt" | "updatedAt">,
): Promise<void> {
	const sql = getDb(env);
	const now = Date.now();
	await sql`
		INSERT INTO fund_transactions
			(id, user_sub, type, amount_usdc, status, tx_signature, notes, created_at, updated_at)
		VALUES (
			${tx.id}, ${tx.userSub}, ${tx.type}, ${tx.amountUsdc.toString()},
			${tx.status}, ${tx.txSignature ?? null}, ${tx.notes ?? null},
			${now}, ${now}
		)
		ON CONFLICT (tx_signature) DO NOTHING
	`;
}

export async function updateTransactionStatus(
	env: Env,
	id: string,
	status: string,
	notes?: string,
): Promise<void> {
	const sql = getDb(env);
	await sql`
		UPDATE fund_transactions
		SET status = ${status}, notes = ${notes ?? null}, updated_at = ${Date.now()}
		WHERE id = ${id}
	`;
}

export async function getTransaction(
	env: Env,
	id: string,
): Promise<FundTransaction | null> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM fund_transactions WHERE id = ${id} LIMIT 1`;
	return rows[0] ? rowToTx(rows[0]) : null;
}

// ── Snapshots ────────────────────────────────────────────────────────

export async function recordSnapshot(env: Env, totalUsdc: bigint): Promise<void> {
	const sql = getDb(env);
	await sql`
		INSERT INTO fund_snapshots (total_usdc, recorded_at)
		VALUES (${totalUsdc.toString()}, ${Date.now()})
	`;
}

export async function listSnapshots(
	env: Env,
	days = 30,
): Promise<{ totalUsdc: bigint; recordedAt: number }[]> {
	const sql = getDb(env);
	const since = Date.now() - days * 24 * 60 * 60 * 1000;
	const rows = await sql`
		SELECT total_usdc, recorded_at FROM fund_snapshots
		WHERE recorded_at >= ${since}
		ORDER BY recorded_at ASC
	`;
	return rows.map((r) => ({
		totalUsdc: BigInt(r.total_usdc as string | number),
		recordedAt: Number(r.recorded_at),
	}));
}

// ── Admin ────────────────────────────────────────────────────────────

export async function getAllUserBalances(
	env: Env,
	kaminoBalanceUsdc: bigint,
): Promise<UserBalance[]> {
	const sql = getDb(env);
	const users = await sql`SELECT DISTINCT user_sub FROM fund_transactions`;
	return Promise.all(
		users.map((u) => getUserBalance(env, u.user_sub as string, kaminoBalanceUsdc)),
	);
}

// ── Helpers ──────────────────────────────────────────────────────────

function rowToTx(row: Record<string, unknown>): FundTransaction {
	return {
		id: row.id as string,
		userSub: row.user_sub as string,
		type: row.type as FundTransaction["type"],
		amountUsdc: BigInt(row.amount_usdc as string | number),
		status: row.status as string,
		txSignature: (row.tx_signature as string) ?? null,
		notes: (row.notes as string) ?? null,
		createdAt: Number(row.created_at),
		updatedAt: Number(row.updated_at),
	};
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/account/ledger.ts
git commit -m "feat: fund ledger — balance calculation, transactions, snapshots"
```

---

## Task 5: Deposit Sweep (`src/account/sweep.ts`)

**Files:**
- Create: `src/account/sweep.ts`

Scans all deposit addresses for new USDC, sweeps to pool wallet, credits ledger only after sweep confirmation.

- [ ] **Step 1: Create the file**

```typescript
import {
	Connection,
	PublicKey,
	Keypair,
	Transaction,
	SystemProgram,
	sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
	getAssociatedTokenAddress,
	createTransferInstruction,
	getAccount,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Env } from "../types";
import type { AgentConfig } from "../agent/config";
import { getAllWallets } from "./wallet";
import { decryptPrivkey } from "./wallet";
import { insertTransaction } from "./ledger";
import { loadKeypair } from "../blockchain/wallet";

const USDC_DECIMALS = 6;
const SWEEP_TIMEOUT_MS = 30_000;

function uuidv4(): string {
	const arr = crypto.getRandomValues(new Uint8Array(16));
	arr[6] = (arr[6]! & 0x0f) | 0x40;
	arr[8] = (arr[8]! & 0x3f) | 0x80;
	return [...arr]
		.map((b, i) =>
			[4, 6, 8, 10].includes(i) ? `-${b.toString(16).padStart(2, "0")}` : b.toString(16).padStart(2, "0"),
		)
		.join("");
}

export async function sweepDeposits(env: Env, config: AgentConfig): Promise<void> {
	const wallets = await getAllWallets(env);
	if (wallets.length === 0) return;

	const connection = new Connection(config.rpcUrl, "confirmed");
	const usdcMint = new PublicKey(config.usdcMintPubKey || "");
	const poolKeypair = loadKeypair(env);
	const poolTokenAccount = await getAssociatedTokenAddress(usdcMint, poolKeypair.publicKey);

	for (const wallet of wallets) {
		try {
			await sweepWallet(env, connection, usdcMint, poolKeypair, poolTokenAccount, wallet);
		} catch (e) {
			// Log but never throw — one bad wallet must not abort the whole sweep
			console.log(`[sweep] wallet ${wallet.depositAddress} error:`, e instanceof Error ? e.message : e);
		}
	}
}

async function sweepWallet(
	env: Env,
	connection: Connection,
	usdcMint: PublicKey,
	poolKeypair: Keypair,
	poolTokenAccount: PublicKey,
	wallet: { userSub: string; depositAddress: string },
): Promise<void> {
	const depositPubkey = new PublicKey(wallet.depositAddress);
	const depositTokenAccount = await getAssociatedTokenAddress(usdcMint, depositPubkey);

	let tokenAccountInfo;
	try {
		tokenAccountInfo = await getAccount(connection, depositTokenAccount);
	} catch {
		// Token account doesn't exist yet — user hasn't sent anything
		return;
	}

	const balanceLamports = BigInt(tokenAccountInfo.amount.toString());
	if (balanceLamports === 0n) return;

	// Fetch recent signatures to check for already-processed txs
	const sigs = await connection.getSignaturesForAddress(depositTokenAccount, { limit: 20 });

	for (const sigInfo of sigs) {
		if (sigInfo.err) continue;
		const sig = sigInfo.signature;

		// Verify on-chain amount for this specific tx
		const txDetail = await connection.getTransaction(sig, {
			maxSupportedTransactionVersion: 0,
		});
		if (!txDetail) continue;

		// Find the USDC token balance change for our deposit address
		const preBalances = txDetail.meta?.preTokenBalances ?? [];
		const postBalances = txDetail.meta?.postTokenBalances ?? [];
		const pre = preBalances.find(
			(b) => b.mint === usdcMint.toBase58() && b.owner === wallet.depositAddress,
		);
		const post = postBalances.find(
			(b) => b.mint === usdcMint.toBase58() && b.owner === wallet.depositAddress,
		);
		if (!post) continue;

		const preAmt = BigInt(pre?.uiTokenAmount?.amount ?? "0");
		const postAmt = BigInt(post.uiTokenAmount?.amount ?? "0");
		const inflow = postAmt - preAmt;
		if (inflow <= 0n) continue;

		// Build sweep tx: transfer USDC from deposit address to pool
		const depositPrivBytes = await decryptPrivkey(env, /* fetch from DB */ await getEncryptedPrivkey(env, wallet.userSub));
		const depositKeypair = Keypair.fromSecretKey(depositPrivBytes);

		const sweepTx = new Transaction().add(
			createTransferInstruction(
				depositTokenAccount,
				poolTokenAccount,
				depositPubkey,
				inflow,
				[],
				TOKEN_PROGRAM_ID,
			),
		);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), SWEEP_TIMEOUT_MS);
		let sweepSig: string;
		try {
			sweepSig = await sendAndConfirmTransaction(connection, sweepTx, [depositKeypair], {
				commitment: "confirmed",
			});
		} finally {
			clearTimeout(timeout);
		}

		// Credit the ledger only after confirmed sweep
		await insertTransaction(env, {
			id: uuidv4(),
			userSub: wallet.userSub,
			type: "deposit",
			amountUsdc: inflow,
			status: "confirmed",
			txSignature: sweepSig,
			notes: `Swept from ${wallet.depositAddress}; source tx: ${sig}`,
		});
	}
}

async function getEncryptedPrivkey(env: Env, userSub: string): Promise<string> {
	const { getDb } = await import("../db/client");
	const sql = getDb(env);
	const rows = await sql`SELECT encrypted_privkey FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	if (!rows[0]) throw new Error(`No wallet found for ${userSub}`);
	return rows[0].encrypted_privkey as string;
}
```

- [ ] **Step 2: Install `@solana/spl-token` (needed for USDC token transfers)**

```bash
pnpm add @solana/spl-token
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/account/sweep.ts
git commit -m "feat: USDC deposit sweep — detect, verify on-chain amount, sweep to pool"
```

---

## Task 6: Withdrawals (`src/account/withdraw.ts`)

**Files:**
- Create: `src/account/withdraw.ts`

- [ ] **Step 1: Create the file**

```typescript
import {
	Connection,
	PublicKey,
	Transaction,
} from "@solana/web3.js";
import {
	getAssociatedTokenAddress,
	createTransferInstruction,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Env } from "../types";
import type { AgentConfig } from "../agent/config";
import { getWallet, adjustLockedUsdc, isValidSolanaPubkey } from "./wallet";
import {
	insertTransaction,
	updateTransactionStatus,
	getTransaction,
	getPoolTotalUsdc,
	listTransactions,
} from "./ledger";
import { loadKeypair } from "../blockchain/wallet";

function uuidv4(): string {
	const arr = crypto.getRandomValues(new Uint8Array(16));
	arr[6] = (arr[6]! & 0x0f) | 0x40;
	arr[8] = (arr[8]! & 0x3f) | 0x80;
	return [...arr]
		.map((b, i) =>
			[4, 6, 8, 10].includes(i) ? `-${b.toString(16).padStart(2, "0")}` : b.toString(16).padStart(2, "0"),
		)
		.join("");
}

export type WithdrawalRequest = {
	id: string;
	userSub: string;
	amountUsdc: bigint;
	status: string;
	notes: string | null;
	createdAt: number;
};

export async function requestWithdrawal(
	env: Env,
	userSub: string,
	amountUsdc: bigint,
): Promise<{ id: string } | { error: string }> {
	if (amountUsdc <= 0n) return { error: "Amount must be greater than zero" };

	const wallet = await getWallet(env, userSub);
	if (!wallet) return { error: "No deposit wallet found. Call POST /account/wallet first." };
	if (!wallet.withdrawalAddress) return { error: "Set a withdrawal address first via PUT /account/wallet/withdrawal" };

	// Calculate available balance
	const txs = await listTransactions(env, userSub, 1000, 0);
	const confirmedIn = txs
		.filter((t) => t.type === "deposit" && t.status === "confirmed")
		.reduce((s, t) => s + t.amountUsdc, 0n);
	const completedOut = txs
		.filter((t) => t.type === "withdrawal_executed" && t.status === "completed")
		.reduce((s, t) => s + t.amountUsdc, 0n);
	const available = confirmedIn - completedOut - wallet.lockedUsdc;

	if (amountUsdc > available) {
		return { error: `Insufficient available balance. Available: ${available} micro-USDC` };
	}

	const id = uuidv4();
	await adjustLockedUsdc(env, userSub, amountUsdc);
	await insertTransaction(env, {
		id,
		userSub,
		type: "withdrawal_request",
		amountUsdc,
		status: "pending",
		txSignature: null,
		notes: `To: ${wallet.withdrawalAddress}`,
	});

	return { id };
}

export async function approveWithdrawal(
	env: Env,
	config: AgentConfig,
	requestId: string,
): Promise<{ ok: true; txSignature: string } | { error: string }> {
	const tx = await getTransaction(env, requestId);
	if (!tx) return { error: "Withdrawal request not found" };
	if (tx.type !== "withdrawal_request") return { error: "Not a withdrawal request" };
	if (tx.status !== "pending") return { error: `Request is already ${tx.status}` };

	const wallet = await getWallet(env, tx.userSub);
	if (!wallet?.withdrawalAddress) return { error: "User has no withdrawal address set" };
	if (!isValidSolanaPubkey(wallet.withdrawalAddress)) return { error: "Invalid withdrawal address" };

	const connection = new Connection(config.rpcUrl, "confirmed");
	const usdcMint = new PublicKey(config.usdcMintPubKey || "");
	const poolKeypair = loadKeypair(env);
	const poolTokenAccount = await getAssociatedTokenAddress(usdcMint, poolKeypair.publicKey);
	const destPubkey = new PublicKey(wallet.withdrawalAddress);
	const destTokenAccount = await getAssociatedTokenAddress(usdcMint, destPubkey);

	let sweepSig: string;
	try {
		const transferTx = new Transaction().add(
			createTransferInstruction(
				poolTokenAccount,
				destTokenAccount,
				poolKeypair.publicKey,
				tx.amountUsdc,
				[],
				TOKEN_PROGRAM_ID,
			),
		);
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
		transferTx.recentBlockhash = blockhash;
		transferTx.feePayer = poolKeypair.publicKey;
		transferTx.sign(poolKeypair);
		sweepSig = await connection.sendRawTransaction(transferTx.serialize());
		await connection.confirmTransaction({ signature: sweepSig, blockhash, lastValidBlockHeight }, "confirmed");
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await updateTransactionStatus(env, requestId, "pending", `Send failed: ${msg}`);
		return { error: `On-chain transfer failed: ${msg}` };
	}

	// Record executed withdrawal
	await insertTransaction(env, {
		id: uuidv4(),
		userSub: tx.userSub,
		type: "withdrawal_executed",
		amountUsdc: tx.amountUsdc,
		status: "completed",
		txSignature: sweepSig,
		notes: `Approved withdrawal. Request: ${requestId}`,
	});

	// Release locked amount and mark request completed
	await adjustLockedUsdc(env, tx.userSub, -tx.amountUsdc);
	await updateTransactionStatus(env, requestId, "completed", `Executed: ${sweepSig}`);

	return { ok: true, txSignature: sweepSig };
}

export async function rejectWithdrawal(
	env: Env,
	requestId: string,
	reason?: string,
): Promise<{ ok: true } | { error: string }> {
	const tx = await getTransaction(env, requestId);
	if (!tx) return { error: "Withdrawal request not found" };
	if (tx.type !== "withdrawal_request") return { error: "Not a withdrawal request" };
	if (tx.status !== "pending") return { error: `Request is already ${tx.status}` };

	await adjustLockedUsdc(env, tx.userSub, -tx.amountUsdc);
	await updateTransactionStatus(env, requestId, "rejected", reason ?? "Rejected by admin");
	return { ok: true };
}

export async function listPendingWithdrawals(env: Env): Promise<WithdrawalRequest[]> {
	const { getDb } = await import("../db/client");
	const sql = getDb(env);
	const rows = await sql`
		SELECT id, user_sub, amount_usdc, status, notes, created_at
		FROM fund_transactions
		WHERE type = 'withdrawal_request' AND status = 'pending'
		ORDER BY created_at ASC
	`;
	return rows.map((r) => ({
		id: r.id as string,
		userSub: r.user_sub as string,
		amountUsdc: BigInt(r.amount_usdc as string | number),
		status: r.status as string,
		notes: (r.notes as string) ?? null,
		createdAt: Number(r.created_at),
	}));
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/account/withdraw.ts
git commit -m "feat: withdrawal request, admin approve/reject, on-chain USDC transfer"
```

---

## Task 7: Route Handlers (`src/account/routes.ts`)

**Files:**
- Create: `src/account/routes.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { Env } from "../types";
import { json } from "../http/json";
import { requireSession } from "../auth/session";
import { loadAgentConfig } from "../agent/config";
import { getOrCreateWallet, getWallet, setWithdrawalAddress } from "./wallet";
import {
	getUserBalance,
	listTransactions,
	listSnapshots,
	getAllUserBalances,
	getPoolTotalUsdc,
} from "./ledger";
import { requestWithdrawal, approveWithdrawal, rejectWithdrawal, listPendingWithdrawals } from "./withdraw";
import { loadPosition } from "../agent/store";

function isAdmin(env: Env, email: string): boolean {
	const admins = (env.ADMIN_EMAILS || "")
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return admins.includes(email.toLowerCase());
}

async function kaminoBalance(env: Env): Promise<bigint> {
	const pos = await loadPosition(env);
	if (!pos || pos.source !== "live") return 0n;
	return BigInt(Math.floor(pos.balanceUsdc * 1_000_000));
}

export async function handleAccountRoutes(
	request: Request,
	env: Env,
	path: string,
	method: string,
): Promise<Response | null> {
	// ── User routes ────────────────────────────────────────────────────
	if (path.startsWith("/account/") || path === "/account") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const { session } = auth;
		const userSub = session.user.sub;

		// POST /account/wallet — create or return deposit address
		if (method === "POST" && path === "/account/wallet") {
			const wallet = await getOrCreateWallet(env, userSub);
			return json({ depositAddress: wallet.depositAddress, withdrawalAddress: wallet.withdrawalAddress });
		}

		// GET /account/wallet
		if (method === "GET" && path === "/account/wallet") {
			const wallet = await getWallet(env, userSub);
			if (!wallet) return json({ depositAddress: null, withdrawalAddress: null });
			return json({ depositAddress: wallet.depositAddress, withdrawalAddress: wallet.withdrawalAddress });
		}

		// PUT /account/wallet/withdrawal
		if (method === "PUT" && path === "/account/wallet/withdrawal") {
			let body: { address?: string } = {};
			try { body = (await request.json()) as typeof body; } catch { return json({ error: "Invalid JSON" }, 400); }
			if (!body.address) return json({ error: "address is required" }, 400);
			try {
				await setWithdrawalAddress(env, userSub, body.address);
				return json({ ok: true });
			} catch (e) {
				return json({ error: e instanceof Error ? e.message : "Invalid address" }, 400);
			}
		}

		// GET /account/balance
		if (method === "GET" && path === "/account/balance") {
			const kamino = await kaminoBalance(env);
			const bal = await getUserBalance(env, userSub, kamino);
			return json({
				netUsdc: bal.netUsdc.toString(),
				lockedUsdc: bal.lockedUsdc.toString(),
				sharePct: bal.sharePct,
				estimatedValueUsdc: bal.estimatedValueUsdc.toString(),
			});
		}

		// GET /account/transactions
		if (method === "GET" && path === "/account/transactions") {
			const url = new URL(request.url);
			const limit = Math.min(Number(url.searchParams.get("limit") || 40), 100);
			const offset = Number(url.searchParams.get("offset") || 0);
			const txs = await listTransactions(env, userSub, limit, offset);
			return json({
				transactions: txs.map((t) => ({ ...t, amountUsdc: t.amountUsdc.toString() })),
				count: txs.length,
			});
		}

		// GET /account/snapshots
		if (method === "GET" && path === "/account/snapshots") {
			const url = new URL(request.url);
			const days = Math.min(Number(url.searchParams.get("days") || 30), 365);
			const snaps = await listSnapshots(env, days);
			return json({ snapshots: snaps.map((s) => ({ ...s, totalUsdc: s.totalUsdc.toString() })) });
		}

		// POST /account/withdraw
		if (method === "POST" && path === "/account/withdraw") {
			let body: { amount_usdc?: string | number } = {};
			try { body = (await request.json()) as typeof body; } catch { return json({ error: "Invalid JSON" }, 400); }
			if (!body.amount_usdc) return json({ error: "amount_usdc is required" }, 400);
			const amount = BigInt(body.amount_usdc);
			const result = await requestWithdrawal(env, userSub, amount);
			if ("error" in result) return json({ error: result.error }, 400);
			return json({ ok: true, id: result.id }, 201);
		}

		// GET /account/withdraw
		if (method === "GET" && path === "/account/withdraw") {
			const txs = await listTransactions(env, userSub, 100, 0);
			const withdrawals = txs.filter((t) => t.type === "withdrawal_request" || t.type === "withdrawal_executed");
			return json({ withdrawals: withdrawals.map((t) => ({ ...t, amountUsdc: t.amountUsdc.toString() })) });
		}

		return null;
	}

	// ── Admin routes ───────────────────────────────────────────────────
	if (path.startsWith("/admin/")) {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		if (!isAdmin(env, auth.session.user.email)) {
			return json({ error: "Forbidden" }, 403);
		}

		const config = loadAgentConfig(env);

		// GET /admin/withdrawals
		if (method === "GET" && path === "/admin/withdrawals") {
			const pending = await listPendingWithdrawals(env);
			return json({ withdrawals: pending.map((w) => ({ ...w, amountUsdc: w.amountUsdc.toString() })) });
		}

		// POST /admin/withdrawals/:id/approve
		const approveMatch = path.match(/^\/admin\/withdrawals\/([^/]+)\/approve$/);
		if (method === "POST" && approveMatch) {
			const result = await approveWithdrawal(env, config, approveMatch[1]!);
			if ("error" in result) return json({ error: result.error }, 400);
			return json(result);
		}

		// POST /admin/withdrawals/:id/reject
		const rejectMatch = path.match(/^\/admin\/withdrawals\/([^/]+)\/reject$/);
		if (method === "POST" && rejectMatch) {
			let body: { reason?: string } = {};
			try { body = (await request.json()) as typeof body; } catch { /* optional */ }
			const result = await rejectWithdrawal(env, rejectMatch[1]!, body.reason);
			if ("error" in result) return json({ error: result.error }, 400);
			return json(result);
		}

		// GET /admin/fund/balance
		if (method === "GET" && path === "/admin/fund/balance") {
			const kamino = await kaminoBalance(env);
			const poolTotal = await getPoolTotalUsdc(env);
			const users = await getAllUserBalances(env, kamino);
			return json({
				poolTotalUsdc: poolTotal.toString(),
				kaminoBalanceUsdc: kamino.toString(),
				users: users.map((u) => ({
					userSub: u.userSub,
					netUsdc: u.netUsdc.toString(),
					sharePct: u.sharePct,
					estimatedValueUsdc: u.estimatedValueUsdc.toString(),
				})),
			});
		}

		return null;
	}

	return null;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/account/routes.ts
git commit -m "feat: account and admin route handlers"
```

---

## Task 8: Wire Into Router and Pipeline

**Files:**
- Modify: `src/http/router.ts`
- Modify: `src/agent/pipeline.ts`

- [ ] **Step 1: Mount account routes in `src/http/router.ts`**

Add import at the top of the file (after existing imports):

```typescript
import { handleAccountRoutes } from "../account/routes";
```

Before the final `return json({ error: "Not found", path }, 404);` line, add:

```typescript
	// ── Account + Admin ───────────────────────────────────────────────
	const accountResponse = await handleAccountRoutes(request, env, path, method);
	if (accountResponse) return withCors ? withCors(request, env, accountResponse) : accountResponse;
```

Wait — `withCors` is a separate export. The correct pattern matching the existing code is:

```typescript
	// ── Account + Admin ───────────────────────────────────────────────
	const accountResponse = await handleAccountRoutes(request, env, path, method);
	if (accountResponse) return accountResponse;
```

- [ ] **Step 2: Add sweep and snapshot to cron tick in `src/agent/pipeline.ts`**

Add import at the top of `src/agent/pipeline.ts` (after existing imports):

```typescript
import { sweepDeposits } from "../account/sweep";
import { recordSnapshot, getPoolTotalUsdc } from "../account/ledger";
```

Inside `runAgentTick`, at the very start of the `try` block, before the `if (!flags.txline)` preflight check, add:

```typescript
		// 0. Sweep user deposits (best-effort — never abort the tick on sweep failure)
		try {
			await sweepDeposits(env, config);
		} catch (e) {
			console.log("[sweep] error:", e instanceof Error ? e.message : e);
		}
```

At the very end of `finishTick` (inside the function, after `await appendTick(args.env, tick);`), add:

```typescript
	// Record pool snapshot for NAV history
	try {
		const poolUsdc = await getPoolTotalUsdc(args.env);
		await recordSnapshot(args.env, poolUsdc);
	} catch {
		// Non-fatal
	}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Add route listing to the `/` route in `router.ts`**

In the `routes` object returned by `GET /`, add:

```typescript
				wallet: "POST /account/wallet | GET /account/wallet | PUT /account/wallet/withdrawal",
				balance: "GET /account/balance",
				transactions: "GET /account/transactions",
				snapshots: "GET /account/snapshots",
				withdraw: "POST /account/withdraw | GET /account/withdraw",
				adminWithdrawals: "GET /admin/withdrawals (admin)",
				adminFundBalance: "GET /admin/fund/balance (admin)",
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/http/router.ts src/agent/pipeline.ts
git commit -m "feat: wire account routes and deposit sweep into router and cron tick"
```

---

## Task 9: Wrangler Secrets + `.dev.vars`

**Files:**
- Modify: `wrangler.toml`
- Modify: `.dev.vars`

- [ ] **Step 1: Generate `ACCOUNT_MASTER_KEY`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output — this is your 32-byte hex master key.

- [ ] **Step 2: Add to `.dev.vars`**

Open `.dev.vars` and add (replace `<generated-key>` with the value from Step 1):

```
# ── Fund Accounts ─────────────────────────────────────────
ACCOUNT_MASTER_KEY=<generated-key>
ADMIN_EMAILS=amicablembakara50@gmail.com
```

- [ ] **Step 3: Add secrets comment to `wrangler.toml`**

Open `wrangler.toml` and add after the existing `[vars]` block:

```toml
# Secrets (set via `wrangler secret put`):
# ACCOUNT_MASTER_KEY — 32-byte hex, AES-GCM key for custodial deposit keypairs
# ADMIN_EMAILS       — comma-separated admin email addresses
```

- [ ] **Step 4: Push secrets to Cloudflare**

```bash
echo "<your-generated-key>" | pnpm wrangler secret put ACCOUNT_MASTER_KEY
echo "amicablembakara50@gmail.com" | pnpm wrangler secret put ADMIN_EMAILS
```

- [ ] **Step 5: Commit wrangler.toml**

```bash
git add wrangler.toml
git commit -m "docs: document ACCOUNT_MASTER_KEY and ADMIN_EMAILS secrets in wrangler.toml"
```

---

## Task 10: Final Typecheck, Deploy, Smoke Test

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 2: Deploy**

```bash
pnpm deploy
```

Expected: `✨ Successfully published your Worker`.

- [ ] **Step 3: Smoke test — create wallet**

```bash
# First get a session token by logging in
TOKEN=$(curl -s -X POST https://retegol-bot.zanbuilds.workers.dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' | jq -r '.token')

# Create deposit wallet
curl -s -X POST https://retegol-bot.zanbuilds.workers.dev/account/wallet \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `{ "depositAddress": "...", "withdrawalAddress": null }`

- [ ] **Step 4: Smoke test — check balance**

```bash
curl -s https://retegol-bot.zanbuilds.workers.dev/account/balance \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `{ "netUsdc": "0", "lockedUsdc": "0", "sharePct": 0, "estimatedValueUsdc": "0" }`

- [ ] **Step 5: Smoke test — admin fund balance**

```bash
curl -s https://retegol-bot.zanbuilds.workers.dev/admin/fund/balance \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `{ "poolTotalUsdc": "0", "kaminoBalanceUsdc": "...", "users": [] }`

- [ ] **Step 6: Final commit**

```bash
git add .
git status  # verify nothing sensitive is staged
git commit -m "feat: fund accounts — deposit wallets, ledger, sweep, withdrawals, admin"
```
