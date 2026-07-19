/**
 * Retegol agent pipeline — PRD §2.1 states:
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
import { verifyMatchOnChain } from "../integrations/txline-verify";
import { getYieldPosition, withdrawYield, depositYield } from "../integrations/kamino";
import { placeMakerOrder } from "../integrations/jupiter";
import { decide } from "../ai/brain";
import type { AgentConfig } from "./config";
import { sweepDeposits } from "../account/sweep";
import { processQueuedWithdrawals } from "../account/autowithdraw";
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

		// 0b. Auto-process queued withdrawals past the delay window
		try {
			await processQueuedWithdrawals(env, config);
		} catch (e) {
			console.log("[autowithdraw] error:", e instanceof Error ? e.message : e);
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

		// 1c. On-chain match verification — TxLINE Merkle proof vs txoracle root PDA
		const verification = await verifyMatchOnChain(config, market.matchId);

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
				verification,
				status: settlements.some((s) => s.success) ? "Settled" : "Skipped",
				execution:
					settlements.length || riskExits.length
						? { settlements: settlements.length ? settlements : undefined, riskExits: riskExits.length ? riskExits : undefined }
						: undefined,
			});
		}

		// 3. Decision
		let decision = await decide(env, {
			market,
			yieldPosition,
			config,
			booksFull,
		});

		// Hard-block only when the on-chain oracle actively rejects the fixture
		// (simulate stage failure). A missing PDA means the oracle hasn't posted
		// today's root yet — treat as soft-warn and let the trade proceed.
		const hardBlocked =
			decision.action === "TRADE" &&
			!verification.ok &&
			verification.stage === "simulate";
		if (hardBlocked) {
			decision = {
				action: "HOLD",
				reason: `Match not verified on-chain — capital stays in yield. ${verification.reason}`,
				yieldApy: config.yieldApy,
				makerMargin: config.makerMargin,
			};
		}

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
				verification,
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
			const intended = decision;
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

			if (exec.order?.status === "placed" && !exec.aborted) {
				status = "Executed";
			} else {
				// Safe failure path for the app: never leave a "TRADE" that didn't land.
				// Recover capital if we already withdrew, then report HOLD + why.
				status = "Aborted";
				execution.aborted = true;
				execution.abortReason =
					exec.abortReason || exec.order?.error || "Trade path failed";

				if (exec.withdrewUsdc && exec.withdrewUsdc > 0) {
					const redeposit = await depositYield(env, config, exec.withdrewUsdc);
					execution.redeposited = redeposit.success;
					execution.redepositTxid = redeposit.txid;
				}

				decision = decisionAfterTradeFailure(intended, execution);
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
			verification,
		});
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		// Honest failure simulation for the app: HOLD only — no invented trade.
		const tick: AgentTickResult = {
			id,
			at: new Date().toISOString(),
			status: "Error",
			decision: {
				action: "HOLD",
				reason:
					detail
						? `Check failed — ${detail}. No trade placed; capital stays in yield.`
						: "Tick failed before a decision could complete. No trade placed; capital stays in yield.",
			},
			error: detail,
			durationMs: Date.now() - started,
		};
		await appendTick(env, tick);
		try {
			const poolUsdc = await getPoolTotalUsdc(env);
			await recordSnapshot(env, poolUsdc);
		} catch {
			// Non-fatal
		}
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

/**
 * App-facing decision when a TRADE attempt fails mid-path.
 * Keeps intended side/team for context; action is always HOLD (nothing executed).
 * Never invents fills, balances, or order IDs.
 */
function decisionAfterTradeFailure(
	intended: Decision,
	execution: TickExecution,
): Decision {
	const why = execution.abortReason || "Trade path failed";
	const target = intended.team
		? ` on ${intended.team}${intended.side ? ` (${intended.side})` : ""}`
		: "";

	let recovery: string;
	if (!execution.withdrewUsdc) {
		recovery = "Capital never left Kamino.";
	} else if (execution.redeposited) {
		recovery = "Capital was redeposited to Kamino.";
	} else {
		recovery = "Withdraw happened but redeposit failed — check the agent wallet.";
	}

	return {
		action: "HOLD",
		reason: `Trade aborted${target} — ${why}. ${recovery}`,
		team: intended.team,
		side: intended.side,
		spread: intended.spread,
		fairOdds: intended.fairOdds,
		edge: intended.edge,
		yNet: intended.yNet,
		yieldApy: intended.yieldApy,
		makerMargin: intended.makerMargin,
	};
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
	verification?: AgentTickResult["verification"];
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
		verification: args.verification,
		openPositions: (await listOpenPositions(args.env)).length,
		durationMs: Date.now() - args.started,
	};
	await appendTick(args.env, tick);
	// Always persist the latest status to KV so the dashboard stays fresh
	// even for idle HOLDs that are intentionally skipped from the DB.
	try {
		await args.env.AGENT_STATE.put(
			"current_status",
			JSON.stringify({ action: tick.decision.action, reason: tick.decision.reason, at: tick.at }),
			{ expirationTtl: 600 },
		);
	} catch {
		// Non-fatal — KV unavailable in some local dev modes
	}
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
	const lastTick = await getLastTick(env);
	const openPositions = await listOpenPositions(env);
	const ready = isAgentReady(env, config);

	// Prefer live on-chain Kamino read; fall back to DB snapshot inside getYieldPosition.
	let position: Awaited<ReturnType<typeof getYieldPosition>> = null;
	let liveApy: number | null = null;
	let walletUsdc: number | null = null;
	try {
		const { fetchKaminoApy, getWalletUsdcBalance } = await import("../integrations/kamino");
		const [pos, apy, free] = await Promise.all([
			getYieldPosition(env, config),
			fetchKaminoApy(config),
			getWalletUsdcBalance(env, config),
		]);
		position = pos;
		liveApy = apy;
		walletUsdc = free;
	} catch {
		position = (await loadPosition(env)) ?? null;
	}

	const livePos = position?.source === "live" ? position : undefined;
	const capital: AgentStatus["capital"] = livePos
		? "funded"
		: flags.wallet
			? "unfunded"
			: "unknown";

	let currentStatus: { action: string; reason: string; at: string } | undefined;
	try {
		const raw = await env.AGENT_STATE.get("current_status");
		if (raw) currentStatus = JSON.parse(raw) as { action: string; reason: string; at: string };
	} catch {
		// Non-fatal
	}

	return {
		ok: ready,
		mode: ready ? "live" : "not_ready",
		integrations: flags,
		position: livePos,
		walletUsdc,
		liveApy,
		capital,
		openPositions,
		lastTick,
		currentStatus,
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
