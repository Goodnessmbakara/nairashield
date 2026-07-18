import type { AgentTickResult, Env, OpenPosition, YieldPosition } from "../types";
import { getDb } from "../db/client";

const MAX_HISTORY = 50;

// ── Tick history ────────────────────────────────────────────────────

export async function appendTick(env: Env, tick: AgentTickResult): Promise<void> {
	const last = await getLastTick(env);

	const uneventful =
		last &&
		tick.decision.action === "HOLD" &&
		last.decision.action === "HOLD" &&
		tick.decision.reason === last.decision.reason &&
		!tick.execution &&
		!tick.movement?.length &&
		tick.status !== "Error";
	if (uneventful) return;

	const sql = getDb(env);
	await sql`
		INSERT INTO ticks (id, at, status, action, reason, market_match, yield_usdc, duration_ms, payload, created_at)
		VALUES (
			${tick.id},
			${tick.at},
			${tick.status},
			${tick.decision.action},
			${tick.decision.reason},
			${tick.market?.match ?? null},
			${tick.yield?.balanceUsdc ?? null},
			${tick.durationMs},
			${JSON.stringify(tick)},
			${Date.now()}
		)
		ON CONFLICT (id) DO NOTHING
	`;
}

export async function listTicks(env: Env, limit = 40): Promise<AgentTickResult[]> {
	const sql = getDb(env);
	const rows = await sql`
		SELECT payload FROM ticks ORDER BY at DESC LIMIT ${limit}
	`;
	return rows.map((r) => r.payload as AgentTickResult);
}

export async function getLastTick(env: Env): Promise<AgentTickResult | null> {
	return (await listTicks(env, 1))[0] ?? null;
}

// ── Yield snapshot ──────────────────────────────────────────────────

export async function savePosition(env: Env, position: YieldPosition): Promise<void> {
	const sql = getDb(env);
	await sql`
		INSERT INTO positions (id, protocol, asset, balance_usdc, apy, last_txid, source, updated_at)
		VALUES ('yield', ${position.protocol}, ${position.asset}, ${position.balanceUsdc}, ${position.apy}, ${position.lastTxid ?? null}, ${position.source}, ${position.updatedAt})
		ON CONFLICT (id) DO UPDATE SET
			protocol    = EXCLUDED.protocol,
			asset       = EXCLUDED.asset,
			balance_usdc = EXCLUDED.balance_usdc,
			apy         = EXCLUDED.apy,
			last_txid   = EXCLUDED.last_txid,
			source      = EXCLUDED.source,
			updated_at  = EXCLUDED.updated_at
	`;
}

export async function loadPosition(env: Env): Promise<YieldPosition | null> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM positions WHERE id = 'yield' LIMIT 1`;
	const row = rows[0];
	if (!row) return null;
	const pos: YieldPosition = {
		protocol: row.protocol as "kamino",
		asset: row.asset as "USDC",
		balanceUsdc: Number(row.balance_usdc),
		apy: Number(row.apy),
		lastTxid: row.last_txid ?? undefined,
		source: row.source as "live" | "projection",
		updatedAt: row.updated_at,
	};
	if (pos.source !== "live") return null;
	if (!Number.isFinite(pos.balanceUsdc)) return null;
	return pos;
}

// ── Open books (maker positions awaiting settlement) ────────────────

export async function listOpenPositions(env: Env): Promise<OpenPosition[]> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM open_positions WHERE status = 'open' ORDER BY placed_at DESC`;
	return rows.map(rowToPosition);
}

export async function listAllPositions(env: Env): Promise<OpenPosition[]> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM open_positions ORDER BY placed_at DESC`;
	return rows.map(rowToPosition);
}

export async function addOpenPosition(env: Env, position: OpenPosition): Promise<void> {
	const sql = getDb(env);
	await sql`
		INSERT INTO open_positions (
			id, match_id, match_name, team, side, size_usdc, maker_odds, fair_odds,
			order_id, placed_at, settle_after, status, pnl_usdc, settled_at,
			redeposit_txid, exit_reason, exit_txid
		) VALUES (
			${position.id}, ${position.matchId}, ${position.match}, ${position.team},
			${position.side}, ${position.sizeUsdc}, ${position.makerOdds}, ${position.fairOdds},
			${position.orderId}, ${position.placedAt}, ${position.settleAfter}, ${position.status},
			${position.pnlUsdc ?? null}, ${position.settledAt ?? null},
			${position.redepositTxid ?? null}, ${position.exitReason ?? null}, ${position.exitTxid ?? null}
		)
	`;
}

export async function updatePosition(
	env: Env,
	id: string,
	patch: Partial<OpenPosition>,
): Promise<OpenPosition | null> {
	const sql = getDb(env);

	// Fetch current row, apply patch in JS, then write back all known fields.
	const current = await sql`SELECT * FROM open_positions WHERE id = ${id} LIMIT 1`;
	if (!current[0]) return null;

	const cur = rowToPosition(current[0] as Record<string, unknown>);
	const merged: OpenPosition = { ...cur, ...patch };

	const rows = await sql`
		UPDATE open_positions SET
			status          = ${merged.status},
			pnl_usdc        = ${merged.pnlUsdc ?? null},
			settled_at      = ${merged.settledAt ?? null},
			redeposit_txid  = ${merged.redepositTxid ?? null},
			exit_reason     = ${merged.exitReason ?? null},
			exit_txid       = ${merged.exitTxid ?? null}
		WHERE id = ${id}
		RETURNING *
	`;
	return rows[0] ? rowToPosition(rows[0] as Record<string, unknown>) : null;
}

// ── Row mapper ──────────────────────────────────────────────────────

function rowToPosition(row: Record<string, unknown>): OpenPosition {
	return {
		id: row.id as string,
		matchId: row.match_id as string,
		match: row.match_name as string,
		team: row.team as string,
		side: row.side as "BACK" | "LAY",
		sizeUsdc: Number(row.size_usdc),
		makerOdds: Number(row.maker_odds),
		fairOdds: Number(row.fair_odds),
		orderId: row.order_id as string,
		placedAt: row.placed_at as string,
		settleAfter: row.settle_after as string,
		status: row.status as "open" | "settled",
		pnlUsdc: row.pnl_usdc != null ? Number(row.pnl_usdc) : undefined,
		settledAt: (row.settled_at as string) ?? undefined,
		redepositTxid: (row.redeposit_txid as string) ?? undefined,
		exitReason: (row.exit_reason as "take_profit" | "stop_loss") ?? undefined,
		exitTxid: (row.exit_txid as string) ?? undefined,
	};
}
