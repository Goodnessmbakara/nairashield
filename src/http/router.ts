import type { Env } from "../types";
import { runAgentTick, getAgentStatus } from "../agent/pipeline";
import { listTicks } from "../agent/store";
import { beginGoogleOAuth, googleConfigured, handleGoogleCallback } from "../auth/google";
import { preflight, withCors } from "../auth/cors";
import {
	clearSessionCookieHeader,
	consumeExchangeCode,
	destroySession,
	getSession,
	requireSession,
	sessionCookieHeader,
	sessionIdFromRequest,
} from "../auth/session";
import { signSessionToken } from "../auth/crypto";
import { json } from "./json";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, "") || "/";
	const method = request.method.toUpperCase();

	if (method === "OPTIONS") {
		return preflight(request, env);
	}

	// ── Health ────────────────────────────────────────────────────────
	if (method === "GET" && (path === "/health" || path === "/")) {
		if (path === "/health" || url.searchParams.get("health") === "1") {
			const status = await getAgentStatus(env);
			return json({
				ok: true,
				service: "nairashield-bot",
				auth: googleConfigured(env) ? "google" : "not_configured",
				agent: status,
				time: new Date().toISOString(),
			});
		}
		return json({
			ok: true,
			service: "nairashield-bot",
			message: "NairaShield agent API",
			routes: {
				health: "GET /health",
				googleSignIn: "GET /auth/google?return_to=<frontend_url>",
				me: "GET /auth/me",
				logout: "POST /auth/logout",
				exchange: "POST /auth/exchange",
				tick: "POST /agent/tick (auth)",
				status: "GET /agent/status (auth)",
				history: "GET /agent/history (auth)",
			},
			auth: googleConfigured(env) ? "google" : "not_configured",
		});
	}

	// ── Auth ──────────────────────────────────────────────────────────
	if (method === "GET" && path === "/auth/google") {
		return beginGoogleOAuth(request, env);
	}
	if (method === "GET" && path === "/auth/google/callback") {
		return handleGoogleCallback(request, env);
	}
	if (method === "POST" && path === "/auth/exchange") {
		let body: { code?: string } = {};
		try {
			body = (await request.json()) as { code?: string };
		} catch {
			return json({ error: "Invalid JSON body" }, 400);
		}
		if (!body.code) return json({ error: "Missing code" }, 400);
		const sessionId = await consumeExchangeCode(env, body.code);
		if (!sessionId) return json({ error: "Invalid or expired code", code: "invalid_code" }, 400);
		const session = await getSession(env, sessionId);
		if (!session) return json({ error: "Session not found", code: "session_missing" }, 400);
		const token = await signSessionToken(sessionId, env.SESSION_SECRET);
		return json(
			{ token, user: session.user, expiresAt: session.expiresAt },
			200,
			{ "Set-Cookie": sessionCookieHeader(token) },
		);
	}
	if (method === "GET" && path === "/auth/me") {
		const sessionId = await sessionIdFromRequest(request, env);
		if (!sessionId) return json({ user: null }, 200);
		const session = await getSession(env, sessionId);
		if (!session) return json({ user: null }, 200);
		return json({ user: session.user, expiresAt: session.expiresAt });
	}
	if (method === "POST" && path === "/auth/logout") {
		const sessionId = await sessionIdFromRequest(request, env);
		if (sessionId) await destroySession(env, sessionId);
		return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookieHeader() });
	}

	// ── Agent: tick ───────────────────────────────────────────────────
	if ((method === "POST" || method === "GET") && path === "/agent/tick") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;

		const tick = await runAgentTick(env);
		// Dashboard-compatible shape + full tick
		// Dashboard keeps Executed|Skipped; full status is on tick.status
		const uiStatus =
			tick.status === "Executed"
				? "Executed"
				: tick.status === "Error"
					? "Skipped"
					: "Skipped";
		return json({
			status: uiStatus,
			decision: tick.decision,
			tick,
			user: { email: auth.session.user.email, name: auth.session.user.name },
			at: tick.at,
			error: tick.error,
		});
	}

	// ── Agent: status ─────────────────────────────────────────────────
	if (method === "GET" && path === "/agent/status") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const status = await getAgentStatus(env);
		return json(status);
	}

	// ── Agent: history ────────────────────────────────────────────────
	if (method === "GET" && path === "/agent/history") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const limit = Math.min(Number(url.searchParams.get("limit") || 40), 50);
		const ticks = await listTicks(env, limit);
		return json({ ticks, count: ticks.length });
	}

	return json({ error: "Not found", path }, 404);
}

export function handleWithCors(request: Request, env: Env, response: Response): Response {
	return withCors(request, env, response);
}
