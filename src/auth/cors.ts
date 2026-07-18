import type { Env } from "../types";

export function allowedOrigins(env: Env): string[] {
	return (env.FRONTEND_URL || "")
		.split(",")
		.map((s) => s.trim().replace(/\/$/, ""))
		.filter(Boolean);
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
	const origin = request.headers.get("Origin") || "";
	const allowed = allowedOrigins(env);
	const match = allowed.find((o) => o === origin);
	const headers: Record<string, string> = {
		"Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
	if (match) {
		headers["Access-Control-Allow-Origin"] = match;
		headers["Access-Control-Allow-Credentials"] = "true";
	}
	return headers;
}

export function withCors(request: Request, env: Env, response: Response): Response {
	const headers = new Headers(response.headers);
	const extra = corsHeaders(request, env);
	for (const [k, v] of Object.entries(extra)) {
		headers.set(k, v);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function preflight(request: Request, env: Env): Response {
	return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}
