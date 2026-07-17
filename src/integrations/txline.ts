/**
 * TxLINE market data client.
 * Real consensus odds only. No fabricated markets.
 *
 * Auth confirmed by live API probing (2026-07-17):
 *   - Guest JWT:   POST /auth/guest/start → { token }
 *   - API Token:   POST /api/token/activate (after on-chain subscribe) → activated token
 *   - Data calls:  Authorization: Bearer {jwt}  +  X-Api-Token: {apiToken}
 *
 * Confirmed live endpoint paths (devnet: txline-dev.txodds.com, mainnet: txline.txodds.com):
 *   POST /auth/guest/start                → get guest JWT (no credentials needed)
 *   POST /api/token/activate              → activate api token after on-chain subscribe
 *   GET  /api/odds/snapshot               → global odds snapshot (needs X-Api-Token)
 *   GET  /api/odds/snapshot/{fixtureId}  → single fixture odds snapshot
 *   GET  /api/scores/snapshot            → global scores snapshot
 *   GET  /api/scores/snapshot/{fixtureId}→ single fixture score snapshot
 *   GET  /api/fixtures/snapshot          → fixture metadata
 *   SSE  /api/odds/stream                → streaming odds (SSE)
 *   SSE  /api/scores/stream              → streaming scores (SSE)
 *
 * Service levels (mainnet):
 *   SL1  = 60-second delayed World Cup + Int Friendlies (FREE, no TxL needed)
 *   SL12 = real-time World Cup + Int Friendlies (FREE, no TxL needed)
 *
 * Note: TXLINE_API_KEY in env is the ACTIVATED api token returned by /api/token/activate.
 * The guest JWT is obtained fresh per request when needed.
 */

import type { AgentConfig } from "../agent/config";
import type { MarketOdds } from "../types";

/**
 * Fetch fresh guest JWT from TxLINE (no credentials required).
 * Valid for ~24h. Used as Authorization Bearer header.
 */
