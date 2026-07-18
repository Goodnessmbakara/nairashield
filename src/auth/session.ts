/**
 * Stateless sessions — no KV.
 *
 * Cloudflare free KV allows 1,000 writes/day for the whole account, which
 * an autonomous agent exhausts; sign-in must not depend on that quota.
 * Every artifact here is a signed, self-contained payload:
 *
 *   token   = base64url(JSON{u,iat,exp}) . HMAC-sig     (the session itself)
 *   state   = base64url(JSON{returnTo,createdAt,exp}) . HMAC-sig
 *   code    = base64url(JSON{tok,exp}) . HMAC-sig       (short-lived wrapper)
 *
 * Verification is pure crypto against SESSION_SECRET. Logout is client-side
 * cookie/token disposal. Trade-off, stated honestly: tokens cannot be
 * revoked server-side before expiry and OAuth state is replayable within
 * its 10-minute window — acceptable for this product's dashboard.
 */

import type { Env, AuthUser, SessionRecord, OAuthStateRecord } from "../types";
import { signSessionToken, verifySessionToken } from "./crypto";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const STATE_TTL_SEC = 60 * 10; // 10 min
const EXCHANGE_TTL_SEC = 60 * 2; // 2 min

const COOKIE_NAME = "ns_session";

// ── payload codecs ──────────────────────────────────────────────────

function b64urlEncode(obj: unknown): string {
	const bytes = new TextEncoder().encode(JSON.stringify(obj));
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode<T>(s: string): T | null {
	try {
		const padded = s.replace(/-/g, "+").replace(/_/g, "/");
		const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
		const bin = atob(padded + pad);
		const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes)) as T;
	} catch {
		return null;
	}
}

async function seal(env: Env, obj: unknown): Promise<string> {
	return signSessionToken(b64urlEncode(obj), env.SESSION_SECRET);
}

async function openSealed<T>(env: Env, token: string): Promise<T | null> {
	const payload = await verifySessionToken(token, env.SESSION_SECRET);
	if (!payload) return null;
	return b64urlDecode<T>(payload);
}

type SessionPayload = { u: AuthUser; iat: number; exp: number };

function toRecord(p: SessionPayload): SessionRecord {
	return { id: "stateless", user: p.u, createdAt: p.iat, expiresAt: p.exp };
}

// ── sessions ────────────────────────────────────────────────────────

export async function createSession(
	env: Env,
	user: AuthUser,
): Promise<{ session: SessionRecord; token: string }> {
	const now = Date.now();
	const payload: SessionPayload = { u: user, iat: now, exp: now + SESSION_TTL_SEC * 1000 };
	const token = await seal(env, payload);
	return { session: toRecord(payload), token };
}

/** `sessionId` is the full signed token (name kept for call-site compat). */
export async function getSession(env: Env, sessionId: string): Promise<SessionRecord | null> {
	const p = await openSealed<SessionPayload>(env, sessionId);
	if (!p || typeof p.exp !== "number" || p.exp < Date.now() || !p.u) return null;
	return toRecord(p);
}

export async function destroySession(_env: Env, _sessionId: string): Promise<void> {
	// Stateless: nothing to delete server-side; logout clears the cookie/token.
}

// ── oauth state ─────────────────────────────────────────────────────

type StatePayload = OAuthStateRecord & { exp: number };

/** Seals the record; RETURNS the state string to send to Google. */
export async function putOAuthState(
	env: Env,
	_state: string,
	record: OAuthStateRecord,
): Promise<string> {
	return seal(env, { ...record, exp: Date.now() + STATE_TTL_SEC * 1000 } satisfies StatePayload);
}

export async function takeOAuthState(env: Env, state: string): Promise<OAuthStateRecord | null> {
	const p = await openSealed<StatePayload>(env, state);
	if (!p || typeof p.exp !== "number" || p.exp < Date.now()) return null;
	return { returnTo: p.returnTo, createdAt: p.createdAt };
}

// ── exchange codes ──────────────────────────────────────────────────

type ExchangePayload = { tok: string; exp: number };

/** `sessionId` here is the full session token; the code wraps it short-lived. */
export async function createExchangeCode(env: Env, sessionId: string): Promise<string> {
	return seal(env, { tok: sessionId, exp: Date.now() + EXCHANGE_TTL_SEC * 1000 } satisfies ExchangePayload);
}

export async function consumeExchangeCode(env: Env, code: string): Promise<string | null> {
	const p = await openSealed<ExchangePayload>(env, code);
	if (!p || typeof p.exp !== "number" || p.exp < Date.now() || !p.tok) return null;
	return p.tok;
}

// ── request helpers (unchanged surface) ─────────────────────────────

export function parseCookie(header: string | null, name = COOKIE_NAME): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		if (k === name) return decodeURIComponent(rest.join("="));
	}
	return null;
}

/** Returns the verified raw token (formerly a session id) or null. */
export async function sessionIdFromRequest(request: Request, env: Env): Promise<string | null> {
	const auth = request.headers.get("Authorization");
	if (auth?.startsWith("Bearer ")) {
		const token = auth.slice(7).trim();
		return (await verifySessionToken(token, env.SESSION_SECRET)) ? token : null;
	}
	const cookieToken = parseCookie(request.headers.get("Cookie"));
	if (cookieToken) {
		return (await verifySessionToken(cookieToken, env.SESSION_SECRET)) ? cookieToken : null;
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
	const parts = [
		`${COOKIE_NAME}=${encodeURIComponent(token)}`,
		"Path=/",
		"HttpOnly",
		`Max-Age=${maxAge}`,
		"SameSite=None",
		"Secure",
	];
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
