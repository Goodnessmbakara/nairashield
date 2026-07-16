import type { Env, AuthUser, SessionRecord, OAuthStateRecord } from "../types";
import { randomId, signSessionToken, verifySessionToken } from "./crypto";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const STATE_TTL_SEC = 60 * 10; // 10 min
const EXCHANGE_TTL_SEC = 60 * 2; // 2 min one-time code

const COOKIE_NAME = "ns_session";

function sessionKey(id: string) {
	return `session:${id}`;
}
function stateKey(state: string) {
	return `oauth_state:${state}`;
}
function exchangeKey(code: string) {
	return `exchange:${code}`;
}

export async function createSession(env: Env, user: AuthUser): Promise<{ session: SessionRecord; token: string }> {
	const id = randomId(24);
	const now = Date.now();
	const session: SessionRecord = {
		id,
		user,
		createdAt: now,
		expiresAt: now + SESSION_TTL_SEC * 1000,
	};
	await env.SESSIONS.put(sessionKey(id), JSON.stringify(session), {
		expirationTtl: SESSION_TTL_SEC,
	});
	const token = await signSessionToken(id, env.SESSION_SECRET);
	return { session, token };
}

export async function getSession(env: Env, sessionId: string): Promise<SessionRecord | null> {
	const raw = await env.SESSIONS.get(sessionKey(sessionId));
	if (!raw) return null;
	try {
		const session = JSON.parse(raw) as SessionRecord;
		if (session.expiresAt < Date.now()) {
			await env.SESSIONS.delete(sessionKey(sessionId));
			return null;
		}
		return session;
	} catch {
		return null;
	}
}

export async function destroySession(env: Env, sessionId: string): Promise<void> {
	await env.SESSIONS.delete(sessionKey(sessionId));
}

export async function putOAuthState(env: Env, state: string, record: OAuthStateRecord): Promise<void> {
	await env.SESSIONS.put(stateKey(state), JSON.stringify(record), {
		expirationTtl: STATE_TTL_SEC,
	});
}

export async function takeOAuthState(env: Env, state: string): Promise<OAuthStateRecord | null> {
	const key = stateKey(state);
	const raw = await env.SESSIONS.get(key);
	if (!raw) return null;
	await env.SESSIONS.delete(key);
	try {
		return JSON.parse(raw) as OAuthStateRecord;
	} catch {
		return null;
	}
}

/** One-time code the frontend exchanges for a bearer token (cross-origin local dev). */
export async function createExchangeCode(env: Env, sessionId: string): Promise<string> {
	const code = randomId(24);
	await env.SESSIONS.put(exchangeKey(code), sessionId, { expirationTtl: EXCHANGE_TTL_SEC });
	return code;
}

export async function consumeExchangeCode(env: Env, code: string): Promise<string | null> {
	const key = exchangeKey(code);
	const sessionId = await env.SESSIONS.get(key);
	if (!sessionId) return null;
	await env.SESSIONS.delete(key);
	return sessionId;
}

export function parseCookie(header: string | null, name = COOKIE_NAME): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return decodeURIComponent(rest.join("="));
	}
	return null;
}

export async function sessionIdFromRequest(request: Request, env: Env): Promise<string | null> {
	const auth = request.headers.get("Authorization");
	if (auth?.startsWith("Bearer ")) {
		const token = auth.slice(7).trim();
		return verifySessionToken(token, env.SESSION_SECRET);
	}
	const cookieToken = parseCookie(request.headers.get("Cookie"));
	if (cookieToken) {
		return verifySessionToken(cookieToken, env.SESSION_SECRET);
	}
	return null;
}

export async function requireSession(
	request: Request,
	env: Env,
): Promise<{ session: SessionRecord; sessionId: string } | Response> {
	const sessionId = await sessionIdFromRequest(request, env);
	if (!sessionId) {
		return jsonError(401, "Sign in required", "unauthorized");
	}
	const session = await getSession(env, sessionId);
	if (!session) {
		return jsonError(401, "Session expired. Sign in again.", "session_expired");
	}
	return { session, sessionId };
}

export function sessionCookieHeader(token: string, maxAge = SESSION_TTL_SEC): string {
	// SameSite=None + Secure for cross-site API usage over HTTPS.
	// Local http uses SameSite=Lax (still works same-site or via bearer exchange).
	const secure = true;
	const parts = [
		`${COOKIE_NAME}=${encodeURIComponent(token)}`,
		"Path=/",
		"HttpOnly",
		`Max-Age=${maxAge}`,
		"SameSite=None",
		secure ? "Secure" : "",
	].filter(Boolean);
	return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
	return `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=None; Secure`;
}

export function jsonError(status: number, message: string, code?: string): Response {
	return new Response(JSON.stringify({ error: message, code }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export { COOKIE_NAME, SESSION_TTL_SEC };
