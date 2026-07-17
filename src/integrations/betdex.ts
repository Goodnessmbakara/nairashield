/**
 * BetDEX execution client.
 * Real REST only. Never invents order IDs or fill PnL.
 *
 * Requires BETDEX_API_KEY (+ optional BETDEX_API_URL).
 */

import type { AgentConfig } from "../agent/config";
import type { TradeOrder } from "../types";

export type PlaceMakerParams = {
	team: string;
	/** Maker limit decimal odds */
	spread: number;
	sizeUsdc: number;
	side?: "BACK" | "LAY";
	fairOdds?: number;
	matchId?: string;
};

export async function placeMakerOrder(
	config: AgentConfig,
	params: PlaceMakerParams,
): Promise<TradeOrder> {
	const side = params.side ?? "BACK";

	if (!config.betdexApiKey) {
		return {
			orderId: "",
			team: params.team,
			side,
			spread: params.spread,
			fairOdds: params.fairOdds,
			sizeUsdc: params.sizeUsdc,
			status: "failed",
			error: "BetDEX not configured. Set BETDEX_API_KEY.",
		};
	}

	return placeLive(config, params, side);
}

async function placeLive(
	config: AgentConfig,
	params: PlaceMakerParams,
	side: "BACK" | "LAY",
): Promise<TradeOrder> {
	const url = `${config.betdexApiUrl}/v1/orders`;
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
				authorization: `Bearer ${config.betdexApiKey}`,
			},
			body: JSON.stringify({
				side: side,
				type: "LIMIT",
				timeInForce: "GTC",
				selectionId: params.team,
				marketId: params.matchId,
				price: params.spread,
				stake: params.sizeUsdc,
				meta: {
					strategy: "nairashield_mm",
					fairOdds: params.fairOdds,
					source: "txline",
				},
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return {
				orderId: "",
				team: params.team,
				side,
				spread: params.spread,
				fairOdds: params.fairOdds,
				sizeUsdc: params.sizeUsdc,
				status: "failed",
				error: `BetDEX HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
			};
		}

		const body = (await res.json()) as {
			id?: string;
			orderId?: string;
			txid?: string;
		};
		const orderId = body.orderId ?? body.id;
		if (!orderId) {
			return {
				orderId: "",
				team: params.team,
				side,
				spread: params.spread,
				fairOdds: params.fairOdds,
				sizeUsdc: params.sizeUsdc,
				status: "failed",
				error: "BetDEX response missing order id",
			};
		}

		return {
			orderId: String(orderId),
			team: params.team,
			side,
			spread: params.spread,
			fairOdds: params.fairOdds,
			sizeUsdc: params.sizeUsdc,
			status: "placed",
			txid: body.txid,
		};
	} catch (e) {
		return {
			orderId: "",
			team: params.team,
			side,
			spread: params.spread,
			fairOdds: params.fairOdds,
			sizeUsdc: params.sizeUsdc,
			status: "failed",
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/** Real settlement/fill lookup. Returns null if the API cannot confirm. */
export async function fetchOrderSettlement(
	config: AgentConfig,
	orderId: string,
): Promise<{ settled: boolean; pnlUsdc?: number; returnedUsdc?: number; error?: string } | null> {
	if (!config.betdexApiKey || !orderId) return null;

	const url = `${config.betdexApiUrl}/v1/orders/${encodeURIComponent(orderId)}`;
	try {
		const res = await fetch(url, {
			headers: {
				accept: "application/json",
				authorization: `Bearer ${config.betdexApiKey}`,
			},
		});
		if (!res.ok) {
			return {
				settled: false,
				error: `BetDEX order lookup HTTP ${res.status}`,
			};
		}
		const body = (await res.json()) as {
			status?: string;
			settled?: boolean;
			pnl?: number;
			pnlUsdc?: number;
			returnedUsdc?: number;
			stake?: number;
			payout?: number;
		};

		const status = String(body.status ?? "").toUpperCase();
		const settled =
			body.settled === true ||
			status === "SETTLED" ||
			status === "CLOSED" ||
			status === "FILLED_SETTLED";

		if (!settled) {
			return { settled: false };
		}

		const pnlUsdc =
			typeof body.pnlUsdc === "number"
				? body.pnlUsdc
				: typeof body.pnl === "number"
					? body.pnl
					: typeof body.payout === "number" && typeof body.stake === "number"
						? body.payout - body.stake
						: undefined;

		const returnedUsdc =
			typeof body.returnedUsdc === "number"
				? body.returnedUsdc
				: typeof body.payout === "number"
					? body.payout
					: undefined;

		if (pnlUsdc === undefined && returnedUsdc === undefined) {
			return {
				settled: false,
				error: "BetDEX order settled but response has no PnL/payout fields",
			};
		}

		return { settled: true, pnlUsdc, returnedUsdc };
	} catch (e) {
		return {
			settled: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}
