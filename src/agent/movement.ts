/**
 * Sharp Movement Detector.
 *
 * Compares two consecutive REAL TxLINE snapshots of the same fixture and flags
 * outcomes whose decimal odds moved by more than the policy threshold. Signals
 * are derived purely from persisted tick history — if there is no prior
 * snapshot for this fixture, there is no signal (never synthesized).
 *
 * Odds shortening (price down) = money/probability moving TOWARD the outcome.
 * Odds drifting (price up)     = market moving away from it.
 */

import type { AgentTickResult, MarketOdds, OddsMovement } from "../types";

export function detectOddsMovement(
	prevTick: AgentTickResult | null,
	current: MarketOdds,
	thresholdPct: number,
): OddsMovement[] {
	const prev = prevTick?.market;
	if (!prev || prev.matchId !== current.matchId) return [];
	if (!prev.odds || !current.odds) return [];

	const signals: OddsMovement[] = [];
	for (const [outcome, toOdds] of Object.entries(current.odds)) {
		const fromOdds = prev.odds[outcome];
		if (
			typeof fromOdds !== "number" ||
			!Number.isFinite(fromOdds) ||
			!Number.isFinite(toOdds) ||
			fromOdds <= 1 ||
			toOdds <= 1
		) {
			continue;
		}

		const changePct = (toOdds - fromOdds) / fromOdds;
		if (Math.abs(changePct) < thresholdPct) continue;

		signals.push({
			outcome,
			fromOdds,
			toOdds,
			changePct: Math.round(changePct * 10000) / 10000,
			direction: changePct < 0 ? "shortening" : "drifting",
			since: prevTick.at,
		});
	}

	// Largest absolute move first
	return signals.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}
