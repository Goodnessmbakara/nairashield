/**
 * GitHub-backed agent state — replaces KV (1,000 writes/day account quota
 * is too small for an autonomous agent; the exhausted quota took down
 * persistence during live windows). State lives as one JSON blob in the
 * dedicated public repo fozagtx/nairashield-state: durable, free at this
 * scale, and a public audit trail of every tick.
 */

import type { AgentTickResult, Env, OpenPosition, YieldPosition } from "../types";

// Where state lives is the TEAM's choice: set GH_STATE_REPO ("owner/repo",
// a repo the token owner controls) + GH_TOKEN. Until both are set, the
// store is disabled and the agent runs without persistence.
const BRANCH = "main";
const PATH = "state.json";
function apiUrl(env: Env): string | null {
	const repo = env.GH_STATE_REPO;
	if (!repo || !repo.includes("/")) return null;
	return `https://api.github.com/repos/${repo}/contents/${PATH}`;
}

export type AgentBlob = {
	ticks: AgentTickResult[];
	position: YieldPosition | null;
	books: OpenPosition[];
};

function emptyBlob(): AgentBlob {
	return { ticks: [], position: null, books: [] };
}

function headers(env: Env): Record<string, string> {
	return {
		authorization: `Bearer ${env.GH_TOKEN}`,
		accept: "application/vnd.github+json",
		"user-agent": "retegol-agent",
		"x-github-api-version": "2022-11-28",
	};
}

export async function loadBlob(env: Env): Promise<{ blob: AgentBlob; sha: string | null }> {
	const api = apiUrl(env);
	if (!env.GH_TOKEN || !api) return { blob: emptyBlob(), sha: null };
	try {
		const res = await fetch(`${api}?ref=${BRANCH}`, { headers: headers(env) });
		if (res.status === 404) return { blob: emptyBlob(), sha: null };
		if (!res.ok) return { blob: emptyBlob(), sha: null };
		const body = (await res.json()) as { content?: string; sha?: string };
		if (!body.content) return { blob: emptyBlob(), sha: body.sha ?? null };
		const text = atob(body.content.replace(/\n/g, ""));
		const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
		const blob = JSON.parse(new TextDecoder().decode(bytes)) as AgentBlob;
		return { blob: { ...emptyBlob(), ...blob }, sha: body.sha ?? null };
	} catch {
		return { blob: emptyBlob(), sha: null };
	}
}

export async function saveBlob(
	env: Env,
	blob: AgentBlob,
	sha: string | null,
	message: string,
): Promise<boolean> {
	const api = apiUrl(env);
	if (!env.GH_TOKEN || !api) return false;
	try {
		const bytes = new TextEncoder().encode(JSON.stringify(blob));
		let bin = "";
		for (const b of bytes) bin += String.fromCharCode(b);
		const res = await fetch(api, {
			method: "PUT",
			headers: { ...headers(env), "content-type": "application/json" },
			body: JSON.stringify({ message, content: btoa(bin), branch: BRANCH, ...(sha && { sha }) }),
		});
		if (!res.ok) {
			console.log(`[ghstore] save failed HTTP ${res.status}`);
			return false;
		}
		return true;
	} catch (e) {
		console.log("[ghstore] save error:", e instanceof Error ? e.message : e);
		return false;
	}
}
