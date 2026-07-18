/**
 * NairaShield agent pipeline — PRD §2.1 states:
 *
 * 0. Settlement → close confirmed books, redeposit to Kamino
 * 1. Market     → real TxLINE consensus odds (fair value)
 * 2. Yield      → real Kamino position (or HOLD if none)
 * 3. Decision   → Llama + Y_net market-making guardrails
 * 4. Execution  → withdraw Kamino → Jupiter Predict maker (safe abort)
 * 5. Book       → register open position for later settlement
 * 6. Persist    → KV history
 *
 * No mock feeds, fake balances, or invented order fills.
 */

import type {
	Env,
	AgentTickResult,
	TickExecution,
	Decision,
	AgentStatus,
	YieldPosition,
	MarketOdds,
} from "../types";
import { loadAgentConfig, integrationFlags, isAgentReady } from "./config";
import {
	appendTick,
	getLastTick,
	loadPosition,
	listOpenPositions,
	addOpenPosition,
} from "./store";
import { buildOpenPosition, settleDuePositions } from "./settlement";
import { detectOddsMovement } from "./movement";
import { manageOpenPositions } from "./risk";
import { fetchLatestOdds, NoLiveOddsError } from "../integrations/txline";
import { getYieldPosition, withdrawYield, depositYield } from "../integrations/kamino";
import { placeMakerOrder } from "../integrations/jupiter";
import { decide } from "../ai/brain";
import type { AgentConfig } from "./config";
import { sweepDeposits } from "../account/sweep";
import { recordSnapshot, getPoolTotalUsdc } from "../account/ledger";

