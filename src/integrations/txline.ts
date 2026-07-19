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

	const tryUrl = async (url: string, p1?: string, p2?: string): Promise<MarketOdds | null> => {
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
			return normalizeTxline(body, url, p1, p2);
		} catch (e) {
			lastErr = e instanceof Error ? e : new Error(String(e));
			return null;
		}
	};

	for (const url of candidates) {
		const market = await tryUrl(url);
		if (market) return market;
	}

	// Per-fixture sweep — World Cup first, nearest kickoff first.
	const fixtures = await listFixtures(origin, headers);
	const ordered = [...fixtures].sort(
		(a, b) => Math.abs(a.start - Date.now()) - Math.abs(b.start - Date.now()),
	);
	for (const f of ordered.slice(0, 8)) {
		const market = await tryUrl(`${origin}/api/odds/snapshot/${f.fixtureId}`, f.p1, f.p2);
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

export type FixtureRef = { fixtureId: string; p1: string; p2: string; start: number; flag1?: string; flag2?: string; competition?: string; competitionId?: number; };

const COUNTRY_ISO: Record<string, string> = {
	France: "fr", England: "gb-eng", Spain: "es", Argentina: "ar",
	Germany: "de", Brazil: "br", Portugal: "pt", Netherlands: "nl",
	Italy: "it", Belgium: "be", Croatia: "hr", Uruguay: "uy",
	Australia: "au", "New Zealand": "nz", Japan: "jp", Morocco: "ma",
	Vietnam: "vn", Myanmar: "mm", India: "in", Liechtenstein: "li",
	Gibraltar: "gi", Colombia: "co", Mexico: "mx", USA: "us",
	Senegal: "sn", Ghana: "gh", Nigeria: "ng", Cameroon: "cm",
};

function flagUrl(country: string): string | undefined {
	const iso = COUNTRY_ISO[country];
	return iso ? `https://flagcdn.com/w40/${iso}.png` : undefined;
}

export async function fetchUpcomingFixtures(config: AgentConfig): Promise<FixtureRef[]> {
	if (!config.txlineApiUrl || !config.txlineApiKey) return [];
	try {
		const origin = getOrigin(config);
		const jwt = await getGuestJwt(origin);
		const all = await listFixtures(origin, buildHeaders(jwt, config.txlineApiKey));
		const now = Date.now();
		// Live or upcoming (started recently or in future)
		return all.filter((f) => f.start > now || (now - f.start < 3 * 3600 * 1000));
	} catch {
		return [];
	}
}

/**
 * Public: Past fixtures from TxLINE.
 */
export async function fetchPastFixtures(config: AgentConfig): Promise<FixtureRef[]> {
	if (!config.txlineApiUrl || !config.txlineApiKey) return [];
	try {
		const origin = getOrigin(config);
		const jwt = await getGuestJwt(origin);
		const all = await listFixtures(origin, buildHeaders(jwt, config.txlineApiKey));
		const now = Date.now();
		// Ended/Past (started more than 2 hours ago)
		return all.filter((f) => now - f.start >= 2 * 3600 * 1000).sort((a, b) => b.start - a.start);
	} catch {
		return [];
	}
}

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
			.map((f) => {
				const p1 = String(f.Participant1 ?? f.participant1 ?? "");
				const p2 = String(f.Participant2 ?? f.participant2 ?? "");
				const competitionId = Number(f.CompetitionId ?? f.competitionId ?? 0);
				const competition = String(f.Competition ?? f.competition ?? "");
				return {
					fixtureId: String(f.FixtureId ?? f.fixtureId ?? ""),
					p1, p2,
					start: Number(f.StartTime ?? f.startTime ?? 0),
					flag1: flagUrl(p1),
					flag2: flagUrl(p2),
					competition,
					competitionId,
				};
			})
			.filter((f) => f.fixtureId && f.competitionId === 72) // World Cup only (CompId 72)
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

/** Normalized 1X2 odds point for replays / charts (decimal odds). */
export type OddsUpdatePoint = {
	ts: number;
	fixtureId: string;
	inRunning: boolean;
	/** Decimal odds [home, draw, away] */
	prices: [number, number, number];
	home: number;
	draw: number;
	away: number;
};

/**
 * Fetch historical odds updates for a specific fixture from TxLINE.
 * GET /api/odds/updates/{fixtureId} — can be huge (10k+ rows).
 * We keep only full-match 1X2, convert milliodds → decimal, sample for the UI.
 */
export async function fetchOddsUpdates(
	config: AgentConfig,
	fixtureId: string,
	opts?: { maxPoints?: number },
): Promise<OddsUpdatePoint[]> {
	if (!config.txlineApiUrl || !config.txlineApiKey) return [];

	const origin = getOrigin(config);
	const maxPoints = Math.min(Math.max(opts?.maxPoints ?? 300, 20), 1000);

	try {
		const jwt = await getGuestJwt(origin);
		const url = `${origin}/api/odds/updates/${fixtureId}`;
		const res = await fetch(url, {
			headers: buildHeaders(jwt, config.txlineApiKey),
		});
		if (!res.ok) {
			// Fallback: single live snapshot as a one-point series
			return snapshotAsUpdates(config, fixtureId);
		}
		const body = await res.json();
		if (!Array.isArray(body) || body.length === 0) {
			return snapshotAsUpdates(config, fixtureId);
		}

		const oneXtwo: OddsUpdatePoint[] = [];
		for (const raw of body) {
			if (!raw || typeof raw !== "object") continue;
			const el = raw as Record<string, unknown>;
			const type = String(el.SuperOddsType ?? el.superOddsType ?? "");
			const period = el.MarketPeriod ?? el.marketPeriod;
			if (type !== "1X2_PARTICIPANT_RESULT" || period) continue;

			const rawPrices = (el.Prices ?? el.prices) as unknown;
			if (!Array.isArray(rawPrices) || rawPrices.length < 3) continue;
			const prices = rawPrices.slice(0, 3).map((p) => {
				const n = Number(p);
				// TxLINE StablePrice often ships milliodds (2420 → 2.420)
				if (!Number.isFinite(n) || n <= 0) return NaN;
				return n > 50 ? n / 1000 : n;
			});
			if (prices.some((n) => !Number.isFinite(n) || n <= 1)) continue;

			const ts = Number(el.Ts ?? el.ts ?? 0);
			oneXtwo.push({
				ts,
				fixtureId: String(el.FixtureId ?? el.fixtureId ?? fixtureId),
				inRunning: Boolean(el.InRunning ?? el.inRunning),
				prices: [prices[0]!, prices[1]!, prices[2]!],
				home: prices[0]!,
				draw: prices[1]!,
				away: prices[2]!,
			});
		}

		if (oneXtwo.length === 0) {
			return snapshotAsUpdates(config, fixtureId);
		}

		oneXtwo.sort((a, b) => a.ts - b.ts);

		// Even sample for chart / worker response size
		if (oneXtwo.length <= maxPoints) return oneXtwo;
		const step = Math.ceil(oneXtwo.length / maxPoints);
		const sampled = oneXtwo.filter((_, i) => i % step === 0);
		// Always keep last point
		const last = oneXtwo[oneXtwo.length - 1]!;
		if (sampled[sampled.length - 1]?.ts !== last.ts) sampled.push(last);
		return sampled;
	} catch {
		return snapshotAsUpdates(config, fixtureId);
	}
}

/** One-point series from current odds snapshot when history is empty. */
async function snapshotAsUpdates(
	config: AgentConfig,
	fixtureId: string,
): Promise<OddsUpdatePoint[]> {
	try {
		const m = await fetchOddsSnapshot(config, fixtureId);
		const keys = Object.keys(m.odds);
		if (keys.length < 2) return [];
		// Prefer ordered home/draw/away when labels match participants
		const vals = Object.values(m.odds).filter((n) => n > 1);
		if (vals.length < 2) return [];
		const home = vals[0] ?? 0;
		const draw = vals[1] ?? vals[0] ?? 0;
		const away = vals[2] ?? vals[1] ?? 0;
		return [
			{
				ts: Date.now(),
				fixtureId,
				inRunning: m.status === "IN_PLAY",
				prices: [home, draw, away],
				home,
				draw,
				away,
			},
		];
	} catch {
		return [];
	}
}

/**
 * Normalize TxLINE API response to internal MarketOdds type.
 *
 * TxLINE wire format: TG users reported PascalCase keys in live payloads
 * while docs show camelCase. We read both to be safe.
 */
function normalizeTxline(body: unknown, sourceUrl: string, p1?: string, p2?: string): MarketOdds {
	// Snapshot endpoints return an ARRAY of odds elements (reference:
	// subscription_free_tier.ts reads response.data[0]). Fixture-specific calls
	// may return a single object. Handle both; an empty array means no live odds
	// in the current interval, which is an honest "no odds" — not a parse failure.
	if (Array.isArray(body)) {
		// Prefer full-match 1X2 (SuperOddsType=1X2_PARTICIPANT_RESULT, no MarketPeriod)
		const sorted = [...body].sort((a, b) => {
			const aType = String((a as Record<string,unknown>).SuperOddsType ?? "");
			const bType = String((b as Record<string,unknown>).SuperOddsType ?? "");
			const aPeriod = (a as Record<string,unknown>).MarketPeriod;
			const bPeriod = (b as Record<string,unknown>).MarketPeriod;
			const aScore = aType === "1X2_PARTICIPANT_RESULT" && !aPeriod ? 0 : 1;
			const bScore = bType === "1X2_PARTICIPANT_RESULT" && !bPeriod ? 0 : 1;
			return aScore - bScore;
		});
		for (const el of sorted) {
			const parsed = normalizeElement(el, p1, p2);
			if (parsed) return parsed;
		}
		// Empty / unparseable snapshot interval — honest "no usable odds", not a crash
		throw new NoLiveOddsError(
			p1 && p2 ? `${p1} vs ${p2}` : null,
		);
	}

	const parsed = normalizeElement(body, p1, p2);
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
function normalizeElement(raw: unknown, p1Hint?: string, p2Hint?: string): MarketOdds | null {
	if (!raw || typeof raw !== "object") return null;
	const body = raw as Record<string, unknown>;

	// Build match name from hints (fixture data) or element fields
	const matchFromHints = p1Hint && p2Hint ? `${p1Hint} vs ${p2Hint}` : null;
	const match = String(
		body.Match ?? body.match ??
		body.Event ?? body.event ??
		body.Name ?? body.name ??
		matchFromHints ??
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
	if (oddsObj && typeof oddsObj === "object" && !Array.isArray(oddsObj)) {
		for (const [k, v] of Object.entries(oddsObj as Record<string, unknown>)) {
			const n = toDecimalOdds(v);
			if (n != null) odds[k] = n;
		}
	}

	// TxLINE StablePrice wire: PriceNames[] + Prices[] (milliodds e.g. 2390 → 2.390).
	// Prefer full-match 1X2; still accept half-period 1X2 if that's all we got.
	if (Object.keys(odds).length === 0) {
		const superOddsType = String(body.SuperOddsType ?? body.superOddsType ?? "");
		const is1x2 =
			superOddsType === "1X2_PARTICIPANT_RESULT" ||
			superOddsType.includes("1X2") ||
			superOddsType === "";
		if (is1x2) {
			const fromPrices = pricesArrayToOdds(body, p1Hint, p2Hint);
			if (fromPrices) odds = fromPrices;
		}
	}

	// Last resort: any element with 3 Prices (demo resilience)
	if (Object.keys(odds).length === 0) {
		const fromPrices = pricesArrayToOdds(body, p1Hint, p2Hint);
		if (fromPrices) odds = fromPrices;
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

	const p1Raw = body.Participant1 ?? body.participant1 ?? body.HomeTeam ?? body.homeTeam;
	const p2Raw = body.Participant2 ?? body.participant2 ?? body.AwayTeam ?? body.awayTeam;
	const p1 = p1Raw ? String(p1Raw) : p1Hint;
	const p2 = p2Raw ? String(p2Raw) : p2Hint;

	return {
		matchId,
		match,
		...(p1 && { p1 }),
		...(p2 && { p2 }),
		status,
		minute: typeof minuteRaw === "number" ? minuteRaw : undefined,
		odds,
		source: "txline",
		fetchedAt: new Date().toISOString(),
		...(messageId && { messageId }),
		...(ts > 0 && { ts }),
	};
}

/** TxLINE Prices[] may be milliodds (2390) or decimal (2.39). */
function toDecimalOdds(raw: unknown): number | null {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	const dec = n > 50 ? n / 1000 : n;
	return dec > 1 ? dec : null;
}

function pricesArrayToOdds(
	body: Record<string, unknown>,
	p1Hint?: string,
	p2Hint?: string,
): Record<string, number> | null {
	const priceNames = body.PriceNames ?? body.priceNames;
	const prices = body.Prices ?? body.prices;
	if (!Array.isArray(prices) || prices.length < 2) return null;

	const labelMap: Record<string, string> = {
		part1: p1Hint ?? "Home",
		draw: "Draw",
		part2: p2Hint ?? "Away",
	};
	const names = Array.isArray(priceNames)
		? priceNames.map((n) => String(n ?? ""))
		: prices.length >= 3
			? ["part1", "draw", "part2"]
			: ["part1", "part2"];

	const odds: Record<string, number> = {};
	for (let i = 0; i < Math.min(names.length, prices.length); i++) {
		const name = labelMap[names[i]!] ?? names[i]!;
		const n = toDecimalOdds(prices[i]);
		if (name && n != null) odds[name] = n;
	}
	return Object.keys(odds).length >= 2 ? odds : null;
}

function mapStatus(
	statusRaw: string,
	body: Record<string, unknown>,
): MarketOdds["status"] {
	// TxLINE primary signal: InRunning (boolean) present on all StablePrice elements
	if (body.InRunning === true || body.inRunning === true) return "IN_PLAY";
	if (body.InRunning === false || body.inRunning === false) {
		// GameState: null/undefined = pre-match, 5/10/13 = ended (soccer feed IDs)
		const gs = Number(body.GameState ?? body.gameState ?? -1);
		if ([5, 10, 13].includes(gs)) return "ENDED";
		return "PRE_MATCH";
	}

	// Fallback: string status field (other feed formats)
	if (["IN_PLAY", "INPLAY", "LIVE"].includes(statusRaw)) return "IN_PLAY";
	if (["PRE_MATCH", "PREMATCH", "NS"].includes(statusRaw)) return "PRE_MATCH";
	if (["ENDED", "FINISHED", "FT"].includes(statusRaw)) return "ENDED";
	if (body.InPlay === true || body.inPlay === true) return "IN_PLAY";
	return "UNKNOWN";
}
