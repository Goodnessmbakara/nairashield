/**
 * Kamino yield client.
 * Real wallet/state only. Never invents balances or successful txs.
 *
 * Live deposit/withdraw require SOLANA_PRIVATE_KEY, a wired klend path, and a
 * coherent mainnet market/USDC/RPC. Any failure fails closed (safe abort)
 * rather than faking success.
 */

import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { KaminoAction, KaminoMarket, VanillaObligation, PROGRAM_ID } from "@kamino-finance/klend-sdk";
import { createSolanaRpc, createNoopSigner, address } from "@solana/kit";
// @ts-ignore bn.js ships no bundled types
import BN from "bn.js";
import type { AgentConfig } from "../agent/config";
import type { Env, YieldPosition } from "../types";
import { loadPosition, savePosition } from "../agent/store";
import { hasWallet, loadKeypair } from "../blockchain/wallet";

/**
 * Build + submit a Kamino deposit/withdraw.
 *
 * klend-sdk v9.1.5 is web3.js-v2 (@solana/kit) native: KaminoMarket.load needs a
 * kit Rpc and `owner` a kit TransactionSigner. We build the instructions with kit,
 * then submit through web3.js v1 (the rest of the worker's model) — so `owner` only
 * supplies an address (a no-op signer); the real signature is applied to the v1 tx
 * by the wallet keypair. Throws on any failure; callers convert that to a safe abort.
 */
async function runKaminoAction(
	env: Env,
	config: AgentConfig,
	amountUsdc: number,
	kind: "deposit" | "withdraw",
): Promise<{ txid: string }> {
	const rpc = createSolanaRpc(config.rpcUrl);
	const market = await KaminoMarket.load(rpc, address(config.kaminoMarketPubKey!), 400);
	if (!market) throw new Error("Could not load Kamino market");

	const reserves = market.getReservesByMint(address(config.usdcMintPubKey!));
	if (!reserves || reserves.length === 0) throw new Error("USDC reserve not found in market");
	const reserve = reserves[0];

	const keypair = loadKeypair(env);
	const owner = createNoopSigner(address(keypair.publicKey.toBase58()));
	const amountBn = new BN(Math.floor(amountUsdc * 1_000_000));
	const currentSlot = await rpc.getSlot().send();

	const props = {
		kaminoMarket: market,
		amount: amountBn,
		reserveAddress: reserve.address,
		owner,
		obligation: new VanillaObligation(PROGRAM_ID),
		useV2Ixs: false,
		scopeRefreshConfig: undefined,
		currentSlot,
	};
	const action =
		kind === "deposit"
			? await KaminoAction.buildDepositTxns(props)
			: await KaminoAction.buildWithdrawTxns(props);

	// Map kit Instructions → web3.js v1 TransactionInstructions.
	// AccountRole: READONLY=0, WRITABLE=1, READONLY_SIGNER=2, WRITABLE_SIGNER=3.
	const rawInstructions = [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
	const instructions = rawInstructions.map((ix) =>
		new TransactionInstruction({
			programId: new PublicKey(ix.programAddress),
			keys: (ix.accounts ?? []).map((acc) => {
				const a = acc as { address: string; role?: number };
				const role = a.role ?? 0;
				return {
					pubkey: new PublicKey(a.address),
					isSigner: role === 2 || role === 3,
					isWritable: role === 1 || role === 3,
				};
			}),
			data: Buffer.from(ix.data ?? []),
		}),
	);

	const connection = new Connection(config.rpcUrl, "confirmed");
	const tx = new Transaction().add(...instructions);
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
	tx.recentBlockhash = blockhash;
	tx.feePayer = keypair.publicKey;
	tx.sign(keypair);

	const txid = await connection.sendRawTransaction(tx.serialize());
	await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, "confirmed");
	return { txid };
}

export type YieldOpResult = {
	success: boolean;
	txid?: string;
	error?: string;
	balanceUsdc: number;
};

/**
 * Read yield position: on-chain first (Kamino obligation), fall back to DB snapshot.
 * Never invents a balance.
 */
export async function getYieldPosition(
	env: Env,
	config: AgentConfig,
): Promise<YieldPosition | null> {
	if (!hasWallet(env)) return null;

	// Try live on-chain read first when market + mint are configured
	if (config.kaminoMarketPubKey && config.usdcMintPubKey) {
		try {
			const balanceUsdc = await fetchKaminoBalance(config);
			if (balanceUsdc !== null) {
				const position: YieldPosition = {
					protocol: "kamino",
					asset: "USDC",
					balanceUsdc,
					apy: config.yieldApy,
					source: "live",
					updatedAt: new Date().toISOString(),
				};
				// Persist so history ticks have a balance to record
				await savePosition(env, position);
				return position;
			}
		} catch {
			// Fall through to stored snapshot
		}
	}

	// Fall back to last stored snapshot
	const stored = await loadPosition(env);
	if (stored?.source === "live") return { ...stored, apy: config.yieldApy };
	return null;
}

