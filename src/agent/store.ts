import type { AgentTickResult, Env, OpenPosition, YieldPosition } from "../types";

const HISTORY_KEY = "agent:history";
const POSITION_KEY = "agent:position";
const OPEN_BOOKS_KEY = "agent:open_books";
const MAX_HISTORY = 50;

// ── Tick history ────────────────────────────────────────────────────

export async function appendTick(env: Env, tick: AgentTickResult): Promise<void> {
	const prev = await listTicks(env);

	// Free-tier KV allows 1,000 writes/day for the whole account. An identical
	// idle HOLD every minute burns that for nothing: skip persisting when this
	// tick adds no information over the last stored one. The dashboard already
	// collapses identical decisions, so nothing visible is lost.
	const last = prev[0];
	const uneventful =
		last &&
		tick.decision.action === "HOLD" &&
		last.decision.action === "HOLD" &&
		tick.decision.reason === last.decision.reason &&
		!tick.execution &&
		!tick.movement?.length &&
		tick.status !== "Error";
	if (uneventful) return;

	const next = [tick, ...prev].slice(0, MAX_HISTORY);
	await env.AGENT_STATE.put(HISTORY_KEY, JSON.stringify(next));
}

export async function listTicks(env: Env, limit = 40): Promise<AgentTickResult[]> {
	const raw = await env.AGENT_STATE.get(HISTORY_KEY);
	if (!raw) return [];
	try {
		const arr = JSON.parse(raw) as AgentTickResult[];
		return Array.isArray(arr) ? arr.slice(0, limit) : [];
	} catch {
		return [];
	}
}

export async function getLastTick(env: Env): Promise<AgentTickResult | null> {
	const ticks = await listTicks(env, 1);
	return ticks[0] ?? null;
}

// ── Yield snapshot ──────────────────────────────────────────────────

export async function savePosition(env: Env, position: YieldPosition): Promise<void> {
	await env.AGENT_STATE.put(POSITION_KEY, JSON.stringify(position));
}

export async function loadPosition(env: Env): Promise<YieldPosition | null> {
	const raw = await env.AGENT_STATE.get(POSITION_KEY);
	if (!raw) return null;
	try {
		const pos = JSON.parse(raw) as YieldPosition;
		// Reject any legacy synthetic vaults left in KV
		if (!pos || pos.source !== "live") return null;
		if (typeof pos.balanceUsdc !== "number" || !Number.isFinite(pos.balanceUsdc)) return null;
		return pos;
	} catch {
		return null;
	}
}

// ── Open books (maker positions awaiting settlement) ────────────────

export async function listOpenPositions(env: Env): Promise<OpenPosition[]> {
	const raw = await env.AGENT_STATE.get(OPEN_BOOKS_KEY);
	if (!raw) return [];
	try {
		const arr = JSON.parse(raw) as OpenPosition[];
		return Array.isArray(arr) ? arr.filter((p) => p.status === "open") : [];
	} catch {
		return [];
	}
}

export async function listAllPositions(env: Env): Promise<OpenPosition[]> {
	const raw = await env.AGENT_STATE.get(OPEN_BOOKS_KEY);
	if (!raw) return [];
	try {
		const arr = JSON.parse(raw) as OpenPosition[];
		return Array.isArray(arr) ? arr : [];
	} catch {
		return [];
	}
}

async function saveAllPositions(env: Env, positions: OpenPosition[]): Promise<void> {
	// Keep last 40 settled + all open
	const open = positions.filter((p) => p.status === "open");
	const settled = positions.filter((p) => p.status === "settled").slice(0, 40);
	await env.AGENT_STATE.put(OPEN_BOOKS_KEY, JSON.stringify([...open, ...settled]));
}

export async function addOpenPosition(env: Env, position: OpenPosition): Promise<void> {
	const all = await listAllPositions(env);
	all.unshift(position);
	await saveAllPositions(env, all);
}

export async function updatePosition(
	env: Env,
	id: string,
	patch: Partial<OpenPosition>,
): Promise<OpenPosition | null> {
	const all = await listAllPositions(env);
	const idx = all.findIndex((p) => p.id === id);
	if (idx < 0) return null;
	all[idx] = { ...all[idx], ...patch };
	await saveAllPositions(env, all);
	return all[idx];
}
