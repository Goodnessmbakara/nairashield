import type { AgentTickResult, Env, OpenPosition, YieldPosition } from "../types";
import { loadBlob, saveBlob } from "./ghstore";

const MAX_HISTORY = 50;

// ── Tick history ────────────────────────────────────────────────────

export async function appendTick(env: Env, tick: AgentTickResult): Promise<void> {
	const { blob, sha } = await loadBlob(env);

	// Skip persisting when this tick adds no information over the last stored
	// one (identical idle HOLD). The dashboard collapses duplicates anyway.
	const last = blob.ticks[0];
	const uneventful =
		last &&
		tick.decision.action === "HOLD" &&
		last.decision.action === "HOLD" &&
		tick.decision.reason === last.decision.reason &&
		!tick.execution &&
		!tick.movement?.length &&
		tick.status !== "Error";
	if (uneventful) return;

	blob.ticks = [tick, ...blob.ticks].slice(0, MAX_HISTORY);
	await saveBlob(env, blob, sha, `tick ${tick.at} ${tick.status} ${tick.decision.action}`);
}

export async function listTicks(env: Env, limit = 40): Promise<AgentTickResult[]> {
	const { blob } = await loadBlob(env);
	return blob.ticks.slice(0, limit);
}

export async function getLastTick(env: Env): Promise<AgentTickResult | null> {
	return (await listTicks(env, 1))[0] ?? null;
}

// ── Yield snapshot ──────────────────────────────────────────────────

export async function savePosition(env: Env, position: YieldPosition): Promise<void> {
	const { blob, sha } = await loadBlob(env);
	blob.position = position;
	await saveBlob(env, blob, sha, `position ${position.updatedAt}`);
}

export async function loadPosition(env: Env): Promise<YieldPosition | null> {
	const { blob } = await loadBlob(env);
	const pos = blob.position;
	// Reject any legacy synthetic vaults
	if (!pos || pos.source !== "live") return null;
	if (typeof pos.balanceUsdc !== "number" || !Number.isFinite(pos.balanceUsdc)) return null;
	return pos;
}

// ── Open books (maker positions awaiting settlement) ────────────────

export async function listOpenPositions(env: Env): Promise<OpenPosition[]> {
	const { blob } = await loadBlob(env);
	return blob.books.filter((p) => p.status === "open");
}

export async function listAllPositions(env: Env): Promise<OpenPosition[]> {
	const { blob } = await loadBlob(env);
	return blob.books;
}

async function saveAllPositions(env: Env, positions: OpenPosition[]): Promise<void> {
	const { blob, sha } = await loadBlob(env);
	const open = positions.filter((p) => p.status === "open");
	const settled = positions.filter((p) => p.status === "settled").slice(0, 40);
	blob.books = [...open, ...settled];
	await saveBlob(env, blob, sha, "books update");
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