/**
 * Query the wallet's Kamino USDC obligation balance directly from chain.
 * Returns null if no obligation exists yet or on any error.
 */
async function fetchKaminoBalance(config: AgentConfig): Promise<number | null> {
	const rpc = createSolanaRpc(config.rpcUrl);
	const market = await KaminoMarket.load(rpc, address(config.kaminoMarketPubKey), 400);
	if (!market) return null;

	const { Keypair: KP } = await import("@solana/web3.js");
	const { default: bs58 } = await import("bs58");
	const walletKp = KP.fromSecretKey(bs58.decode(config.solanaPrivateKey));
	const walletAddress = address(walletKp.publicKey.toBase58());
	const usdcMintAddress = address(config.usdcMintPubKey);

	const obligation = await market.getUserVanillaObligation(walletAddress).catch(() => null);
	if (!obligation) return null;

	const deposits = obligation.getDepositsByMint(usdcMintAddress);
	if (!deposits || deposits.length === 0) return null;

	let totalUsdc = 0;
	for (const d of deposits) {
		// `amount` is a Decimal in lamports (6 decimals for USDC)
		if (d.amount) totalUsdc += d.amount.toNumber() / 1_000_000;
	}
	return totalUsdc > 0 ? totalUsdc : null;
}

export async function withdrawYield(
	env: Env,
	config: AgentConfig,
	amountUsdc: number,
): Promise<YieldOpResult> {
	const pos = await getYieldPosition(env, config);
	const balance = pos?.balanceUsdc ?? 0;

	if (amountUsdc <= 0) {
		return { success: false, error: "Invalid withdraw amount", balanceUsdc: balance };
	}
	if (!hasWallet(env)) {
		return {
			success: false,
			error: "SOLANA_PRIVATE_KEY not set; cannot withdraw from Kamino.",
			balanceUsdc: balance,
		};
	}
	if (!pos || pos.balanceUsdc < amountUsdc) {
		return {
			success: false,
			error: pos
				? `Insufficient yield balance (${pos.balanceUsdc.toFixed(2)} USDC)`
				: "No live Kamino position on record. Deposit USDC first.",
			balanceUsdc: balance,
		};
	}

	if (!config.kaminoMarketPubKey || !config.usdcMintPubKey) {
		return { success: false, error: "KAMINO_MARKET_PUBKEY or USDC_MINT_PUBKEY not configured", balanceUsdc: balance };
	}

	try {
		const { txid } = await runKaminoAction(env, config, amountUsdc, "withdraw");
		return {
			success: true,
			txid,
			balanceUsdc: balance - amountUsdc,
		};
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : String(e),
			balanceUsdc: balance,
		};
	}
}

export async function depositYield(
	env: Env,
	config: AgentConfig,
	amountUsdc: number,
): Promise<YieldOpResult> {
	const pos = await getYieldPosition(env, config);
	const balance = pos?.balanceUsdc ?? 0;

	if (amountUsdc <= 0) {
		return { success: false, error: "Invalid deposit amount", balanceUsdc: balance };
	}
	if (!hasWallet(env)) {
		return {
			success: false,
			error: "SOLANA_PRIVATE_KEY not set; cannot deposit to Kamino.",
			balanceUsdc: balance,
		};
	}

	if (!config.kaminoMarketPubKey || !config.usdcMintPubKey) {
		return { success: false, error: "KAMINO_MARKET_PUBKEY or USDC_MINT_PUBKEY not configured", balanceUsdc: balance };
	}

	try {
		const { txid } = await runKaminoAction(env, config, amountUsdc, "deposit");
		return {
			success: true,
			txid,
			balanceUsdc: balance + amountUsdc,
		};
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : String(e),
			balanceUsdc: balance,
		};
	}
}

/**
 * Persist a real on-chain snapshot after a successful live deposit/withdraw.
 * Only call this with verified balances/txids from chain — never synthetic values.
 */
export async function recordLivePosition(
	env: Env,
	position: YieldPosition,
): Promise<void> {
	if (position.source !== "live") {
		throw new Error("recordLivePosition only accepts source: live");
	}
	await savePosition(env, {
		...position,
		updatedAt: new Date().toISOString(),
	});
}