async function getGuestJwt(apiOrigin: string): Promise<string> {
	const res = await fetch(`${apiOrigin}/auth/guest/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});
	if (!res.ok) throw new Error(`TxLINE guest auth failed: HTTP ${res.status}`);
	const body = (await res.json()) as { token: string };
	if (!body.token) throw new Error("TxLINE guest auth: no token in response");
	return body.token;
}

function buildHeaders(jwt: string, apiToken: string): Record<string, string> {
	return {
		"accept": "application/json",
		// Confirmed auth pattern from docs + live probing:
		"Authorization": `Bearer ${jwt}`,
		"X-Api-Token": apiToken,
	};
}

function getOrigin(config: AgentConfig): string {
	// Strip /api suffix if user provided full URL — we manage the path
	return (config.txlineApiUrl ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
}

/** Exposed for use in the agent decision loop */
export async function fetchLatestOdds(
	config: AgentConfig,
	fixtureId?: string,
): Promise<MarketOdds> {
	if (!config.txlineApiUrl || !config.txlineApiKey) {
		throw new Error(
			"TxLINE not configured. Set TXLINE_API_URL and TXLINE_API_KEY.\n" +
			"TXLINE_API_URL = https://txline-dev.txodds.com (devnet) or https://txline.txodds.com (mainnet)\n" +
			"TXLINE_API_KEY = activated api token from POST /api/token/activate",
		);
	}
	return fetchOddsSnapshot(config, fixtureId);
}

/**
 * Fetch odds snapshot from confirmed TxLINE API paths.
 * Refreshes guest JWT automatically — no need to store it in env.
 */
async function fetchOddsSnapshot(
	config: AgentConfig,
	fixtureId?: string,
): Promise<MarketOdds> {
	const origin = getOrigin(config);
	const apiToken = config.txlineApiKey;

	// Get fresh guest JWT (confirmed: POST /auth/guest/start)
	const jwt = await getGuestJwt(origin);
	const headers = buildHeaders(jwt, apiToken);

	// Confirmed endpoint paths from live API probing
	const candidates: string[] = [];
	if (fixtureId) {
		candidates.push(
			`${origin}/api/odds/snapshot/${fixtureId}`,
			`${origin}/api/scores/snapshot/${fixtureId}`,
		);
	}
	// Global snapshot — exists on mainnet; devnet serves per-fixture only (404).
	candidates.push(`${origin}/api/odds/snapshot`);

	let lastErr: Error | null = null;
	let sawEmptyFeed = false;

	const tryUrl = async (url: string): Promise<MarketOdds | null> => {
		try {
			const res = await fetch(url, { headers });
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				lastErr = new Error(`TxLINE HTTP ${res.status} @ ${url}: ${text}`);
				return null;
			}
			const body = (await res.json()) as unknown;
			if (Array.isArray(body) && body.length === 0) {
				// Authenticated, healthy response — no odds in the current
				// snapshot interval for this scope. Not an error.
				sawEmptyFeed = true;
				return null;
			}
			return normalizeTxline(body, url);
		} catch (e) {
			lastErr = e instanceof Error ? e : new Error(String(e));
			return null;
		}
	};

	for (const url of candidates) {
		const market = await tryUrl(url);
		if (market) return market;
	}

	// Per-fixture sweep from the real fixtures feed (the reference client's
	// model): nearest upcoming / in-play fixtures first.
	const fixtures = await listFixtures(origin, headers);
	for (const f of fixtures.slice(0, 6)) {
		const market = await tryUrl(`${origin}/api/odds/snapshot/${f.fixtureId}`);
		if (market) return market;
	}

	if (sawEmptyFeed) {
		const next = fixtures.find((f) => f.start > Date.now());
		throw new NoLiveOddsError(
			next
				? `${next.p1} vs ${next.p2} (${new Date(next.start).toUTCString().replace(":00 GMT", " UTC")})`
				: null,
		);
	}
	throw lastErr ?? new Error("TxLINE unreachable");
}

/** Thrown when the feed is healthy but no match is in play right now. */
export class NoLiveOddsError extends Error {
	constructor(nextFixture: string | null) {
		super(
			nextFixture
				? `No live odds right now — no match is in play. Next fixture: ${nextFixture}. Capital stays in yield.`
				: "No live odds right now — no match is in play. Capital stays in yield.",
		);
		this.name = "NoLiveOddsError";
	}
}

type FixtureRef = { fixtureId: string; p1: string; p2: string; start: number };

/** Real fixtures feed, sorted in-play/nearest first. Empty on any failure. */
async function listFixtures(
	origin: string,
	headers: Record<string, string>,
): Promise<FixtureRef[]> {
	try {
		const res = await fetch(`${origin}/api/fixtures/snapshot`, { headers });
		if (!res.ok) return [];
		const body = (await res.json()) as unknown;
		const list = Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
		const now = Date.now();
		return list
			.map((f) => ({
				fixtureId: String(f.FixtureId ?? f.fixtureId ?? ""),
				p1: String(f.Participant1 ?? f.participant1 ?? ""),
				p2: String(f.Participant2 ?? f.participant2 ?? ""),
				start: Number(f.StartTime ?? f.startTime ?? 0),
			}))
			.filter((f) => f.fixtureId)
			// In-play (started but recent) first, then soonest upcoming
			.sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now));
	} catch {
		return [];
	}
}

/**
 * Fetch live score snapshot for a specific fixture.
 */
export async function fetchScoreSnapshot(
	config: AgentConfig,
	fixtureId: string,
): Promise<{ home: number; away: number; minute?: number } | null> {
	if (!config.txlineApiUrl || !config.txlineApiKey) return null;

	const origin = getOrigin(config);
	const jwt = await getGuestJwt(origin);
	const url = `${origin}/api/scores/snapshot/${fixtureId}`;

	try {
		const res = await fetch(url, {
			headers: buildHeaders(jwt, config.txlineApiKey),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as Record<string, unknown>;

		// TG confirmed: wire payloads may use PascalCase
		const home = Number(body.HomeScore ?? body.homeScore ?? body.home ?? NaN);
		const away = Number(body.AwayScore ?? body.awayScore ?? body.away ?? NaN);
		if (!Number.isFinite(home) || !Number.isFinite(away)) return null;

		const minute = Number(body.Minute ?? body.minute ?? NaN);
		return {
			home,
			away,
			minute: Number.isFinite(minute) ? minute : undefined,
		};
	} catch {
		return null;
	}
}

/**
 * Normalize TxLINE API response to internal MarketOdds type.
 *
 * TxLINE wire format: TG users reported PascalCase keys in live payloads
 * while docs show camelCase. We read both to be safe.
 */
function normalizeTxline(body: unknown, sourceUrl: string): MarketOdds {
	// Snapshot endpoints return an ARRAY of odds elements (reference:
	// subscription_free_tier.ts reads response.data[0]). Fixture-specific calls
	// may return a single object. Handle both; an empty array means no live odds
	// in the current interval, which is an honest "no odds" — not a parse failure.
	if (Array.isArray(body)) {
		for (const el of body) {
			const parsed = normalizeElement(el);
			if (parsed) return parsed;
		}
		throw new Error(
			`TxLINE snapshot from ${sourceUrl} returned ${
				body.length === 0
					? "an empty array (no live odds in the current interval)"
					: `${body.length} element(s) but none had usable odds`
			}.`,
		);
	}

	const parsed = normalizeElement(body);
	if (parsed) return parsed;
	throw new Error(
		`TxLINE response from ${sourceUrl} contained no usable odds. Body keys: ${
			body && typeof body === "object" ? Object.keys(body).join(", ") : typeof body
		}`,
	);
}

/**
 * Normalize a single TxLINE odds element to internal MarketOdds.
 * Returns null (rather than throwing) when the element carries no usable odds,
 * so the array path can skip empties and try the next element.
 */
function normalizeElement(raw: unknown): MarketOdds | null {
	if (!raw || typeof raw !== "object") return null;
	const body = raw as Record<string, unknown>;

	const match = String(
		body.Match ?? body.match ??
		body.Event ?? body.event ??
		body.Name ?? body.name ??
		"Unknown match",
	);
	const matchId = String(
		body.FixtureId ?? body.fixtureId ??
		body.MatchId ?? body.matchId ??
		body.Id ?? body.id ??
		match,
	);
	const statusRaw = String(
		body.Status ?? body.status ?? "UNKNOWN",
	).toUpperCase().replace(/-/g, "_");
	const status = mapStatus(statusRaw, body);

	let odds: Record<string, number> = {};

	// Try top-level Odds / odds object
	const oddsObj = body.Odds ?? body.odds;
	if (oddsObj && typeof oddsObj === "object") {
		for (const [k, v] of Object.entries(oddsObj as Record<string, unknown>)) {
			const n = Number(v);
			if (Number.isFinite(n) && n > 1) odds[k] = n;
		}
	}

	// Try markets[].selections[] — confirmed via TG for stream/snapshot endpoints
	if (Object.keys(odds).length === 0) {
		const markets = body.Markets ?? body.markets;
		if (Array.isArray(markets)) {
			const first = markets[0] as {
				Selections?: Array<{ Name?: string; name?: string; Odds?: number; odds?: number }>;
				selections?: Array<{ Name?: string; name?: string; Odds?: number; odds?: number }>;
			};
			const selections = first?.Selections ?? first?.selections ?? [];
			for (const s of selections) {
				const name = s.Name ?? s.name;
				const n = Number(s.Odds ?? s.odds);
				if (name && Number.isFinite(n) && n > 1) odds[name] = n;
			}
		}
	}

	if (Object.keys(odds).length === 0) return null;

	const minuteRaw = body.Minute ?? body.minute;
	const messageId = String(body.MessageId ?? body.messageId ?? "");
	const ts = Number(body.Ts ?? body.ts ?? body.Timestamp ?? body.timestamp ?? 0);

	return {
		matchId,
		match,
		status,
		minute: typeof minuteRaw === "number" ? minuteRaw : undefined,
		odds,
		source: "txline",
		fetchedAt: new Date().toISOString(),
		...(messageId && { messageId }),
		...(ts > 0 && { ts }),
	};
}

function mapStatus(
	statusRaw: string,
	body: Record<string, unknown>,
): MarketOdds["status"] {
	if (["IN_PLAY", "INPLAY", "LIVE"].includes(statusRaw)) return "IN_PLAY";
	if (["PRE_MATCH", "PREMATCH", "NS"].includes(statusRaw)) return "PRE_MATCH";
	if (["ENDED", "FINISHED", "FT"].includes(statusRaw)) return "ENDED";
	if (body.InPlay === true || body.inPlay === true) return "IN_PLAY";
	return "UNKNOWN";
}
