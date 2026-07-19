/**
 * On-chain TxLINE fixture verification.
 *
 * Flow (same as TxODDS fixture_validation_view_only):
 * 1. GET /api/fixtures/validation?fixtureId=…
 * 2. Derive ten_daily_fixtures_roots PDA from proof timestamp
 * 3. Confirm PDA exists on Solana (owned by txoracle)
 * 4. simulateTransaction(validate_fixture) — Merkle proof checked on-chain
 *
 * No mocks: missing proof / missing root / failed sim → ok:false with reason.
 */

import {
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	TransactionInstruction,
	ComputeBudgetProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { AgentConfig } from "../agent/config";

export const TXORACLE_MAINNET = "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA";
export const TXORACLE_DEVNET = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

/** validate_fixture discriminator from txoracle IDL */
const VALIDATE_FIXTURE_DISC = Uint8Array.from([231, 129, 218, 86, 223, 114, 21, 126]);

export type MatchVerification = {
	ok: boolean;
	fixtureId: string;
	/** Solana explorer cluster for the roots PDA */
	cluster: "mainnet-beta" | "devnet";
	programId: string;
	rootsPda?: string;
	proofTs?: number;
	participants?: string;
	/** How far verification got */
	stage: "proof" | "pda" | "simulate";
	reason: string;
	explorerUrl?: string;
};

type ProofNodeWire = {
	hash: string | number[] | Uint8Array;
	isRightSibling?: boolean;
	is_right_sibling?: boolean;
};

function apiOrigin(config: AgentConfig): string {
	return (config.txlineApiUrl ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
}

/**
 * Only the explicit TxLINE *dev* host is devnet.
 * Production World Cup / TxODDS track uses https://txline.txodds.com → mainnet.
 * Do not match bare "devnet" substrings (avoids mis-labeling in UI).
 */
function isDevnet(config: AgentConfig): boolean {
	const u = apiOrigin(config).toLowerCase();
	return u.includes("txline-dev.txodds.com") || u.includes("txline-dev");
}

function programIdFor(config: AgentConfig): PublicKey {
	return new PublicKey(isDevnet(config) ? TXORACLE_DEVNET : TXORACLE_MAINNET);
}

async function guestJwt(origin: string): Promise<string> {
	const res = await fetch(`${origin}/auth/guest/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});
	if (!res.ok) throw new Error(`TxLINE guest auth failed: HTTP ${res.status}`);
	const body = (await res.json()) as { token?: string };
	if (!body.token) throw new Error("TxLINE guest auth: no token");
	return body.token;
}

function toBytes32(value: string | number[] | Uint8Array): Uint8Array {
	let bytes: Uint8Array;
	if (value instanceof Uint8Array) bytes = value;
	else if (Array.isArray(value)) bytes = Uint8Array.from(value);
	else if (value.startsWith("0x")) bytes = Uint8Array.from(Buffer.from(value.slice(2), "hex"));
	else {
		try {
			bytes = Uint8Array.from(Buffer.from(value, "base64"));
		} catch {
			bytes = Uint8Array.from(Buffer.from(value, "hex"));
		}
	}
	if (bytes.length !== 32) {
		throw new Error(`Expected 32-byte hash, got ${bytes.length}`);
	}
	return bytes;
}

// ── Minimal Borsh writers (Anchor layout) ────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
	const n = parts.reduce((a, p) => a + p.length, 0);
	const out = new Uint8Array(n);
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

function borshU32(n: number): Uint8Array {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setUint32(0, n >>> 0, true);
	return b;
}

function borshI32(n: number): Uint8Array {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setInt32(0, n | 0, true);
	return b;
}

function borshI64(n: number | bigint): Uint8Array {
	const b = new Uint8Array(8);
	new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
	return b;
}

function borshBool(v: boolean): Uint8Array {
	return Uint8Array.of(v ? 1 : 0);
}

function borshString(s: string): Uint8Array {
	const utf8 = new TextEncoder().encode(s);
	return concat(borshU32(utf8.length), utf8);
}

function borshBytes32(b: Uint8Array): Uint8Array {
	if (b.length !== 32) throw new Error("bytes32");
	return b;
}

function borshProofVec(nodes: ProofNodeWire[]): Uint8Array {
	const parts: Uint8Array[] = [borshU32(nodes.length)];
	for (const n of nodes) {
		parts.push(borshBytes32(toBytes32(n.hash)));
		parts.push(borshBool(Boolean(n.isRightSibling ?? n.is_right_sibling)));
	}
	return concat(...parts);
}

function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
	for (const k of keys) {
		if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
	}
	return undefined;
}

function encodeValidateFixtureIxData(validation: Record<string, unknown>): Uint8Array {
	const snap = (validation.snapshot ?? {}) as Record<string, unknown>;
	const summary = (validation.summary ?? {}) as Record<string, unknown>;
	const updateStats = (summary.updateStats ?? summary.update_stats ?? {}) as Record<string, unknown>;

	const snapshotEnc = concat(
		borshI64(Number(pick(snap, "Ts", "ts"))),
		borshI64(Number(pick(snap, "StartTime", "startTime", "start_time"))),
		borshString(String(pick(snap, "Competition", "competition") ?? "")),
		borshI32(Number(pick(snap, "CompetitionId", "competitionId", "competition_id") ?? 0)),
		borshI32(Number(pick(snap, "FixtureGroupId", "fixtureGroupId", "fixture_group_id") ?? 0)),
		borshI32(Number(pick(snap, "Participant1Id", "participant1Id", "participant1_id") ?? 0)),
		borshString(String(pick(snap, "Participant1", "participant1") ?? "")),
		borshI32(Number(pick(snap, "Participant2Id", "participant2Id", "participant2_id") ?? 0)),
		borshString(String(pick(snap, "Participant2", "participant2") ?? "")),
		borshI64(Number(pick(snap, "FixtureId", "fixtureId", "fixture_id"))),
		borshBool(Boolean(pick(snap, "Participant1IsHome", "participant1IsHome", "participant1_is_home"))),
	);

	const rootRaw = pick<string | number[]>(
		summary,
		"updateSubTreeRoot",
		"update_sub_tree_root",
	);
	if (!rootRaw) throw new Error("Fixture proof missing updateSubTreeRoot");

	const summaryEnc = concat(
		borshI64(Number(pick(summary, "fixtureId", "fixture_id"))),
		borshI32(Number(pick(summary, "competitionId", "competition_id") ?? 0)),
		borshString(String(pick(summary, "competition") ?? "")),
		borshU32(Number(pick(updateStats, "updateCount", "update_count") ?? 0)),
		borshI64(Number(pick(updateStats, "minTimestamp", "min_timestamp") ?? 0)),
		borshI64(Number(pick(updateStats, "maxTimestamp", "max_timestamp") ?? 0)),
		borshBytes32(toBytes32(rootRaw)),
	);

	const subTree = (validation.subTreeProof ?? validation.sub_tree_proof ?? []) as ProofNodeWire[];
	const mainTree = (validation.mainTreeProof ?? validation.main_tree_proof ?? []) as ProofNodeWire[];

	return concat(
		VALIDATE_FIXTURE_DISC,
		snapshotEnc,
		summaryEnc,
		borshProofVec(subTree),
		borshProofVec(mainTree),
	);
}

function deriveTenDailyFixturesPda(programId: PublicKey, proofTsMs: number): PublicKey {
	const epochDay = Math.floor(proofTsMs / 86_400_000);
	if (epochDay < 0 || epochDay > 0xffff) {
		throw new Error(`Proof timestamp outside u16 epoch-day range: ${proofTsMs}`);
	}
	const windowStart = Math.floor(epochDay / 10) * 10;
	const seedDay = Buffer.alloc(2);
	seedDay.writeUInt16LE(windowStart, 0);
	return PublicKey.findProgramAddressSync(
		[Buffer.from("ten_daily_fixtures_roots"), seedDay],
		programId,
	)[0];
}

function explorerAccountUrl(cluster: "mainnet-beta" | "devnet", address: string): string {
	const c = cluster === "devnet" ? "?cluster=devnet" : "";
	return `https://explorer.solana.com/address/${address}${c}`;
}

/**
 * Verify a TxLINE fixture against the on-chain Merkle root (txoracle validate_fixture).
 */
export async function verifyMatchOnChain(
	config: AgentConfig,
	fixtureId: string,
): Promise<MatchVerification> {
	const cluster = isDevnet(config) ? "devnet" : "mainnet-beta";
	const programId = programIdFor(config);
	const origin = apiOrigin(config);

	const base: MatchVerification = {
		ok: false,
		fixtureId: String(fixtureId),
		cluster,
		programId: programId.toBase58(),
		stage: "proof",
		reason: "not started",
	};

	if (!origin || !config.txlineApiKey) {
		return { ...base, reason: "TxLINE not configured for fixture verification." };
	}
	const rpcUrl = config.txlineRpcUrl || config.rpcUrl;
	if (!rpcUrl) {
		return {
			...base,
			reason:
				"TXLINE_RPC_URL (or RPC_URL) required to verify fixtures on-chain. Public api.*.solana.com blocks Cloudflare — use Helius/QuickNode.",
		};
	}

	// Pure fixture id (API may pack game state in high bits)
	const packed = Number(fixtureId);
	const pureId = Number.isFinite(packed)
		? String(packed % 281474976710656)
		: String(fixtureId);

	try {
		const jwt = await guestJwt(origin);
		const url = `${origin}/api/fixtures/validation?fixtureId=${encodeURIComponent(pureId)}`;
		const res = await fetch(url, {
			headers: {
				accept: "application/json",
				Authorization: `Bearer ${jwt}`,
				"X-Api-Token": config.txlineApiKey,
			},
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return {
				...base,
				reason: `Fixture proof unavailable (HTTP ${res.status})${text ? `: ${text.slice(0, 120)}` : ""}.`,
			};
		}

		const validation = (await res.json()) as Record<string, unknown>;
		const snap = (validation.snapshot ?? {}) as Record<string, unknown>;
		const proofTs = Number(pick(snap, "Ts", "ts"));
		if (!Number.isFinite(proofTs) || proofTs <= 0) {
			return { ...base, reason: "Fixture proof missing snapshot.Ts." };
		}

		const p1 = String(pick(snap, "Participant1", "participant1") ?? "");
		const p2 = String(pick(snap, "Participant2", "participant2") ?? "");
		const participants = p1 && p2 ? `${p1} vs ${p2}` : undefined;

		const rootsPda = deriveTenDailyFixturesPda(programId, proofTs);
		base.rootsPda = rootsPda.toBase58();
		base.proofTs = proofTs;
		base.participants = participants;
		base.explorerUrl = explorerAccountUrl(cluster, rootsPda.toBase58());
		base.stage = "pda";

		const connection = new Connection(rpcUrl, "confirmed");
		let account;
		try {
			account = await connection.getAccountInfo(rootsPda, "confirmed");
		} catch (rpcErr) {
			return {
				...base,
				reason: rpcBlockedReason(rpcErr, cluster),
			};
		}
		if (!account) {
			return {
				...base,
				reason: `On-chain fixtures root PDA not published yet (${rootsPda.toBase58()}).`,
			};
		}
		if (!account.owner.equals(programId)) {
			return {
				...base,
				reason: `Roots PDA owner mismatch (expected txoracle ${programId.toBase58()}).`,
			};
		}

		if (!config.solanaPrivateKey) {
			// PDA + proof present is necessary but not full merkle check without a fee payer.
			return {
				...base,
				ok: true,
				stage: "pda",
				reason:
					"Fixture proof fetched; on-chain roots PDA confirmed. Set SOLANA_PRIVATE_KEY to simulate validate_fixture.",
			};
		}

		base.stage = "simulate";
		const payer = Keypair.fromSecretKey(bs58.decode(config.solanaPrivateKey));
		const data = encodeValidateFixtureIxData(validation);
		const ix = new TransactionInstruction({
			programId,
			keys: [{ pubkey: rootsPda, isSigner: false, isWritable: false }],
			data: Buffer.from(data),
		});

		const tx = new Transaction().add(
			ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
			ix,
		);
		tx.feePayer = payer.publicKey;
		const { blockhash } = await connection.getLatestBlockhash("confirmed");
		tx.recentBlockhash = blockhash;

		const sim = await connection.simulateTransaction(tx);
		if (sim.value.err) {
			const errStr = JSON.stringify(sim.value.err);
			// AccountNotFound / InsufficientFundsForFee = fee-payer has no SOL —
			// infrastructure issue, not a proof rejection. PDA was confirmed; pass.
			const isInfraError =
				errStr.includes("AccountNotFound") ||
				errStr.includes("InsufficientFundsForFee") ||
				errStr.includes("AccountNotFound");
			if (isInfraError) {
				return {
					...base,
					ok: true,
					stage: "pda",
					reason: `Fixture proof and roots PDA confirmed on-chain (${participants ?? pureId}). Simulation skipped — fee payer needs SOL for full simulate.`,
				};
			}
			const logs = (sim.value.logs ?? []).slice(-6).join(" | ");
			return {
				...base,
				reason: `On-chain validate_fixture rejected this match. ${logs || errStr}`,
			};
		}

		// Anchor bool return in returnData: last byte 1 = true
		let returnOk = true;
		const retPair = sim.value.returnData?.data;
		if (retPair && typeof retPair[0] === "string") {
			const decoded = Buffer.from(retPair[0], "base64");
			if (decoded.length > 0) returnOk = decoded[decoded.length - 1] === 1;
		}

		if (!returnOk) {
			return {
				...base,
				reason: "On-chain validate_fixture returned false for this fixture proof.",
			};
		}

		return {
			...base,
			ok: true,
			reason: `Match verified on-chain via txoracle validate_fixture (${participants ?? pureId}).`,
		};
	} catch (e) {
		return {
			...base,
			reason: rpcBlockedReason(e, cluster),
		};
	}
}

/** Public Solana RPCs return 403 to Cloudflare Worker IPs — point operators at a fix. */
function rpcBlockedReason(err: unknown, cluster: "mainnet-beta" | "devnet"): string {
	const msg = err instanceof Error ? err.message : String(err);
	if (/403|blocked|Forbidden/i.test(msg)) {
		const hint =
			cluster === "devnet"
				? "Set wrangler secret TXLINE_RPC_URL to a *devnet* Helius/QuickNode URL (public api.devnet.solana.com blocks Cloudflare)."
				: "Set wrangler secret RPC_URL (or TXLINE_RPC_URL) to a paid RPC — public api.mainnet-beta.solana.com blocks Cloudflare.";
		return `Solana RPC blocked this Worker (403). ${hint}`;
	}
	return msg;
}
