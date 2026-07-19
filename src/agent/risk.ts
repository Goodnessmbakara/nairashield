/**
 * TP/SL risk manager — active in-play position management.
 *
 * Each tick, every open position on the current fixture is marked to market
 * against live TxLINE consensus odds. Implied win-probability move since
 * entry (in points):
 *
 *   BACK:  edge = 1/oddsNow − 1/oddsEntry   (odds shortening favors us)
 *   LAY:   edge = 1/oddsEntry − 1/oddsNow   (odds drifting favors us)
 *
 * edge ≥ takeProfitEdge  → close early, lock the gain
 * edge ≤ −stopLossEdge   → close early, cut the loss
 *
 * Closes are real Jupiter position closes signed by the agent. Realized
 * PnL is NOT invented here — proceeds land in the wallet on-chain and the
 * position records the exit txid + reason only. Fail-closed: an unsuccessful
 * close leaves the position open to retry next tick.
 */

import type { AgentConfig } from "./config";
import type { Env, MarketOdds, RiskExit } from "../types";
import { listOpenPositions, updatePosition } from "./store";
import { closePosition } from "../integrations/jupiter";
import { isSimPosition } from "./simulation";

export async function manageOpenPositions(
	env: Env,
	config: AgentConfig,
	market: MarketOdds,
): Promise<RiskExit[]> {
	// Paper books are not closed via Jupiter — sim settles on TxLINE scores.
	const open = (await listOpenPositions(env)).filter((p) => !isSimPosition(p));
	if (open.length === 0) return [];

	const exits: RiskExit[] = [];

	for (const pos of open) {
		if (pos.matchId !== market.matchId) continue;

		const oddsNow = market.odds[pos.team];
		if (typeof oddsNow !== "number" || !Number.isFinite(oddsNow) || oddsNow <= 1) continue;
		if (!Number.isFinite(pos.fairOdds) || pos.fairOdds <= 1) continue;

		const entryProb = 1 / pos.fairOdds;
		const nowProb = 1 / oddsNow;
		const edge = pos.side === "BACK" ? nowProb - entryProb : entryProb - nowProb;
		const edgePoints = Math.round(edge * 10000) / 10000;

		let reason: RiskExit["reason"] | null = null;
		if (edge >= config.takeProfitEdge) reason = "take_profit";
		else if (edge <= -config.stopLossEdge) reason = "stop_loss";
		if (!reason) continue;

		const close = await closePosition(config, pos.orderId);
		exits.push({
			positionId: pos.id,
			team: pos.team,
			reason,
			edgePoints,
			success: close.success,
			txid: close.txid,
			error: close.error,
		});

		if (close.success) {
			await updatePosition(env, pos.id, {
				status: "settled",
				settledAt: new Date().toISOString(),
				exitReason: reason,
				exitTxid: close.txid,
				// pnlUsdc intentionally left unset — realized proceeds are
				// on-chain; we never fabricate a number here.
			});
		}
		// On failure the position stays open and is re-evaluated next tick.
	}

	return exits;
}
