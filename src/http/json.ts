export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
	const headers = new Headers(extraHeaders);
	headers.set("Content-Type", "application/json; charset=utf-8");
	return new Response(JSON.stringify(data, null, 2), { status, headers });
}
