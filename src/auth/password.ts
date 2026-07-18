/**
 * Password hashing via PBKDF2 (Web Crypto API — native in Cloudflare Workers).
 * No external deps. Salt is 16 random bytes, stored as hex alongside the hash.
 * Format stored in KV: "pbkdf2:<iterations>:<salt_hex>:<hash_hex>"
 */

const ITERATIONS = 100_000;
const HASH_ALG = "SHA-256";
const KEY_LEN = 32; // bytes

function hexEncode(buf: ArrayBuffer): string {
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function hexDecode(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const hashBuf = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: ITERATIONS, hash: HASH_ALG },
		keyMaterial,
		KEY_LEN * 8,
	);
	return `pbkdf2:${ITERATIONS}:${hexEncode(salt.buffer)}:${hexEncode(hashBuf)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split(":");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = parseInt(parts[1]!, 10);
	const salt = hexDecode(parts[2]!);
	const expectedHash = parts[3]!;

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const hashBuf = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations, hash: HASH_ALG },
		keyMaterial,
		KEY_LEN * 8,
	);
	// Constant-time comparison
	const actual = hexEncode(hashBuf);
	if (actual.length !== expectedHash.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) {
		diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
	}
	return diff === 0;
}
