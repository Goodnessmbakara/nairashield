/**
 * Paper / simulation capital path for hackathon demos.
 *
 * Rules:
 * - Odds, fixtures, scores always come from live TxLINE (never invented markets).
 * - Virtual bankroll + sim fills are explicit (orderId prefix `sim_`, execution.simulated).
 * - Used when live Kamino capital is missing or live Jupiter execution fails.
 * Judges allow simulation as long as the data feed is real.
 */

import type { Env, MarketOdds, OpenPosition, SettlementResult, TickExecution, Decision } from "../types";
import type { AgentConfig } from "./config";
import { addOpenPosition, listOpenPositions, updatePosition } from "./store";
import { buildOpenPosition } from "./settlement";
import { fetchScoreSnapshot } from "../integrations/txline";
import { round4 } from "./math";

const SIM_BANKROLL_KEY = "sim_bankroll";
/** Starting virtual USDC when no live Kamino position (hackathon paper capital). */
export const SIM_STARTING_BANKROLL = 100;

export type SimBankroll = {
	bankrollUsdc: number;
	updatedAt: string;
	/** How many sim trades opened */
	trades: number;
};

export function isSimOrderId(orderId: string | undefined): boolean {
	return Boolean(orderId && orderId.startsWith("sim_"));
}

export function isSimPosition(pos: OpenPosition): boolean {
	return isSimOrderId(pos.orderId);
}

export async function loadSimBankroll(env: Env): Promise<SimBankroll> {
	try {
		const raw = await env.AGENT_STATE.get(SIM_BANKROLL_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as SimBankroll;
			if (typeof parsed.bankrollUsdc === "number" && Number.isFinite(parsed.bankrollUsdc)) {
				return parsed;
			}
		}
	} catch {
		/* fall through to seed */
	}
	return {
		bankrollUsdc: SIM_STARTING_BANKROLL,
		updatedAt: new Date().toISOString(),
		trades: 0,
	};
}

export async function saveSimBankroll(env: Env, state: SimBankroll): Promise<void> {
	await env.AGENT_STATE.put(SIM_BANKROLL_KEY, JSON.stringify(state), {
		expirationTtl: 60 * 60 * 24 * 60, // 60 days
	});
}

/**
 * Place a simulated maker fill on a real TxLINE fixture.
 * Debits virtual bankroll; opens a book with orderId `sim_*`.
 */
export async function executeSimTrade(
	env: Env,
	config: AgentConfig,
	decision: Decision,
	market: MarketOdds,
): Promise<{ execution: TickExecution; bankroll: SimBankroll; opened: boolean }> {
	const bankroll = await loadSimBankroll(env);
	const size = Math.min(config.tradeSizeUsdc, bankroll.bankrollUsdc);

	if (!decision.team || !decision.side || typeof decision.spread !== "number") {
		return {
			opened: false,
			bankroll,
			execution: {
				simulated: true,
				aborted: true,
				abortReason: "Simulation skipped — decision missing team/side/spread",
				simBankrollUsdc: bankroll.bankrollUsdc,
			},
		};
	}

	if (size < 1) {
		return {
			opened: false,
			bankroll,
			execution: {
				simulated: true,
				aborted: true,
				abortReason: `Simulation bankroll too low ($${bankroll.bankrollUsdc.toFixed(2)})`,
				simBankrollUsdc: bankroll.bankrollUsdc,
			},
		};
	}

	const open = await listOpenPositions(env);
	const simOpen = open.filter(isSimPosition);
	if (simOpen.length >= config.maxOpenPositions) {
		return {
			opened: false,
			bankroll,
			execution: {
				simulated: true,
				aborted: true,
				abortReason: `Simulation max open positions (${config.maxOpenPositions})`,
				simBankrollUsdc: bankroll.bankrollUsdc,
			},
		};
	}

	const orderId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const pos = buildOpenPosition({
		matchId: market.matchId,
		match: market.match,
		team: decision.team,
		side: decision.side,
		sizeUsdc: size,
		makerOdds: decision.spread,
		fairOdds: decision.fairOdds ?? decision.spread,
		orderId,
		horizonHours: config.eventHorizonHours,
	});
	await addOpenPosition(env, pos);

	const next: SimBankroll = {
		bankrollUsdc: round4(bankroll.bankrollUsdc - size),
		updatedAt: new Date().toISOString(),
		trades: bankroll.trades + 1,
	};
	await saveSimBankroll(env, next);

	return {
		opened: true,
		bankroll: next,
		execution: {
			simulated: true,
			withdrewUsdc: size,
			simBankrollUsdc: next.bankrollUsdc,
			order: {
				orderId,
				team: decision.team,
				side: decision.side,
				spread: decision.spread,
				fairOdds: decision.fairOdds,
				sizeUsdc: size,
				status: "placed",
			},
		},
	};
}

