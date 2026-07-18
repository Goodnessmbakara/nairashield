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
