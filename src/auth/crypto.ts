/** Web Crypto helpers for session tokens and opaque ids. */

const encoder = new TextEncoder();

export function randomId(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

function toBase64Url(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
	const padded = s.replace(/-/g, "+").replace(/_/g, "/");
	const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	const binary = atob(padded + pad);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

/** Signed token: `sessionId.signature` */
export async function signSessionToken(sessionId: string, secret: string): Promise<string> {
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sessionId));
	return `${sessionId}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
	token: string,
	secret: string,
): Promise<string | null> {
	const dot = token.lastIndexOf(".");
	if (dot <= 0) return null;
	const sessionId = token.slice(0, dot);
	const sigPart = token.slice(dot + 1);
	if (!sessionId || !sigPart) return null;

	const key = await hmacKey(secret);
	const sig = fromBase64Url(sigPart);
	const ok = await crypto.subtle.verify(
		"HMAC",
		key,
		sig.buffer as ArrayBuffer,
		encoder.encode(sessionId),
	);
	return ok ? sessionId : null;
}