/**
 * Settle simulated books using real TxLINE scores (or ENDED status).
 * Credits virtual bankroll — never invents a match result.
 */
export async function settleSimPositions(
	env: Env,
	config: AgentConfig,
	market: MarketOdds | null,
): Promise<SettlementResult[]> {
	const open = (await listOpenPositions(env)).filter(isSimPosition);
	if (open.length === 0) return [];

	const results: SettlementResult[] = [];
	let bankroll = await loadSimBankroll(env);

	for (const pos of open) {
		const outcome = await resolveSimOutcome(config, pos, market);
		if (!outcome) {
			results.push({
				positionId: pos.id,
				matchId: pos.matchId,
				pnlUsdc: 0,
				returnedUsdc: 0,
				success: false,
				error: "Simulation waiting for TxLINE score / match end",
			});
			continue;
		}

		const { won } = outcome;
		const pnlUsdc = won
			? round4(pos.sizeUsdc * (pos.makerOdds - 1))
			: round4(-pos.sizeUsdc);
		const returnedUsdc = won ? round4(pos.sizeUsdc + pnlUsdc) : 0;

		bankroll = {
			bankrollUsdc: round4(bankroll.bankrollUsdc + returnedUsdc),
			updatedAt: new Date().toISOString(),
			trades: bankroll.trades,
		};

		await updatePosition(env, pos.id, {
			status: "settled",
			pnlUsdc,
			settledAt: new Date().toISOString(),
		});

		results.push({
			positionId: pos.id,
			matchId: pos.matchId,
			pnlUsdc,
			returnedUsdc,
			success: true,
		});
	}

	await saveSimBankroll(env, bankroll);
	return results;
}

async function resolveSimOutcome(
	config: AgentConfig,
	pos: OpenPosition,
	market: MarketOdds | null,
): Promise<{ won: boolean } | null> {
	// Prefer score snapshot for this fixture
	const score = await fetchScoreSnapshot(config, pos.matchId);
	const names = parseTeams(pos.match, market);

	if (score && names) {
		// Need a finished-ish signal: ENDED on feed, or settleAfter elapsed with scores
		const ended =
			(market && market.matchId === pos.matchId && market.status === "ENDED") ||
			Date.now() >= Date.parse(pos.settleAfter);
		if (!ended) return null;

		const winner =
			score.home > score.away
				? names.home
				: score.away > score.home
					? names.away
					: "Draw";
		return { won: positionWins(pos, winner) };
	}

	// No score: only settle if TxLINE says ENDED and we can infer from market.odds keys only
	if (market && market.matchId === pos.matchId && market.status === "ENDED") {
		// Without scores we cannot know winner — do not invent
		return null;
	}

	return null;
}

function parseTeams(
	match: string,
	market: MarketOdds | null,
): { home: string; away: string } | null {
	if (market?.p1 && market?.p2) return { home: market.p1, away: market.p2 };
	const parts = match.split(/\s+vs\s+/i);
	if (parts.length === 2 && parts[0] && parts[1]) {
		return { home: parts[0].trim(), away: parts[1].trim() };
	}
	return null;
}

function positionWins(pos: OpenPosition, winnerLabel: string): boolean {
	const team = pos.team.toLowerCase();
	const winner = winnerLabel.toLowerCase();
	const teamWon =
		team === winner ||
		winner.includes(team) ||
		team.includes(winner) ||
		(team === "draw" && (winner === "draw" || winner === "x"));

	if (pos.side === "BACK") return teamWon;
	// LAY wins when team does not win
	return !teamWon;
}
