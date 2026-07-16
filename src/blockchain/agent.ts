import { SolanaAgentKit, KeypairWallet } from "solana-agent-kit";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Env } from "../types";

export function initializeAgent(env: Env): SolanaAgentKit {
	// For hackathon dev, if no private key is set, generate a random one to avoid crashing
	let keypair: Keypair;
	if (!env.SOLANA_PRIVATE_KEY) {
		console.warn("Missing SOLANA_PRIVATE_KEY in environment, generating a random one for mock execution.");
		keypair = Keypair.generate();
	} else {
		keypair = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
	}
	
	const wallet = new KeypairWallet(keypair, env.RPC_URL || 'https://api.devnet.solana.com');
	return new SolanaAgentKit(wallet, env.RPC_URL || 'https://api.devnet.solana.com');
}
