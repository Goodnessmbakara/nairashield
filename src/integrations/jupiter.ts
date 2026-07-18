/**
 * Jupiter Predict execution client — Solana mainnet, no KYC.
 *
 * The venue is Jupiter's prediction-market API (api.jup.ag/prediction/v1):
 * POST /orders returns an UNSIGNED base64 transaction which the agent's own
 * keypair signs and submits. No browser, no wallet-connect, no identity
 * verification — only a free portal API key (portal.jup.ag/api-keys).
 *
 * Semantics vs a classic exchange: markets are binary YES/NO contracts filled
 * by Jupiter's keeper network against aggregated liquidity — there is no
 * resting maker limit price. BACK team = buy the team's mapped side; LAY =
 * buy the opposite side. The decision's odds are recorded on the TradeOrder
 * for the books, but fills execute at market.
 *
 * Real venue only. Never invents order IDs or settlement PnL — every failure
 * path returns status:"failed" / settled:false honestly.
 */

import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { AgentConfig, JupiterOutcomeRef } from "../agent/config";
import type { TradeOrder } from "../types";

export type PlaceMakerParams = {
	team: string;
	/** Decision decimal odds — recorded on the book; Jupiter fills at market. */
	spread: number;
	sizeUsdc: number;
	side?: "BACK" | "LAY";
	fairOdds?: number;
	matchId?: string;
	/** TxLINE participant names — used for auto-discovery when matchId has no cached map. */
	p1?: string;
	p2?: string;
};

type JupiterOrderResponse = {
	transaction?: string;
	txMeta?: { blockhash?: string; lastValidBlockHeight?: number };
	order?: {
		orderPubkey?: string;
		positionPubkey?: string;
		contracts?: string;
		orderCostUsd?: string;
		estimatedTotalFeeUsd?: string;
	};
	error?: string;
	message?: string;
};

type JupiterMarket = { marketId: string; title: string; status: string };
type JupiterEvent = {
	eventId: string;
	subcategory?: string;
	metadata?: { title?: string };
	markets?: JupiterMarket[];
};

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * In-process cache: TxLINE fixtureId -> { teamLabel -> JupiterOutcomeRef }
 * Populated lazily on first order attempt per fixture.
 * Workers are single-threaded and short-lived, so a plain Map is safe.
 */
const outcomeCache = new Map<string, Record<string, JupiterOutcomeRef>>();

/**
 * Discover the Jupiter Predict event for a given match by searching with
 * participant names, then matching the event whose open markets contain
 * both teams. Returns null if no match found or API unreachable.
 */
async function discoverOutcomes(
	apiUrl: string,
	p1: string,
	p2: string,
): Promise<Record<string, JupiterOutcomeRef> | null> {
	try {
		// Search with p1 name; Jupiter's search is relevance-ranked so we filter client-side
		const res = await fetch(
			`${apiUrl}/events?search=${encodeURIComponent(p1)}&category=sports&limit=20`,
			{ headers: { accept: "application/json" } },
		);
		if (!res.ok) return null;
		const body = (await res.json()) as unknown;
		const events: JupiterEvent[] = Array.isArray(body)
			? (body as JupiterEvent[])
			: ((body as Record<string, unknown>).data as JupiterEvent[] | undefined) ?? [];

		const p1l = p1.toLowerCase();
		const p2l = p2.toLowerCase();

		for (const event of events) {
			const markets = (event.markets ?? []).filter((m) => m.status === "open");
			const titles = markets.map((m) => m.title.toLowerCase());
			// The per-match event has exactly these teams (and optionally Draw) as markets.
			// The tournament winner event has 30+ markets — reject it by requiring both teams
			// are present AND the event has ≤5 markets total (match-level).
			if (
				titles.includes(p1l) &&
				titles.includes(p2l) &&
				markets.length <= 5
			) {
				const outcomes: Record<string, JupiterOutcomeRef> = {};
				for (const m of markets) {
					outcomes[m.title] = { marketId: m.marketId, side: "YES" };
				}
				return outcomes;
			}
		}
		return null;
	} catch {
		return null;
	}
}

