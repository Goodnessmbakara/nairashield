/**
 * FossaPay API client — Solana USDC wallet custody (v1).
 * Fail closed: never invent balances or wallet addresses.
 *
 * Docs: https://docs.fossapay.com
 */

import type { Env } from "../types";

const DEFAULT_BASE = "https://api-production.fossapay.com/api/v1";

export type FossaPayCustomerInput = {
	firstName: string;
	lastName: string;
	emailAddress: string;
	mobileNumber: string;
	dob: string; // YYYY-MM-DD
	address: string;
	city: string;
	country: string;
	middleName?: string;
	type?: "individual" | "business";
};

export type FossaPayCustomer = {
	id: string;
	firstName: string;
	lastName: string;
	emailAddress: string;
};

export type FossaPayCryptoWallet = {
	walletId: string;
	address: string;
	network: string;
};

export class FossaPayError extends Error {
	constructor(
		message: string,
		public status: number,
		public body?: unknown,
	) {
		super(message);
		this.name = "FossaPayError";
	}
}

export function fossapayConfigured(env: Env): boolean {
	return Boolean(env.FOSSAPAY_API_KEY && env.FOSSAPAY_API_KEY.length > 8);
}

function baseUrl(env: Env): string {
	return (env.FOSSAPAY_API_URL || DEFAULT_BASE).replace(/\/$/, "");
}

async function fossaFetch<T>(
	env: Env,
	path: string,
	init?: RequestInit,
): Promise<T> {
	if (!fossapayConfigured(env)) {
		throw new FossaPayError("FOSSAPAY_API_KEY not configured", 503);
	}
	const url = `${baseUrl(env)}${path.startsWith("/") ? path : `/${path}`}`;
	const res = await fetch(url, {
		...init,
		headers: {
			"x-api-key": env.FOSSAPAY_API_KEY!,
			"Content-Type": "application/json",
			Accept: "application/json",
			...(init?.headers || {}),
		},
	});
	let body: unknown = null;
	const text = await res.text();
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	if (!res.ok) {
		const msg =
			typeof body === "object" && body && "message" in body
				? String((body as { message: unknown }).message)
				: `FossaPay HTTP ${res.status}`;
		throw new FossaPayError(msg, res.status, body);
	}
	return body as T;
}

type ApiEnvelope<T> = {
	success?: boolean;
	status?: string | boolean | number;
	message?: string;
	data?: T;
};

export async function createCustomer(
	env: Env,
	input: FossaPayCustomerInput,
): Promise<FossaPayCustomer> {
	const res = await fossaFetch<ApiEnvelope<FossaPayCustomer>>(env, "/customers", {
		method: "POST",
		body: JSON.stringify({
			firstName: input.firstName,
			lastName: input.lastName,
			middleName: input.middleName || "",
			emailAddress: input.emailAddress,
			mobileNumber: input.mobileNumber,
			dob: input.dob,
			address: input.address,
			city: input.city,
			country: input.country,
			type: input.type || "individual",
		}),
	});
	const data = res.data;
	if (!data?.id) {
		throw new FossaPayError("FossaPay createCustomer missing data.id", 502, res);
	}
	return data;
}

export async function createCryptoWallet(
	env: Env,
	customerId: string,
): Promise<FossaPayCryptoWallet> {
	const res = await fossaFetch<ApiEnvelope<FossaPayCryptoWallet>>(
		env,
		"/wallets/crypto/create",
		{
			method: "POST",
			body: JSON.stringify({ network: "solana", customerId }),
		},
	);
	const data = res.data;
	if (!data?.address || !data?.walletId) {
		throw new FossaPayError(
			"FossaPay createCryptoWallet missing address/walletId",
			502,
			res,
		);
	}
	return {
		walletId: data.walletId,
		address: data.address,
		network: data.network || "solana",
	};
}

export async function getCryptoBalance(
	env: Env,
	walletId: string,
	currency = "USDC",
): Promise<{ available: number; currency: string } | null> {
	const q = encodeURIComponent(currency);
	const res = await fossaFetch<
		ApiEnvelope<{
			wallet_id?: string;
			balances?: Array<{
				currency: string;
				available_balance: number;
				ledger_balance?: number;
			}>;
		}>
	>(env, `/wallets/${encodeURIComponent(walletId)}/balance?currency=${q}`);
	const balances = res.data?.balances;
	if (!balances?.length) return null;
	const row =
		balances.find((b) => b.currency.toUpperCase() === currency.toUpperCase()) ||
		balances[0];
	if (!row) return null;
	return { available: Number(row.available_balance), currency: row.currency };
}

/** Transfer USDC from a customer's FossaPay wallet to a Solana address (agent pool). */
export async function cryptoTransfer(
	env: Env,
	args: {
		customerId: string;
		recipient: string;
		amountUsdc: number;
	},
): Promise<{ status: string }> {
	if (!(args.amountUsdc > 0)) {
		throw new FossaPayError("cryptoTransfer amount must be > 0", 400);
	}
	const res = await fossaFetch<ApiEnvelope<{ status?: string }>>(env, "/transfers/crypto", {
		method: "POST",
		body: JSON.stringify({
			customerId: args.customerId,
			recipient: args.recipient,
			network: "solana",
			currency: "usdc",
			amount: args.amountUsdc,
		}),
	});
	return { status: res.data?.status || "processing" };
}

/** Verify FossaPay webhook HMAC-SHA256 (hex digest). */
export async function verifyWebhookSignature(
	env: Env,
	rawBody: string,
	signature: string | null,
): Promise<boolean> {
	const secret = env.FOSSAPAY_WEBHOOK_SECRET;
	if (!secret || !signature) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
	const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
	const a = hex.toLowerCase();
	const b = signature.trim().toLowerCase().replace(/^sha256=/, "");
	if (a.length !== b.length) return false;
	let ok = 0;
	for (let i = 0; i < a.length; i++) ok |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return ok === 0;
}
