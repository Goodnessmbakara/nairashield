import { SolanaAgentKit, KeypairWallet } from "solana-agent-kit";
import type { Env } from "../types";
import { hasWallet, loadKeypair } from "./wallet";

/**
 * Solana Agent Kit handle for on-chain actions.
 * Requires SOLANA_PRIVATE_KEY — never uses an ephemeral/demo keypair.
 */
export function initializeAgent(env: Env): SolanaAgentKit {
	if (!hasWallet(env)) {
		throw new Error("SOLANA_PRIVATE_KEY is required for on-chain agent actions");
	}

	const rpc = env.RPC_URL || "https://api.devnet.solana.com";
	const keypair = loadKeypair(env);
	const wallet = new KeypairWallet(keypair, rpc);
	return new SolanaAgentKit(wallet, rpc, {});
}