async function resolveOutcome(
	apiUrl: string,
	matchId: string,
	p1: string | undefined,
	p2: string | undefined,
	team: string,
): Promise<JupiterOutcomeRef | null> {
	// 1. Check cache
	let outcomes = outcomeCache.get(matchId);

	// 2. Auto-discover if not cached and we have participant names
	if (!outcomes && p1 && p2) {
		const discovered = await discoverOutcomes(apiUrl, p1, p2);
		if (discovered) {
			outcomeCache.set(matchId, discovered);
			outcomes = discovered;
		}
	}

	if (!outcomes) return null;

	// Exact match first, then case-insensitive
	if (outcomes[team]) return outcomes[team];
	const hit = Object.entries(outcomes).find(
		([label]) => label.toLowerCase() === team.toLowerCase(),
	);
	return hit ? hit[1] : null;
}

export async function placeMakerOrder(
	config: AgentConfig,
	params: PlaceMakerParams,
): Promise<TradeOrder> {
	const side = params.side ?? "BACK";
	const fail = (error: string): TradeOrder => ({
		orderId: "",
		team: params.team,
		side,
		spread: params.spread,
		fairOdds: params.fairOdds,
		sizeUsdc: params.sizeUsdc,
		status: "failed",
		error,
	});

	if (!config.solanaPrivateKey) return fail("Agent wallet not configured (SOLANA_PRIVATE_KEY).");
	if (!params.matchId) return fail("Missing matchId; cannot resolve a Jupiter market.");

	const outcome = await resolveOutcome(
		config.jupiterApiUrl,
		params.matchId,
		params.p1,
		params.p2,
		params.team,
	);
	if (!outcome?.marketId) {
		return fail(
			`No Jupiter market found for fixture ${params.matchId} / team "${params.team}". ` +
			`Ensure p1/p2 participant names are passed so auto-discovery can search Jupiter.`,
		);
	}

	try {
		const keypair = Keypair.fromSecretKey(bs58.decode(config.solanaPrivateKey));

		// BACK = buy the team's mapped side; LAY = buy the opposite side.
		const mappedYes = outcome.side === "YES";
		const isYes = side === "BACK" ? mappedYes : !mappedYes;

		const res = await fetch(`${config.jupiterApiUrl}/orders`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({
				ownerPubkey: keypair.publicKey.toBase58(),
				marketId: outcome.marketId,
				isYes,
				isBuy: true,
				// micro-USD: 1_000_000 = $1
				depositAmount: String(Math.round(params.sizeUsdc * 1_000_000)),
				depositMint: USDC_MINT,
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return fail(`Jupiter HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
		}

		const body = (await res.json()) as JupiterOrderResponse;
		if (!body.transaction || !body.order?.orderPubkey) {
			return fail(
				`Jupiter response missing transaction/order id${body.error || body.message ? `: ${body.error ?? body.message}` : ""}`,
			);
		}

		// Sign the venue-built transaction with the agent keypair and submit.
		const tx = VersionedTransaction.deserialize(
			Uint8Array.from(atob(body.transaction), (c) => c.charCodeAt(0)),
		);
		tx.sign([keypair]);

		const connection = new Connection(config.rpcUrl, "confirmed");
		const signature = await connection.sendRawTransaction(tx.serialize(), {
			skipPreflight: true,
		});
		if (body.txMeta?.blockhash && body.txMeta?.lastValidBlockHeight) {
			await connection.confirmTransaction(
				{
					signature,
					blockhash: body.txMeta.blockhash,
					lastValidBlockHeight: body.txMeta.lastValidBlockHeight,
				},
				"confirmed",
			);
		}

		return {
			// Composite id so settlement can query both order status and position.
			orderId: `${body.order.orderPubkey}|${body.order.positionPubkey ?? ""}`,
			team: params.team,
			side,
			spread: params.spread,
			fairOdds: params.fairOdds,
			sizeUsdc: params.sizeUsdc,
			status: "placed",
			txid: signature,
		};
	} catch (e) {
		return fail(e instanceof Error ? e.message : String(e));
	}
}

/**
 * Close a position early (sell all contracts) — the TP/SL exit path.
 * DELETE /positions/{positionPubkey} returns an unsigned transaction which
 * the agent signs and submits, exactly like order placement. Fail-closed:
 * any failure returns success:false and the position stays open.
 */
export async function closePosition(
	config: AgentConfig,
	orderId: string,
): Promise<{ success: boolean; txid?: string; error?: string }> {
	const [, positionPubkey] = orderId.split("|");
	if (!config.jupiterApiUrl) return { success: false, error: "Jupiter not configured" };
	if (!positionPubkey) return { success: false, error: "No positionPubkey recorded on this order" };
	if (!config.solanaPrivateKey) return { success: false, error: "Agent wallet not configured" };

	try {
		const res = await fetch(
			`${config.jupiterApiUrl}/positions/${encodeURIComponent(positionPubkey)}`,
			{
				method: "DELETE",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
			},
		);
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return { success: false, error: `Jupiter close HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}` };
		}
		const body = (await res.json()) as JupiterOrderResponse;
		if (!body.transaction) {
			return { success: false, error: "Jupiter close response missing transaction" };
		}

		const keypair = Keypair.fromSecretKey(bs58.decode(config.solanaPrivateKey));
		const tx = VersionedTransaction.deserialize(
			Uint8Array.from(atob(body.transaction), (c) => c.charCodeAt(0)),
		);
		tx.sign([keypair]);
		const connection = new Connection(config.rpcUrl, "confirmed");
		const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
		if (body.txMeta?.blockhash && body.txMeta?.lastValidBlockHeight) {
			await connection.confirmTransaction(
				{
					signature: txid,
					blockhash: body.txMeta.blockhash,
					lastValidBlockHeight: body.txMeta.lastValidBlockHeight,
				},
				"confirmed",
			);
		}
		return { success: true, txid };
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Read real settlement state. Order fill status comes from
 * GET /orders/status/{orderPubkey}; realized value only from an explicitly
 * resolved position. Anything unconfirmed reports settled:false — never
 * fabricated PnL.
 */
export async function fetchOrderSettlement(
	config: AgentConfig,
	orderId: string,
): Promise<{ settled: boolean; pnlUsdc?: number; returnedUsdc?: number; error?: string } | null> {
	if (!config.jupiterApiUrl || !orderId) return null;

	const [orderPubkey, positionPubkey] = orderId.split("|");
	if (!orderPubkey) return null;

	const headers = { accept: "application/json" };

	try {
		const statusRes = await fetch(
			`${config.jupiterApiUrl}/orders/status/${encodeURIComponent(orderPubkey)}`,
			{ headers },
		);
		if (statusRes.ok) {
			const statusBody = (await statusRes.json()) as { status?: string };
			const status = String(statusBody.status ?? "").toLowerCase();
			if (status === "failed") {
				return { settled: false, error: "Jupiter order failed to fill" };
			}
			if (status === "pending") {
				return { settled: false };
			}
		}

		// Filled (or status endpoint unavailable): look for an explicitly
		// resolved position before reporting any PnL.
		if (!positionPubkey || !config.solanaPrivateKey) return { settled: false };
		const owner = Keypair.fromSecretKey(bs58.decode(config.solanaPrivateKey)).publicKey.toBase58();
		const posRes = await fetch(
			`${config.jupiterApiUrl}/positions?ownerPubkey=${encodeURIComponent(owner)}`,
			{ headers },
		);
		if (!posRes.ok) return { settled: false };

		const posBody = (await posRes.json()) as {
			data?: Array<Record<string, unknown>>;
		};
		const positions = Array.isArray(posBody.data) ? posBody.data : [];
		const pos = positions.find(
			(p) => String(p.positionPubkey ?? p.pubkey ?? "") === positionPubkey,
		);
		if (!pos) return { settled: false };

		const resolved = pos.isResolved === true || pos.resolved === true || pos.isClaimable === true;
		if (!resolved) return { settled: false };

		const valueRaw = pos.claimableUsd ?? pos.valueUsd ?? pos.payoutUsd;
		const costRaw = pos.costUsd ?? pos.orderCostUsd;
		const returnedUsdc = typeof valueRaw === "string" || typeof valueRaw === "number" ? Number(valueRaw) : NaN;
		const costUsdc = typeof costRaw === "string" || typeof costRaw === "number" ? Number(costRaw) : NaN;

		if (!Number.isFinite(returnedUsdc)) {
			return { settled: false, error: "Position resolved but no numeric payout field" };
		}

		return {
			settled: true,
			returnedUsdc,
			pnlUsdc: Number.isFinite(costUsdc) ? returnedUsdc - costUsdc : undefined,
		};
	} catch (e) {
		return { settled: false, error: e instanceof Error ? e.message : String(e) };
	}
}