export async function runAgentTick(env: Env): Promise<AgentTickResult> {
	const started = Date.now();
	const id = `tick_${started}`;
	const config = loadAgentConfig(env);
	const flags = integrationFlags(env, config);

	try {
		// 0. Sweep user deposits (best-effort — never abort the tick on sweep failure)
		try {
			await sweepDeposits(env, config);
		} catch (e) {
			console.log("[sweep] error:", e instanceof Error ? e.message : e);
		}

		// Preflight: hold with a clear reason (never invent market data)
		if (!flags.txline) {
			return finishTick({
				id,
				started,
				config,
				env,
				decision: {
					action: "HOLD",
					reason:
						"TxLINE not configured. Set TXLINE_API_URL and TXLINE_API_KEY in .dev.vars, then restart the worker.",
					yieldApy: config.yieldApy,
					makerMargin: config.makerMargin,
				},
				status: "Skipped",
			});
		}

		// 1. Real market feed. A healthy feed with no match in play is a HOLD,
		// not an error — the agent's correct move is to stay in yield.
		let market: MarketOdds;
		try {
			market = await fetchLatestOdds(config);
		} catch (e) {
			if (e instanceof NoLiveOddsError) {
				const yieldPosition = await getYieldPosition(env, config);
				return finishTick({
					id,
					started,
					config,
					env,
					yieldPosition: yieldPosition ?? undefined,
					decision: {
						action: "HOLD",
						reason: e.message,
						yieldApy: config.yieldApy,
						makerMargin: config.makerMargin,
					},
					status: "Skipped",
				});
			}
			throw e;
		}

		// 1b. Sharp Movement Detector — compare against the PREVIOUS persisted
		// snapshot of this fixture (must read before this tick is appended).
		// No prior snapshot => no signal; nothing is synthesized.
		const movement = detectOddsMovement(
			await getLastTick(env),
			market,
			config.movementThreshold,
		);

		// 0. Settlement — only with real venue settlement data
		const settlements = await settleDuePositions(env, config, market);

		// 0b. TP/SL risk manager — mark open positions to market on the live
		// odds; close early on take-profit or stop-loss (real Jupiter closes).
		const riskExits = await manageOpenPositions(env, config, market);

		// 2. Real yield snapshot (null if never funded on-chain)
		const yieldPosition = await getYieldPosition(env, config);

		const openBooks = await listOpenPositions(env);
		const booksFull = openBooks.length >= config.maxOpenPositions;

		// Missing live capital → HOLD, do not invent a vault balance.
		// Still run the real brain on the real odds as a dry-run projection so the
		// decision logic is observable before any capital is deployed.
		if (!yieldPosition) {
			const projection = await buildProjection(env, config, market, booksFull);
			const wouldTrade = projection?.decision.action === "TRADE";
			return finishTick({
				id,
				started,
				config,
				env,
				market,
				// omit yield — never fabricate a USDC balance
				decision: {
					action: "HOLD",
					reason: projection
						? `No live Kamino capital, so nothing is executed. On the live odds the agent ${
								wouldTrade
									? `would place a maker quote — ${projection.decision.reason}`
									: `would also hold — ${projection.decision.reason}`
							}`
						: "No live Kamino position. Fund the agent wallet and deposit USDC before trading.",
					yieldApy: config.yieldApy,
					makerMargin: config.makerMargin,
				},
				projection,
				movement,
				status: settlements.some((s) => s.success) ? "Settled" : "Skipped",
				execution:
					settlements.length || riskExits.length
						? { settlements: settlements.length ? settlements : undefined, riskExits: riskExits.length ? riskExits : undefined }
						: undefined,
			});
		}

		// 3. Decision
		const decision = await decide(env, {
			market,
			yieldPosition,
			config,
			booksFull,
		});

		if (settlements.length > 0 && decision.action === "HOLD") {
			return finishTick({
				id,
				started,
				config,
				env,
				market,
				yieldPosition,
				decision: {
					...decision,
					reason:
						settlements.filter((s) => s.success).length > 0
							? `Settled confirmed books back to Kamino. ${decision.reason}`
							: decision.reason,
				},
				movement,
				status: settlements.some((s) => s.success) ? "Settled" : "Skipped",
				execution: { settlements, riskExits: riskExits.length ? riskExits : undefined },
			});
		}

		// 4. Execution
		let status: AgentTickResult["status"] = settlements.some((s) => s.success)
			? "Settled"
			: "Skipped";
		let execution: TickExecution | undefined =
			settlements.length || riskExits.length
				? { settlements: settlements.length ? settlements : undefined, riskExits: riskExits.length ? riskExits : undefined }
				: undefined;

		if (decision.action === "TRADE") {
			const exec = await executeTradePath(
				env,
				config,
				decision,
				market.matchId,
				market.match,
				market.p1,
				market.p2,
			);
			execution = {
				...exec,
				settlements: settlements.length ? settlements : undefined,
				riskExits: riskExits.length ? riskExits : undefined,
			};
			if (exec.aborted) {
				status = "Aborted";
			} else if (exec.order?.status === "placed") {
				status = "Executed";
			} else {
				status = "Aborted";
				execution = {
					...execution,
					aborted: true,
					abortReason: exec.order?.error || exec.abortReason || "Order failed",
				};
				if (exec.withdrewUsdc && exec.withdrewUsdc > 0) {
					const redeposit = await depositYield(env, config, exec.withdrewUsdc);
					execution.redeposited = redeposit.success;
					execution.redepositTxid = redeposit.txid;
				}
			}
		}

		const exitNote = describeRiskExits(riskExits);
		return finishTick({
			id,
			started,
			config,
			env,
			market,
			yieldPosition: (await getYieldPosition(env, config)) ?? yieldPosition,
			decision: exitNote ? { ...decision, reason: `${exitNote} ${decision.reason}` } : decision,
			status,
			execution,
			movement,
		});
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		const tick: AgentTickResult = {
			id,
			at: new Date().toISOString(),
			status: "Error",
			decision: {
				action: "HOLD",
				reason: detail || "Tick failed before a decision could complete.",
			},
			error: detail,
			durationMs: Date.now() - started,
		};
		await appendTick(env, tick);
		return tick;
	}
}


function describeRiskExits(exits: import("../types").RiskExit[]): string {
	const done = exits.filter((x) => x.success);
	if (done.length === 0) return "";
	return done
		.map(
			(x) =>
				`${x.reason === "take_profit" ? "Took profit on" : "Cut loss on"} ${x.team} (${x.edgePoints > 0 ? "+" : ""}${Math.round(x.edgePoints * 100)} pts).`,
		)
		.join(" ");
}

