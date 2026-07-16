import type { AuthUser, Env } from "../types";
import { randomId } from "./crypto";
import { createExchangeCode, createSession, putOAuthState, takeOAuthState } from "./session";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

function workerOrigin(env: Env): string {
	return env.WORKER_URL.replace(/\/$/, "");
}

function defaultFrontend(env: Env): string {
	return env.FRONTEND_URL.split(",")[0]?.trim().replace(/\/$/, "") || "http://127.0.0.1:4321";
}

function isAllowedReturnTo(env: Env, returnTo: string): boolean {
	try {
		const url = new URL(returnTo);
		const allowed = env.FRONTEND_URL.split(",").map((s) => s.trim().replace(/\/$/, ""));
		return allowed.some((origin) => {
			try {
				const o = new URL(origin);
				return o.origin === url.origin;
			} catch {
				return false;
			}
		});
	} catch {
		return false;
	}
}

export function googleConfigured(env: Env): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && env.WORKER_URL);
}

/** Start Google OAuth - redirect user to Google. */
export async function beginGoogleOAuth(request: Request, env: Env): Promise<Response> {
	if (!googleConfigured(env)) {
		return new Response(
			JSON.stringify({
				error: "Google sign-in is not configured on the worker yet.",
				code: "auth_not_configured",
				hint: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, WORKER_URL in .dev.vars / wrangler secrets.",
			}),
			{ status: 503, headers: { "Content-Type": "application/json" } },
		);
	}

	const url = new URL(request.url);
	const returnToRaw = url.searchParams.get("return_to") || `${defaultFrontend(env)}/dashboard`;
	const returnTo = isAllowedReturnTo(env, returnToRaw)
		? returnToRaw
		: `${defaultFrontend(env)}/dashboard`;

	const state = randomId(24);
	await putOAuthState(env, state, { returnTo, createdAt: Date.now() });

	const redirectUri = `${workerOrigin(env)}/auth/google/callback`;
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "openid email profile",
		state,
		access_type: "online",
		prompt: "select_account",
	});

	return Response.redirect(`${GOOGLE_AUTH}?${params.toString()}`, 302);
}

/** Google redirects here with ?code=&state= */
export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const err = url.searchParams.get("error");
	if (err) {
		const frontend = defaultFrontend(env);
		return Response.redirect(`${frontend}/login?error=${encodeURIComponent(err)}`, 302);
	}

	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state) {
		return new Response("Missing code or state", { status: 400 });
	}

	const stateRec = await takeOAuthState(env, state);
	if (!stateRec) {
		const frontend = defaultFrontend(env);
		return Response.redirect(`${frontend}/login?error=invalid_state`, 302);
	}

	const redirectUri = `${workerOrigin(env)}/auth/google/callback`;
	const tokenRes = await fetch(GOOGLE_TOKEN, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});

	if (!tokenRes.ok) {
		console.error("Google token exchange failed", await tokenRes.text());
		return Response.redirect(`${defaultFrontend(env)}/login?error=token_exchange`, 302);
	}

	const tokenBody = (await tokenRes.json()) as { access_token?: string; id_token?: string };
	if (!tokenBody.access_token) {
		return Response.redirect(`${defaultFrontend(env)}/login?error=no_access_token`, 302);
	}

	const userRes = await fetch(GOOGLE_USERINFO, {
		headers: { Authorization: `Bearer ${tokenBody.access_token}` },
	});
	if (!userRes.ok) {
		console.error("Google userinfo failed", await userRes.text());
		return Response.redirect(`${defaultFrontend(env)}/login?error=userinfo`, 302);
	}

	const profile = (await userRes.json()) as {
		sub: string;
		email?: string;
		email_verified?: boolean;
		name?: string;
		picture?: string;
	};

	if (!profile.sub || !profile.email) {
		return Response.redirect(`${defaultFrontend(env)}/login?error=incomplete_profile`, 302);
	}

	const user: AuthUser = {
		sub: profile.sub,
		email: profile.email,
		name: profile.name || profile.email.split("@")[0],
		picture: profile.picture,
	};

	const { session, token } = await createSession(env, user);
	const exchange = await createExchangeCode(env, session.id);

	// Hand the browser back to the frontend with a one-time exchange code.
	// Frontend POSTs it to /auth/exchange to receive the signed bearer token.
	const dest = new URL(stateRec.returnTo);
	// Always land on /login/callback for a clean handoff, then redirect to return path.
	const callback = new URL(`${defaultFrontend(env)}/login/callback`);
	callback.searchParams.set("code", exchange);
	callback.searchParams.set("next", dest.pathname + dest.search + dest.hash);

	// Also set cookie on the worker domain (useful if same-site later).
	return new Response(null, {
		status: 302,
		headers: {
			Location: callback.toString(),
			"Set-Cookie": [
				`ns_session=${encodeURIComponent(token)}`,
				"Path=/",
				"HttpOnly",
				"Max-Age=604800",
				"SameSite=None",
				"Secure",
			].join("; "),
		},
	});
}
