/**
 * FossaPay webhook handler — credit fund ledger on deposit.completed.
 */

import type { Env } from "../types";
import { json } from "../http/json";
import { getDb } from "../db/client";
import {
	cryptoTransfer,
	fossapayConfigured,
	verifyWebhookSignature,
} from "../integrations/fossapay";
import { getWalletByFossaPayCustomerId } from "./wallet";
import { insertTransaction } from "./ledger";
import { loadKeypair, hasWallet } from "../blockchain/wallet";

type DepositPayload = {
	event?: string;
	eventId?: string;
	data?: {
		transactionId?: string;
		customerId?: string;
		amount?: number | string;
		currency?: string;
		transactionHash?: string;
		blockchain?: string;
		status?: string;
		recipient?: { address?: string; chain?: string };
	};
};

function uuidv4(): string {
	const arr = crypto.getRandomValues(new Uint8Array(16));
	arr[6] = (arr[6]! & 0x0f) | 0x40;
	arr[8] = (arr[8]! & 0x3f) | 0x80;
	return [...arr]
		.map((b, i) =>
			[4, 6, 8, 10].includes(i) ? `-${b.toString(16).padStart(2, "0")}` : b.toString(16).padStart(2, "0"),
		)
		.join("");
}

/** Webhook amount → micro-USDC. FossaPay crypto webhooks use base units (1e6). */
function amountToMicroUsdc(amount: number | string, currency: string): bigint | null {
	const cur = currency.toUpperCase();
	if (cur !== "USDC" && cur !== "USDT") return null;
	const n = typeof amount === "string" ? Number(amount) : amount;
	if (!Number.isFinite(n) || n <= 0) return null;
	// Human decimal (e.g. 10.5) → micro; integer base units (e.g. 1000000) stay as-is.
	if (!Number.isInteger(n) || n < 1000) {
		return BigInt(Math.floor(n * 1_000_000));
	}
	return BigInt(Math.floor(n));
}

export async function handleFossaPayWebhook(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!fossapayConfigured(env)) {
		return json({ error: "FossaPay not configured" }, 503);
	}

	const rawBody = await request.text();
	const signature =
		request.headers.get("x-fossapay-signature") ||
		request.headers.get("X-FossaPay-Signature");

	if (env.FOSSAPAY_WEBHOOK_SECRET) {
		const ok = await verifyWebhookSignature(env, rawBody, signature);
		if (!ok) return json({ error: "Invalid signature" }, 401);
	} else {
		console.log("[fossapay-webhook] FOSSAPAY_WEBHOOK_SECRET unset — skipping verify (dev only)");
	}

	let payload: DepositPayload;
	try {
		payload = JSON.parse(rawBody) as DepositPayload;
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const event = payload.event || "";
	const eventId = payload.eventId || payload.data?.transactionId || "";
	if (!eventId) return json({ error: "Missing eventId" }, 400);

	const sql = getDb(env);
	const existing = await sql`
		SELECT event_id FROM fossapay_webhook_events WHERE event_id = ${eventId} LIMIT 1
	`;
	if (existing[0]) {
		return json({ ok: true, duplicate: true });
	}

	// Persist event first for idempotency (even if we skip processing)
	const payloadJson = JSON.stringify(payload);
	await sql`
		INSERT INTO fossapay_webhook_events (event_id, event_type, customer_id, payload, processed_at)
		VALUES (
			${eventId},
			${event},
			${payload.data?.customerId ?? null},
			${payloadJson},
			${Date.now()}
		)
		ON CONFLICT (event_id) DO NOTHING
	`;

	if (event === "deposit.completed") {
		await handleDepositCompleted(env, payload).catch((e) => {
			console.log(
				"[fossapay-webhook] deposit handler error:",
				e instanceof Error ? e.message : e,
			);
		});
	}

	return json({ ok: true });
}

async function handleDepositCompleted(env: Env, payload: DepositPayload): Promise<void> {
	const data = payload.data;
	if (!data?.customerId) {
		console.log("[fossapay-webhook] deposit missing customerId");
		return;
	}

	const currency = data.currency || "USDC";
	const micro = amountToMicroUsdc(data.amount ?? 0, currency);
	if (micro === null || micro <= 0n) {
		console.log("[fossapay-webhook] ignoring non-USDC or zero amount", currency, data.amount);
		return;
	}

	const wallet = await getWalletByFossaPayCustomerId(env, data.customerId);
	if (!wallet) {
		console.log("[fossapay-webhook] no user for customer", data.customerId);
		return;
	}

	const txSig =
		data.transactionHash ||
		data.transactionId ||
		`fossapay:${payload.eventId || uuidv4()}`;

	await insertTransaction(env, {
		id: uuidv4(),
		userSub: wallet.userSub,
		type: "deposit",
		amountUsdc: micro,
		status: "confirmed",
		txSignature: txSig,
		notes: `FossaPay deposit ${currency} customer=${data.customerId}`,
	});

	// Sweep USDC into the agent pool so Kamino/Jupiter can use it.
	if (hasWallet(env) && wallet.fossapayCustomerId) {
		const agentAddr = loadKeypair(env).publicKey.toBase58();
		const humanUsdc = Number(micro) / 1_000_000;
		try {
			await cryptoTransfer(env, {
				customerId: wallet.fossapayCustomerId,
				recipient: agentAddr,
				amountUsdc: humanUsdc,
			});
		} catch (e) {
			console.log(
				"[fossapay-webhook] pool transfer failed (ledger already credited):",
				e instanceof Error ? e.message : e,
			);
		}
	}
}
