/**
 * Kamino yield client.
 * Real wallet/state only. Never invents balances or successful txs.
 *
 * Live deposit/withdraw require SOLANA_PRIVATE_KEY and a wired klend path.
 * Until on-chain instructions are fully configured, operations fail closed
 * (safe abort) rather than faking success.
 */

import type { AgentConfig } from "../agent/config";
import type { Env, YieldPosition } from "../types";
import { loadPosition, savePosition } from "../agent/store";
import { getWalletPublicKey, hasWallet } from "../blockchain/wallet";

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

	// Fail closed until klend withdraw instruction is wired.
	// Never return success without a real chain txid.
	const pubkey = getWalletPublicKey(env);
	return {
		success: false,
		error: `Kamino withdraw not wired for ${pubkey ?? "wallet"}. Wire klend-sdk withdraw before executing trades.`,
		balanceUsdc: balance,
	};
}

export async function depositYield(
	env: Env,
	_config: AgentConfig,
	amountUsdc: number,
): Promise<YieldOpResult> {
	const pos = await getYieldPosition(env, _config);
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

	// Fail closed until klend deposit instruction is wired.
	const pubkey = getWalletPublicKey(env);
	return {
		success: false,
		error: `Kamino deposit not wired for ${pubkey ?? "wallet"}. Wire klend-sdk deposit before settlement redeposit.`,
		balanceUsdc: balance,
	};
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
