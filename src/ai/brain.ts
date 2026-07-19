/**
 * Decision agent: Workers AI + PRD Y_net guardrails.
 *
 * Strategy (research pivot): In-Play Market Making — NOT arbitrage.
 * TxLINE odds = fair value baseline.
 * Quote prices on Jupiter Predict with AGENT_POLICY.makerMargin (config.ts).
 * Only TRADE when Y_net > 0 and Y_net/C >= minEdge after idle-yield cost.
 */

import type { AgentConfig } from "../agent/config";
import {
	buildMakerQuotes,
	fairOutcomes,
	selectBestQuote,
	type MakerQuote,
	type YNetResult,
} from "../agent/math";
import type { Decision, Env, MarketOdds, YieldPosition } from "../types";

export type BrainInput = {
	market: MarketOdds;
	yieldPosition: YieldPosition;
	config: AgentConfig;
	/** Already at max open books */
	booksFull?: boolean;
};

export async function decide(env: Env, input: BrainInput): Promise<Decision> {
	const { market, yieldPosition, config, booksFull } = input;

	const outcomes = fairOutcomes(market.odds);
	const quotes = buildMakerQuotes(outcomes, config.makerMargin);
	const best = selectBestQuote(quotes, {
		capital: config.tradeSizeUsdc,
		yieldApy: config.yieldApy,
		horizonHours: config.eventHorizonHours,
		minEdge: config.minEdge,
	});

	const system = [
		"You are Retegol, an in-play market-making agent on Solana.",
		"Idle USDC earns Kamino yield. TxLINE odds are fair value — never arbitrage them against themselves.",
		"When TRADING you place orders on Jupiter Predict around TxLINE fair value with a small margin.",
		"Only TRADE if expected Y_net (spread capture minus opportunity cost of leaving yield) is positive.",
		"Respond with ONLY valid JSON (no markdown):",
		'{"action":"TRADE"|"HOLD","team"?:string,"spread"?:number,"side"?:"BACK"|"LAY","reason":string,"edge"?:number,"yNet"?:number}',
		"team must be one of the odds keys when action is TRADE.",
		"spread is the maker limit decimal odds.",
		"reason is one short plain sentence.",
	].join(" ");

	const user = JSON.stringify(
		{
			strategy: "in_play_market_make",
			market: {
				matchId: market.matchId,
				match: market.match,
				status: market.status,
				minute: market.minute,
				fairOdds: market.odds,
				source: market.source,
			},
			yield: {
				balanceUsdc: yieldPosition.balanceUsdc,
				apy: yieldPosition.apy,
			},
			policy: {
				tradeSizeUsdc: config.tradeSizeUsdc,
				minEdge: config.minEdge,
				makerMargin: config.makerMargin,
				eventHorizonHours: config.eventHorizonHours,
				booksFull: Boolean(booksFull),
				note: "HOLD unless Y_net/C >= minEdge after yield opportunity cost",
			},
			modelHint: best
				? {
						team: best.quote.label,
						fairOdds: best.quote.fairOdds,
						makerBid: best.quote.bidOdds,
						makerAsk: best.quote.askOdds,
						side: best.side,
						yNet: best.yNet.yNet,
						yNetPerUnit: best.yNet.yNetPerUnit,
						opportunityCost: best.yNet.opportunityCost,
					}
				: { tradeable: false },
		},
		null,
		0,
	);

	let decision: Decision;

	try {
		if (!env.AI) {
			decision = heuristicDecision(market, config, quotes, best, booksFull);
		} else {
			const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				max_tokens: 256,
			});

			const rawContent =
				typeof response === "object" && response && "response" in response
					? String((response as { response: string }).response)
					: String(response);

			decision = parseDecision(rawContent);
		}
	} catch (e) {
		console.error("[brain] AI failed, falling back to heuristic", e);
		decision = heuristicDecision(market, config, quotes, best, booksFull);
	}

	return applyGuardrails(decision, market, config, quotes, best, booksFull, yieldPosition);
}

function parseDecision(raw: string): Decision {
	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	const text = jsonMatch ? jsonMatch[0] : raw;
	const parsed = JSON.parse(text) as Partial<Decision>;

	const action = parsed.action === "TRADE" ? "TRADE" : "HOLD";
	const side = parsed.side === "LAY" ? "LAY" : parsed.side === "BACK" ? "BACK" : undefined;
	return {
		action,
		team: typeof parsed.team === "string" ? parsed.team : undefined,
		spread: typeof parsed.spread === "number" ? parsed.spread : undefined,
		side,
		reason: typeof parsed.reason === "string" ? parsed.reason : "No reason provided",
		edge: typeof parsed.edge === "number" ? parsed.edge : undefined,
		yNet: typeof parsed.yNet === "number" ? parsed.yNet : undefined,
	};
}

