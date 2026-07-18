import { Keypair, PublicKey } from "@solana/web3.js";
import { getDb } from "../db/client";
import type { Env } from "../types";

export type UserWallet = {
	userSub: string;
	depositAddress: string;
	withdrawalAddress: string | null;
	lockedUsdc: bigint;
	createdAt: number;
};

// ── Key encryption ──────────────────────────────────────────────────

async function masterKey(env: Env): Promise<CryptoKey> {
	const raw = hexToBytes(env.ACCOUNT_MASTER_KEY);
	return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
	if (hex.length !== 64) throw new Error("ACCOUNT_MASTER_KEY must be 32 bytes (64 hex chars)");
	const bytes = new Uint8Array(32);
	for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

export async function encryptPrivkey(env: Env, privkeyBytes: Uint8Array): Promise<string> {
	const key = await masterKey(env);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, privkeyBytes);
	const combined = new Uint8Array(12 + ciphertext.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(ciphertext), 12);
	return btoa(String.fromCharCode(...combined));
}

export async function decryptPrivkey(env: Env, encrypted: string): Promise<Uint8Array> {
	const key = await masterKey(env);
	const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
	const iv = combined.slice(0, 12);
	const ciphertext = combined.slice(12);
	const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return new Uint8Array(plain);
}

// ── Solana address validation ────────────────────────────────────────

export function isValidSolanaPubkey(address: string): boolean {
	try {
		new PublicKey(address);
		return true;
	} catch {
		return false;
	}
}

// ── DB operations ────────────────────────────────────────────────────

export async function getOrCreateWallet(env: Env, userSub: string): Promise<UserWallet> {
	const sql = getDb(env);
	const existing = await sql`
		SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1
	`;
	if (existing[0]) return rowToWallet(existing[0]);

	const keypair = Keypair.generate();
	const encrypted = await encryptPrivkey(env, keypair.secretKey);
	const depositAddress = keypair.publicKey.toBase58();

	await sql`
		INSERT INTO user_wallets (user_sub, deposit_address, encrypted_privkey, locked_usdc, created_at)
		VALUES (${userSub}, ${depositAddress}, ${encrypted}, 0, ${Date.now()})
		ON CONFLICT (user_sub) DO NOTHING
	`;

	// Re-fetch in case of race (ON CONFLICT DO NOTHING means another insert won)
	const row = await sql`SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	return rowToWallet(row[0]);
}

export async function getWallet(env: Env, userSub: string): Promise<UserWallet | null> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	return rows[0] ? rowToWallet(rows[0]) : null;
}

export async function setWithdrawalAddress(
	env: Env,
	userSub: string,
	address: string,
): Promise<void> {
	if (!isValidSolanaPubkey(address)) throw new Error("Invalid Solana address");
	const sql = getDb(env);
	await sql`
		UPDATE user_wallets SET withdrawal_address = ${address} WHERE user_sub = ${userSub}
	`;
}

export async function getAllWallets(env: Env): Promise<UserWallet[]> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM user_wallets`;
	return rows.map(rowToWallet);
}

export async function adjustLockedUsdc(
	env: Env,
	userSub: string,
	delta: bigint,
): Promise<void> {
	const sql = getDb(env);
	await sql`
		UPDATE user_wallets
		SET locked_usdc = locked_usdc + ${delta.toString()}
		WHERE user_sub = ${userSub}
	`;
}

function rowToWallet(row: Record<string, unknown>): UserWallet {
	return {
		userSub: row.user_sub as string,
		depositAddress: row.deposit_address as string,
		withdrawalAddress: (row.withdrawal_address as string) ?? null,
		lockedUsdc: BigInt(row.locked_usdc as string | number),
		createdAt: Number(row.created_at),
	};
}