async function finishTick(args: {
	id: string;
	started: number;
	config: AgentConfig;
	env: Env;
	market?: MarketOdds;
	yieldPosition?: YieldPosition;
	decision: Decision;
	status: AgentTickResult["status"];
	execution?: TickExecution;
	projection?: AgentTickResult["projection"];
	movement?: AgentTickResult["movement"];
}): Promise<AgentTickResult> {
	const tick: AgentTickResult = {
		id: args.id,
		at: new Date().toISOString(),
		status: args.status,
		decision: args.decision,
		market: args.market,
		yield: args.yieldPosition,
		execution: args.execution,
		projection: args.projection,
		movement: args.movement?.length ? args.movement : undefined,
		openPositions: (await listOpenPositions(args.env)).length,
		durationMs: Date.now() - args.started,
	};
	await appendTick(args.env, tick);
	// Record pool snapshot for NAV history
	try {
		const poolUsdc = await getPoolTotalUsdc(args.env);
		await recordSnapshot(args.env, poolUsdc);
	} catch {
		// Non-fatal
	}
	return tick;
}

/**
 * Dry-run: run the real decision model on the real odds with a hypothetical,
 * policy-sized balance. Purely for observability when no capital is deployed —
 * nothing is stored or executed, and the balance is never surfaced as real.
 * Best-effort: a failure here must never break the tick.
 */
async function buildProjection(
	env: Env,
	config: AgentConfig,
	market: MarketOdds,
	booksFull: boolean,
): Promise<AgentTickResult["projection"] | undefined> {
	try {
		const hypothetical: YieldPosition = {
			protocol: "kamino",
			asset: "USDC",
			balanceUsdc: config.tradeSizeUsdc,
			apy: config.yieldApy,
			updatedAt: new Date().toISOString(),
			source: "projection",
		};
		const decision = await decide(env, {
			market,
			yieldPosition: hypothetical,
			config,
			booksFull,
		});
		return { decision, hypotheticalCapitalUsdc: config.tradeSizeUsdc };
	} catch {
		return undefined;
	}
}

/**
 * Safe two-step execution:
 * withdraw Kamino → if fail, abort (never place Jupiter Predict).
 * On real order place, open book for settlement.
 */
async function executeTradePath(
	env: Env,
	config: AgentConfig,
	decision: Decision,
	matchId: string,
	match: string,
	p1?: string,
	p2?: string,
): Promise<TickExecution> {
	const size = config.tradeSizeUsdc;
	const team = decision.team!;
	const spread = decision.spread ?? 0;
	const side = decision.side ?? "BACK";

	const withdraw = await withdrawYield(env, config, size);
	if (!withdraw.success) {
		return {
			aborted: true,
			abortReason: withdraw.error || "Yield withdraw failed",
		};
	}

	const order = await placeMakerOrder(config, {
		team,
		spread,
		sizeUsdc: size,
		side,
		fairOdds: decision.fairOdds,
		matchId,
		p1,
		p2,
	});

	if (order.status !== "placed") {
		return {
			withdrewUsdc: size,
			withdrawTxid: withdraw.txid,
			order,
			aborted: true,
			abortReason: order.error || "Jupiter Predict order failed",
		};
	}

	const position = buildOpenPosition({
		matchId,
		match,
		team,
		side,
		sizeUsdc: size,
		makerOdds: spread,
		fairOdds: decision.fairOdds ?? spread,
		orderId: order.orderId,
		horizonHours: config.eventHorizonHours,
	});
	await addOpenPosition(env, position);

	return {
		withdrewUsdc: size,
		withdrawTxid: withdraw.txid,
		order,
	};
}

export async function getAgentStatus(env: Env): Promise<AgentStatus> {
	const config = loadAgentConfig(env);
	const flags = integrationFlags(env, config);
	const position = (await loadPosition(env)) ?? undefined;
	const lastTick = await getLastTick(env);
	const openPositions = await listOpenPositions(env);
	const ready = isAgentReady(env, config);

	return {
		ok: ready,
		mode: ready ? "live" : "not_ready",
		integrations: flags,
		position: position?.source === "live" ? position : undefined,
		openPositions,
		lastTick,
		config: {
			tradeSizeUsdc: config.tradeSizeUsdc,
			yieldApy: config.yieldApy,
			minEdge: config.minEdge,
			makerMargin: config.makerMargin,
			eventHorizonHours: config.eventHorizonHours,
			maxOpenPositions: config.maxOpenPositions,
		},
	};
}

/** Backward-compatible export */
export async function runAgent(env: Env) {
	const tick = await runAgentTick(env);
	if (tick.status === "Error") {
		return { error: tick.error || "Agent error", raw: tick.raw, decision: tick.decision };
	}
	return {
		status: tick.status === "Executed" ? "Executed" : "Skipped",
		decision: tick.decision,
		tick,
	};
}