function heuristicDecision(
	market: MarketOdds,
	config: AgentConfig,
	_quotes: MakerQuote[],
	best: { quote: MakerQuote; yNet: YNetResult; side: "BACK" | "LAY" } | null,
	booksFull?: boolean,
): Decision {
	if (booksFull) {
		return {
			action: "HOLD",
			reason: "Max open maker books reached; capital already deployed.",
			yieldApy: config.yieldApy,
			makerMargin: config.makerMargin,
		};
	}

	if (market.status !== "IN_PLAY") {
		return {
			action: "HOLD",
			reason: "Market not in-play; keep capital in Kamino yield.",
			yieldApy: config.yieldApy,
			makerMargin: config.makerMargin,
		};
	}

	if (!best) {
		return {
			action: "HOLD",
			reason: "Y_net does not clear idle yield cost at current margin.",
			yieldApy: config.yieldApy,
			makerMargin: config.makerMargin,
			edge: 0,
			yNet: 0,
		};
	}

	return {
		action: "TRADE",
		team: best.quote.label,
		spread: best.side === "LAY" ? best.quote.askOdds : best.quote.bidOdds,
		side: best.side,
		fairOdds: best.quote.fairOdds,
		makerMargin: config.makerMargin,
		edge: best.yNet.yNetPerUnit,
		yNet: best.yNet.yNet,
		yieldApy: config.yieldApy,
		reason: `MM quote ${best.quote.label} @ ${best.side === "LAY" ? best.quote.askOdds : best.quote.bidOdds} (fair ${best.quote.fairOdds}); Y_net ${best.yNet.yNet} USDC.`,
	};
}

function applyGuardrails(
	decision: Decision,
	market: MarketOdds,
	config: AgentConfig,
	quotes: MakerQuote[],
	best: { quote: MakerQuote; yNet: YNetResult; side: "BACK" | "LAY" } | null,
	booksFull: boolean | undefined,
	yieldPosition: YieldPosition,
): Decision {
	const base: Decision = {
		...decision,
		yieldApy: config.yieldApy,
		makerMargin: config.makerMargin,
	};

	if (base.action !== "TRADE") {
		return base;
	}

	if (booksFull) {
		return {
			...base,
			action: "HOLD",
			reason: "Guardrail: open book limit; stay in yield.",
		};
	}

	if (market.status !== "IN_PLAY") {
		return {
			...base,
			action: "HOLD",
			reason: "Guardrail: only quote in-play markets.",
		};
	}

	if (yieldPosition.balanceUsdc < config.tradeSizeUsdc) {
		return {
			...base,
			action: "HOLD",
			reason: `Guardrail: yield balance ${yieldPosition.balanceUsdc} < trade size ${config.tradeSizeUsdc}.`,
		};
	}

	// Repair team / price from math if model hallucinated
	const quote =
		(base.team && quotes.find((q) => q.label === base.team)) ||
		best?.quote ||
		quotes[0];

	if (!quote) {
		return {
			...base,
			action: "HOLD",
			reason: "Guardrail: no valid TxLINE fair outcomes to quote.",
		};
	}

	const side = base.side === "LAY" ? "LAY" : "BACK";
	const makerOdds = side === "LAY" ? quote.askOdds : quote.bidOdds;

	// Recompute Y_net with policy capital (authoritative math, not LLM)
	const authoritative = selectBestQuote(quotes, {
		capital: config.tradeSizeUsdc,
		yieldApy: config.yieldApy,
		horizonHours: config.eventHorizonHours,
		minEdge: config.minEdge,
	});

	if (!authoritative || authoritative.yNet.yNet <= 0 || authoritative.yNet.yNetPerUnit < config.minEdge) {
		return {
			...base,
			action: "HOLD",
			team: quote.label,
			spread: makerOdds,
			side,
			fairOdds: quote.fairOdds,
			edge: authoritative?.yNet.yNetPerUnit ?? 0,
			yNet: authoritative?.yNet.yNet ?? 0,
			reason: `Guardrail: Y_net ${authoritative?.yNet.yNet ?? 0} fails minEdge ${config.minEdge}; stay in Kamino.`,
		};
	}

	return {
		...base,
		action: "TRADE",
		team: authoritative.quote.label,
		spread:
			authoritative.side === "LAY"
				? authoritative.quote.askOdds
				: authoritative.quote.bidOdds,
		side: authoritative.side,
		fairOdds: authoritative.quote.fairOdds,
		edge: authoritative.yNet.yNetPerUnit,
		yNet: authoritative.yNet.yNet,
		makerMargin: config.makerMargin,
		reason:
			base.reason && !base.reason.startsWith("Guardrail")
				? base.reason
				: `MM ${authoritative.quote.label} maker ${authoritative.side} @ ${
						authoritative.side === "LAY"
							? authoritative.quote.askOdds
							: authoritative.quote.bidOdds
					}; Y_net ${authoritative.yNet.yNet} USDC beats yield cost.`,
	};
}
