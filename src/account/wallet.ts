import { Keypair, PublicKey } from "@solana/web3.js";
import { getDb } from "../db/client";
import type { Env } from "../types";
import {
	createCryptoWallet,
	createCustomer,
	fossapayConfigured,
	FossaPayError,
} from "../integrations/fossapay";
import { getProfile } from "./profile";

export type WalletProvider = "local" | "fossapay";

export type UserWallet = {
	userSub: string;
	depositAddress: string;
	withdrawalAddress: string | null;
	lockedUsdc: bigint;
	createdAt: number;
	provider: WalletProvider;
	fossapayCustomerId: string | null;
	fossapayWalletId: string | null;
	/** Present only for local provider wallets. */
	hasLocalPrivkey: boolean;
};

export class WalletCreateError extends Error {
	constructor(
		message: string,
		public code: "PROFILE_REQUIRED" | "FOSSAPAY_ERROR" | "CONFIG",
	) {
		super(message);
		this.name = "WalletCreateError";
	}
}

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

	if (fossapayConfigured(env)) {
		return createFossaPayWallet(env, userSub);
	}
	return createLocalWallet(env, userSub);
}

async function createFossaPayWallet(env: Env, userSub: string): Promise<UserWallet> {
	const profile = await getProfile(env, userSub);
	if (!profile) {
		throw new WalletCreateError(
			"Complete your profile before creating a deposit wallet.",
			"PROFILE_REQUIRED",
		);
	}

	const sql = getDb(env);
	try {
		const customer = await createCustomer(env, {
			firstName: profile.firstName,
			lastName: profile.lastName,
			emailAddress: profile.email,
			mobileNumber: profile.mobileNumber,
			dob: profile.dob,
			address: profile.address,
			city: profile.city,
			country: profile.country,
		});
		const wallet = await createCryptoWallet(env, customer.id);

		await sql`
			INSERT INTO user_wallets (
				user_sub, deposit_address, encrypted_privkey, locked_usdc, created_at,
				fossapay_customer_id, fossapay_wallet_id, provider
			) VALUES (
				${userSub}, ${wallet.address}, NULL, 0, ${Date.now()},
				${customer.id}, ${wallet.walletId}, 'fossapay'
			)
			ON CONFLICT (user_sub) DO NOTHING
		`;
	} catch (e) {
		if (e instanceof WalletCreateError) throw e;
		const msg = e instanceof FossaPayError ? e.message : e instanceof Error ? e.message : String(e);
		throw new WalletCreateError(msg, "FOSSAPAY_ERROR");
	}

	const row = await sql`SELECT * FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	if (!row[0]) throw new WalletCreateError("Wallet create race failed", "FOSSAPAY_ERROR");
	return rowToWallet(row[0]);
}

async function createLocalWallet(env: Env, userSub: string): Promise<UserWallet> {
	const sql = getDb(env);
	const keypair = Keypair.generate();
	const encrypted = await encryptPrivkey(env, keypair.secretKey);
	const depositAddress = keypair.publicKey.toBase58();

	await sql`
		INSERT INTO user_wallets (
			user_sub, deposit_address, encrypted_privkey, locked_usdc, created_at, provider
		) VALUES (
			${userSub}, ${depositAddress}, ${encrypted}, 0, ${Date.now()}, 'local'
		)
		ON CONFLICT (user_sub) DO NOTHING
	`;

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

/** All wallets (any provider). Prefer getLocalWallets for sweep. */
export async function getAllWallets(env: Env): Promise<UserWallet[]> {
	const sql = getDb(env);
	const rows = await sql`SELECT * FROM user_wallets`;
	return rows.map(rowToWallet);
}

/** Local custodial wallets only — have encrypted privkeys for on-chain sweep. */
export async function getLocalWallets(env: Env): Promise<UserWallet[]> {
	const sql = getDb(env);
	const rows = await sql`
		SELECT * FROM user_wallets
		WHERE provider = 'local' AND encrypted_privkey IS NOT NULL
	`;
	return rows.map(rowToWallet);
}

export async function getWalletByFossaPayCustomerId(
	env: Env,
	customerId: string,
): Promise<UserWallet | null> {
	const sql = getDb(env);
	const rows = await sql`
		SELECT * FROM user_wallets
		WHERE fossapay_customer_id = ${customerId}
		LIMIT 1
	`;
	return rows[0] ? rowToWallet(rows[0]) : null;
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
	const provider = (row.provider as string) === "fossapay" ? "fossapay" : "local";
	return {
		userSub: row.user_sub as string,
		depositAddress: row.deposit_address as string,
		withdrawalAddress: (row.withdrawal_address as string) ?? null,
		lockedUsdc: BigInt(row.locked_usdc as string | number),
		createdAt: Number(row.created_at),
		provider,
		fossapayCustomerId: (row.fossapay_customer_id as string) ?? null,
		fossapayWalletId: (row.fossapay_wallet_id as string) ?? null,
		hasLocalPrivkey: Boolean(row.encrypted_privkey),
	};
}
