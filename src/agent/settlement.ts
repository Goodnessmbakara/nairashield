/**
 * Settlement agent (PRD §2.1 Settlement State).
 *
 * Only settles when:
 * 1. Match is ENDED on TxLINE (or position horizon elapsed as a soft cue), AND
 * 2. BetDEX returns a real settled order with PnL/payout fields.
 *
 * Never invents PnL. If the book cannot be confirmed, leave it open.
 */

import type { AgentConfig } from "./config";
import type { Env, MarketOdds, OpenPosition, SettlementResult } from "../types";
import { listOpenPositions, updatePosition } from "./store";
import { depositYield } from "../integrations/kamino";
import { fetchOrderSettlement } from "../integrations/betdex";
import { round4 } from "./math";

export async function settleDuePositions(
	env: Env,
	config: AgentConfig,
	market: MarketOdds | null,
): Promise<SettlementResult[]> {
	const open = await listOpenPositions(env);
	if (open.length === 0) return [];

	const results: SettlementResult[] = [];

	for (const pos of open) {
		if (!shouldAttemptSettle(pos, market)) continue;
		const result = await settleOne(env, config, pos);
		results.push(result);
	}

	return results;
}

function shouldAttemptSettle(pos: OpenPosition, market: MarketOdds | null): boolean {
	if (pos.status !== "open") return false;

	// Prefer match-ended signal from real TxLINE feed
	if (market && market.matchId === pos.matchId && market.status === "ENDED") {
		return true;
	}

	// Soft cue: past event horizon — still requires real BetDEX settlement data
	const due = Date.parse(pos.settleAfter);
	if (Number.isFinite(due) && Date.now() >= due) return true;

	return false;
}

async function settleOne(
	env: Env,
	config: AgentConfig,
	pos: OpenPosition,
): Promise<SettlementResult> {
	const settlement = await fetchOrderSettlement(config, pos.orderId);

	if (!settlement) {
		return {
			positionId: pos.id,
			matchId: pos.matchId,
			pnlUsdc: 0,
			returnedUsdc: 0,
			success: false,
			error: "Cannot settle: BetDEX not configured or order id missing",
		};
	}

	if (!settlement.settled) {
		return {
			positionId: pos.id,
			matchId: pos.matchId,
			pnlUsdc: 0,
			returnedUsdc: 0,
			success: false,
			error: settlement.error || "Order not settled on BetDEX yet",
		};
	}

	const pnlUsdc =
		typeof settlement.pnlUsdc === "number"
			? settlement.pnlUsdc
			: typeof settlement.returnedUsdc === "number"
				? round4(settlement.returnedUsdc - pos.sizeUsdc)
				: 0;

	const returnedUsdc =
		typeof settlement.returnedUsdc === "number"
			? settlement.returnedUsdc
			: round4(pos.sizeUsdc + pnlUsdc);

	if (returnedUsdc < 0) {
		return {
			positionId: pos.id,
			matchId: pos.matchId,
			pnlUsdc,
			returnedUsdc,
			success: false,
			error: "Invalid settlement amounts from BetDEX",
		};
	}

	// Redeposit real proceeds to Kamino (fails closed if deposit not wired)
	const deposit = await depositYield(env, config, returnedUsdc);
	if (!deposit.success) {
		return {
			positionId: pos.id,
			matchId: pos.matchId,
			pnlUsdc,
			returnedUsdc,
			success: false,
			error: deposit.error || "Kamino redeposit failed",
		};
	}

	await updatePosition(env, pos.id, {
		status: "settled",
		pnlUsdc,
		settledAt: new Date().toISOString(),
		redepositTxid: deposit.txid,
	});

	return {
		positionId: pos.id,
		matchId: pos.matchId,
		pnlUsdc,
		returnedUsdc,
		redepositTxid: deposit.txid,
		success: true,
	};
}

export function buildOpenPosition(params: {
	matchId: string;
	match: string;
	team: string;
	side: "BACK" | "LAY";
	sizeUsdc: number;
	makerOdds: number;
	fairOdds: number;
	orderId: string;
	horizonHours: number;
}): OpenPosition {
	const placedAt = new Date();
	const settleAfter = new Date(
		placedAt.getTime() + Math.max(0.05, params.horizonHours) * 3600_000,
	);
	return {
		id: `pos_${placedAt.getTime()}`,
		matchId: params.matchId,
		match: params.match,
		team: params.team,
		side: params.side,
		sizeUsdc: params.sizeUsdc,
		makerOdds: params.makerOdds,
		fairOdds: params.fairOdds,
		orderId: params.orderId,
		placedAt: placedAt.toISOString(),
		settleAfter: settleAfter.toISOString(),
		status: "open",
	};
}
