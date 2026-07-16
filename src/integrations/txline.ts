/**
 * TxLINE market data client.
 * Real consensus odds only. No fabricated markets.
 *
 * Requires TXLINE_API_URL + TXLINE_API_KEY.
 * Odds are FAIR VALUE for the market-making brain.
 */

import type { AgentConfig } from "../agent/config";
import type { MarketOdds } from "../types";

export async function fetchLatestOdds(config: AgentConfig): Promise<MarketOdds> {
	if (!config.txlineApiUrl || !config.txlineApiKey) {
		throw new Error(
			"TxLINE not configured. Set TXLINE_API_URL and TXLINE_API_KEY.",
		);
	}
	return fetchLive(config);
}

async function fetchLive(config: AgentConfig): Promise<MarketOdds> {
	const candidates = [
		`${config.txlineApiUrl}/odds/latest`,
		`${config.txlineApiUrl}/v1/odds/latest`,
		`${config.txlineApiUrl}/consensus/latest`,
	];

	let lastErr: Error | null = null;
	for (const url of candidates) {
		try {
			const res = await fetch(url, {
				headers: {
					accept: "application/json",
					authorization: `Bearer ${config.txlineApiKey}`,
					"x-api-key": config.txlineApiKey,
				},
			});
			if (!res.ok) {
				lastErr = new Error(`TxLINE HTTP ${res.status} @ ${url}`);
				continue;
			}
			const body = (await res.json()) as Record<string, unknown>;
			return normalizeTxline(body);
		} catch (e) {
			lastErr = e instanceof Error ? e : new Error(String(e));
		}
	}

	throw lastErr ?? new Error("TxLINE unreachable");
}

function normalizeTxline(body: Record<string, unknown>): MarketOdds {
	const match = String(body.match ?? body.event ?? body.name ?? "Unknown match");
	const matchId = String(body.matchId ?? body.id ?? match);
	const statusRaw = String(body.status ?? "UNKNOWN").toUpperCase().replace(/-/g, "_");
	const status = mapStatus(statusRaw, body);

	let odds: Record<string, number> = {};
	if (body.odds && typeof body.odds === "object") {
		for (const [k, v] of Object.entries(body.odds as Record<string, unknown>)) {
			const n = Number(v);
			if (Number.isFinite(n) && n > 1) odds[k] = n;
		}
	}

	if (Object.keys(odds).length === 0 && Array.isArray(body.markets)) {
		const first = body.markets[0] as {
			selections?: Array<{ name?: string; odds?: number }>;
		};
		if (first?.selections) {
			for (const s of first.selections) {
				const n = Number(s.odds);
				if (s.name && Number.isFinite(n) && n > 1) odds[s.name] = n;
			}
		}
	}

	if (Object.keys(odds).length === 0) {
		throw new Error("TxLINE response contained no usable odds");
	}

	return {
		matchId,
		match,
		status,
		minute: typeof body.minute === "number" ? body.minute : undefined,
		odds,
		source: "txline",
		fetchedAt: new Date().toISOString(),
	};
}

function mapStatus(
	statusRaw: string,
	body: Record<string, unknown>,
): MarketOdds["status"] {
	if (statusRaw === "IN_PLAY" || statusRaw === "INPLAY") return "IN_PLAY";
	if (statusRaw === "PRE_MATCH" || statusRaw === "PREMATCH") return "PRE_MATCH";
	if (statusRaw === "ENDED" || statusRaw === "FINISHED") return "ENDED";
	if (body.inPlay === true) return "IN_PLAY";
	return "UNKNOWN";
}
