import type { Env } from "../types";
import { runAgentTick, getAgentStatus } from "../agent/pipeline";
import { loadAgentConfig } from "../agent/config";
import { fetchUpcomingFixtures, fetchPastFixtures, fetchScoreSnapshot } from "../integrations/txline";
import { verifyMatchOnChain } from "../integrations/txline-verify";
import { listTicks } from "../agent/store";
import { beginGoogleOAuth, googleConfigured, handleGoogleCallback } from "../auth/google";
import { registerUser, loginUser } from "../auth/emailauth";
import { preflight, withCors } from "../auth/cors";
import {
	clearSessionCookieHeader,
	consumeExchangeCode,
	createExchangeCode,
	createSession,
	destroySession,
	getSession,
	requireSession,
	sessionCookieHeader,
	sessionIdFromRequest,
} from "../auth/session";
import { signSessionToken } from "../auth/crypto";
import { json } from "./json";
import { handleAccountRoutes } from "../account/routes";
import { handleFossaPayWebhook } from "../account/webhooks";

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
				service: "retegol-bot",
				auth: googleConfigured(env) ? "google" : "not_configured",
				agent: status,
				time: new Date().toISOString(),
			});
		}
		return json({
			ok: true,
			service: "retegol-bot",
			message: "Retegol agent API",
			routes: {
				health: "GET /health",
				googleSignIn: "GET /auth/google?return_to=<frontend_url>",
				me: "GET /auth/me",
				logout: "POST /auth/logout",
				exchange: "POST /auth/exchange",
				tick: "POST /agent/tick (auth)",
				status: "GET /agent/status (auth)",
				history: "GET /agent/history (auth)",
				fixtures: "GET /agent/fixtures (auth)",
				verify: "GET /agent/verify?fixtureId= (auth)",
				v1Status: "GET /v1/status (RETEGOL_AGENT_KEY)",
				v1Fixtures: "GET /v1/fixtures (RETEGOL_AGENT_KEY)",
				v1History: "GET /v1/history (RETEGOL_AGENT_KEY)",
				v1Verify: "GET /v1/verify?fixtureId= (RETEGOL_AGENT_KEY)",
				wallet: "POST /account/wallet | GET /account/wallet | PUT /account/wallet/withdrawal",
				profile: "GET /account/profile | POST /account/profile",
				balance: "GET /account/balance",
				transactions: "GET /account/transactions",
				snapshots: "GET /account/snapshots",
				withdraw: "POST /account/withdraw | GET /account/withdraw",
				fossapayWebhook: "POST /webhooks/fossapay",
				adminWithdrawals: "GET /admin/withdrawals (admin)",
				adminFundBalance: "GET /admin/fund/balance (admin)",
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
		// Stateless: the exchanged value IS the signed session token.
		const token = sessionId;
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
	// ── Auth: email/password register ────────────────────────────────
	if (method === "POST" && path === "/auth/register") {
		let body: { email?: string; password?: string; name?: string } = {};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return json({ error: "Invalid JSON body" }, 400);
		}
		if (!body.email || !body.password) {
			return json({ error: "email and password are required" }, 400);
		}
		const result = await registerUser(env, body.email, body.password, body.name || "");
		if ("error" in result) return json({ error: result.error }, 409);
		const { session, token } = await createSession(env, result.user);
		const exchange = await createExchangeCode(env, session.id);
		return json(
			{ token, exchange, user: session.user, expiresAt: session.expiresAt },
			201,
			{ "Set-Cookie": sessionCookieHeader(token) },
		);
	}

	// ── Auth: email/password login ────────────────────────────────────
	if (method === "POST" && path === "/auth/login") {
		let body: { email?: string; password?: string } = {};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return json({ error: "Invalid JSON body" }, 400);
		}
		if (!body.email || !body.password) {
			return json({ error: "email and password are required" }, 400);
		}
		const result = await loginUser(env, body.email, body.password);
		if ("error" in result) return json({ error: result.error }, 401);
		const { session, token } = await createSession(env, result.user);
		const exchange = await createExchangeCode(env, session.id);
		return json(
			{ token, exchange, user: session.user, expiresAt: session.expiresAt },
			200,
			{ "Set-Cookie": sessionCookieHeader(token) },
		);
	}

	// ── Auth: logout ──────────────────────────────────────────────────
	if (method === "POST" && path === "/auth/logout") {
		const sessionId = await sessionIdFromRequest(request, env);
		if (sessionId) await destroySession(env, sessionId);
		return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookieHeader() });
	}

	// ── Agent: deposit to Kamino then record live position (auth required) ──
	if (method === "POST" && path === "/agent/deposit") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const config = loadAgentConfig(env);
		let body: { amountUsdc?: number; txid?: string; record_only?: boolean } = {};
		try { body = (await request.json()) as typeof body; } catch { /* default */ }
		const amount = Number(body.amountUsdc ?? config.tradeSizeUsdc);
		const { depositYield } = await import("../integrations/kamino");
		const { savePosition } = await import("../agent/store");

		// record_only = the deposit was done externally; just persist the position
		if (body.record_only) {
			await savePosition(env, {
				protocol: "kamino", asset: "USDC",
				balanceUsdc: amount,
				apy: config.yieldApy,
				lastTxid: body.txid,
				source: "live",
				updatedAt: new Date().toISOString(),
			});
			return json({ success: true, balanceUsdc: amount, txid: body.txid, recorded: true });
		}

		const result = await depositYield(env, config, amount);
		if (result.success) {
			await savePosition(env, {
				protocol: "kamino", asset: "USDC",
				balanceUsdc: result.balanceUsdc,
				apy: config.yieldApy,
				lastTxid: result.txid,
				source: "live",
				updatedAt: new Date().toISOString(),
			});
		}
		return json({ success: result.success, balanceUsdc: result.balanceUsdc, txid: result.txid, error: result.error });
	}

	// ── Agent: tick ───────────────────────────────────────────────────
	// ── Agent: external cron trigger (secret-gated, no session) ───────
	// Lets a reliable external scheduler run the autonomous tick when
	// Cloudflare's free-tier cron is not firing. Not public: requires the
	// shared CRON_SECRET. Never returns user data.
	if ((method === "POST" || method === "GET") && path === "/agent/run") {
		const key = url.searchParams.get("key") || request.headers.get("X-Cron-Key") || "";
		if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
			return json({ error: "forbidden" }, 403);
		}
		const tick = await runAgentTick(env);
		// Self-report the worker's own KV view (bypasses CLI consistency lag).
		const historyCount = (await listTicks(env)).length;
		return json({ status: tick.status, action: tick.decision.action, at: tick.at, historyCount });
	}

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

	// ── Agent: fixtures the agent is watching (real TxLINE feed) ──────
	if (method === "GET" && path === "/agent/fixtures") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const config = loadAgentConfig(env);
		const fixtures = await fetchUpcomingFixtures(config);
		const now = Date.now();
		return json({
			fixtures: fixtures.map((f) => ({
				...f,
				// live = kicked off within the last 3h
				live: f.start <= now && now - f.start < 3 * 3600 * 1000,
				// bettable = Jupiter auto-discovers all fifwc fixtures; always true when configured
				bettable: Boolean(config.jupiterApiUrl && config.solanaPrivateKey),
			})),
		});
	}

	// ── Agent: on-demand TxLINE Merkle → txoracle validate_fixture ────
	if (method === "GET" && path === "/agent/verify") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const fixtureId = (url.searchParams.get("fixtureId") || "").trim();
		if (!fixtureId) {
			return json({ error: "fixtureId required" }, 400);
		}
		const config = loadAgentConfig(env);
		const verification = await verifyMatchOnChain(config, fixtureId);
		return json({ verification });
	}

	// ── Agent: replays (past matches + agent history) ─────────────────
	if (method === "GET" && path === "/agent/replays") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const config = loadAgentConfig(env);
		
		const fixtures = await fetchPastFixtures(config);
		const limit = Math.min(Number(url.searchParams.get("limit") || 1000), 2000);
		const allTicks = await listTicks(env, limit);

		// Group ticks by matchId
		const history: Record<string, typeof allTicks> = {};
		for (const t of allTicks) {
			const matchId = t.market?.matchId || t.market?.match;
			if (matchId) {
				if (!history[matchId]) history[matchId] = [];
				history[matchId].push(t);
			}
		}

		// Fetch final scores for the past fixtures
		const scores: Record<string, any> = {};
		await Promise.all(fixtures.map(async (f) => {
			const score = await fetchScoreSnapshot(config, f.fixtureId);
			if (score) scores[f.fixtureId] = score;
		}));

		return json({ fixtures, history, scores });
	}

	// ── Agent: history ────────────────────────────────────────────────
	if (method === "GET" && path === "/agent/history") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const limit = Math.min(Number(url.searchParams.get("limit") || 40), 50);
		const ticks = await listTicks(env, limit);
		return json({ ticks, count: ticks.length });
	}

	// ── Public agent SDK / MCP API (API key — read-only) ──────────────
	if (method === "GET" && path.startsWith("/v1/")) {
		const keyAuth = requireAgentKey(request, env);
		if (keyAuth instanceof Response) return keyAuth;

		if (path === "/v1/status") {
			const status = await getAgentStatus(env);
			return json(status);
		}

		if (path === "/v1/fixtures") {
			const config = loadAgentConfig(env);
			const fixtures = await fetchUpcomingFixtures(config);
			const now = Date.now();
			return json({
				fixtures: fixtures.map((f) => ({
					...f,
					live: f.start <= now && now - f.start < 3 * 3600 * 1000,
					bettable: Boolean(config.jupiterApiUrl && config.solanaPrivateKey),
				})),
			});
		}

		if (path === "/v1/history") {
			const limit = Math.min(Number(url.searchParams.get("limit") || 40), 50);
			const ticks = await listTicks(env, limit);
			return json({ ticks, count: ticks.length });
		}

		if (path === "/v1/verify") {
			const fixtureId = (url.searchParams.get("fixtureId") || "").trim();
			if (!fixtureId) {
				return json({ error: "fixtureId required" }, 400);
			}
			const config = loadAgentConfig(env);
			const verification = await verifyMatchOnChain(config, fixtureId);
			return json({ verification });
		}

		return json({ error: "Not found", path }, 404);
	}

	// ── FossaPay webhooks (no session — signature-verified) ───────────
	if (method === "POST" && path === "/webhooks/fossapay") {
		return handleFossaPayWebhook(request, env);
	}

	// ── Account + Admin ───────────────────────────────────────────────
	const accountResponse = await handleAccountRoutes(request, env, path, method);
	if (accountResponse) return accountResponse;

	return json({ error: "Not found", path }, 404);
}

export function handleWithCors(request: Request, env: Env, response: Response): Response {
	return withCors(request, env, response);
}

/** Bearer or X-Retegol-Key gate for `/v1/*` (SDK / MCP). */
function requireAgentKey(request: Request, env: Env): true | Response {
	if (!env.RETEGOL_AGENT_KEY) {
		return json({ error: "agent API key not configured" }, 503);
	}
	const header = request.headers.get("Authorization") || "";
	const bearer = header.toLowerCase().startsWith("bearer ")
		? header.slice(7).trim()
		: "";
	const alt = (request.headers.get("X-Retegol-Key") || "").trim();
	const presented = bearer || alt;
	if (!presented || presented !== env.RETEGOL_AGENT_KEY) {
		return json({ error: "forbidden" }, 403);
	}
	return true;
}
