/**
 * Kamino yield client.
 * Real wallet/state only. Never invents balances or successful txs.
 *
 * Live deposit/withdraw require SOLANA_PRIVATE_KEY and a wired klend path.
 * Until on-chain instructions are fully configured, operations fail closed
 * (safe abort) rather than faking success.
 */

import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { KaminoAction, KaminoMarket, VanillaObligation, PROGRAM_ID } from "@kamino-finance/klend-sdk";
// @ts-ignore
import BN from "bn.js";
import type { AgentConfig } from "../agent/config";
import type { Env, YieldPosition } from "../types";
import { loadPosition, savePosition } from "../agent/store";
import { getWalletPublicKey, hasWallet, loadKeypair } from "../blockchain/wallet";

export type YieldOpResult = {
	success: boolean;
	txid?: string;
	error?: string;
	balanceUsdc: number;
};

/**
 * Read last known live position from KV, or report unavailable.
 * Does not seed fake capital.
 */
export async function getYieldPosition(
	env: Env,
	config: AgentConfig,
): Promise<YieldPosition | null> {
	const stored = await loadPosition(env);
	if (stored && stored.source === "live") {
		return {
			...stored,
			apy: config.yieldApy,
		};
	}

	// No invented balance. Caller must HOLD until a real deposit lands.
	if (!hasWallet(env)) {
		return null;
	}

	// Wallet present but no on-chain snapshot yet — still not a fake seed.
	return null;
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
		const connection = new Connection(config.rpcUrl, "confirmed");
		const marketPubkey = new PublicKey(config.kaminoMarketPubKey);
		const usdcMint = new PublicKey(config.usdcMintPubKey);
		// @ts-ignore: connection type mismatch with latest klend-sdk
		const market = await KaminoMarket.load(connection, marketPubkey, 400);
		if (!market) throw new Error("Could not load Kamino market");

		const reserves = market.getReservesByMint(usdcMint.toString() as any);
		if (!reserves || reserves.length === 0) throw new Error("USDC reserve not found in market");
		const reserve = reserves[0];

		const signer = loadKeypair(env);
		
		// klend expects BN for raw amounts (USDC has 6 decimals)
		// @ts-ignore: bn.js missing types
		const amountBn = new BN(Math.floor(amountUsdc * 1_000_000));
		
		const action = await KaminoAction.buildWithdrawTxns({
			kaminoMarket: market,
			amount: amountBn,
			reserveAddress: reserve.address,
			// @ts-ignore: Keypair to TransactionSigner mismatch
			owner: signer,
			obligation: new VanillaObligation(PROGRAM_ID),
			useV2Ixs: false,
			scopeRefreshConfig: undefined,
			// @ts-ignore: currentSlot type mismatch
			currentSlot: 0,
		});

		const rawInstructions = [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
		const instructions = rawInstructions.map((ix: any) => {
			return new TransactionInstruction({
				programId: new PublicKey(ix.programAddress),
				keys: (ix.accounts || []).map((acc: any) => {
					const role = acc.role ?? 0;
					return {
						pubkey: new PublicKey(acc.address),
						isSigner: role === 2 || role === 3,
						isWritable: role === 1 || role === 3,
					};
				}),
				data: Buffer.from(ix.data || [])
			});
		});
		const tx = new Transaction().add(...instructions);
		
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
		tx.recentBlockhash = blockhash;
		tx.feePayer = signer.publicKey;
		tx.sign(signer);

		const txid = await connection.sendRawTransaction(tx.serialize());
		await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, "confirmed");

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
		const connection = new Connection(config.rpcUrl, "confirmed");
		const marketPubkey = new PublicKey(config.kaminoMarketPubKey);
		const usdcMint = new PublicKey(config.usdcMintPubKey);
		// @ts-ignore: connection type mismatch with latest klend-sdk
		const market = await KaminoMarket.load(connection, marketPubkey, 400);
		if (!market) throw new Error("Could not load Kamino market");

		const reserves = market.getReservesByMint(usdcMint.toString() as any);
		if (!reserves || reserves.length === 0) throw new Error("USDC reserve not found in market");
		const reserve = reserves[0];

		const signer = loadKeypair(env);
		
		// klend expects BN for raw amounts (USDC has 6 decimals)
		// @ts-ignore: bn.js missing types
		const amountBn = new BN(Math.floor(amountUsdc * 1_000_000));
		
		const action = await KaminoAction.buildDepositTxns({
			kaminoMarket: market,
			amount: amountBn,
			reserveAddress: reserve.address,
			// @ts-ignore: Keypair to TransactionSigner mismatch
			owner: signer,
			obligation: new VanillaObligation(PROGRAM_ID),
			useV2Ixs: false,
			scopeRefreshConfig: undefined,
			// @ts-ignore: currentSlot type mismatch
			currentSlot: 0,
		});

		const rawInstructions = [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
		const instructions = rawInstructions.map((ix: any) => {
			return new TransactionInstruction({
				programId: new PublicKey(ix.programAddress),
				keys: (ix.accounts || []).map((acc: any) => {
					const role = acc.role ?? 0;
					return {
						pubkey: new PublicKey(acc.address),
						isSigner: role === 2 || role === 3,
						isWritable: role === 1 || role === 3,
					};
				}),
				data: Buffer.from(ix.data || [])
			});
		});
		const tx = new Transaction().add(...instructions);
		
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
		tx.recentBlockhash = blockhash;
		tx.feePayer = signer.publicKey;
		tx.sign(signer);

		const txid = await connection.sendRawTransaction(tx.serialize());
		await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, "confirmed");

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
