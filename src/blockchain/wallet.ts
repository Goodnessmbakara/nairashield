import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { Env } from "../types";

export function hasWallet(env: Env): boolean {
	return Boolean(env.SOLANA_PRIVATE_KEY && env.SOLANA_PRIVATE_KEY.length > 20);
}

export function loadKeypair(env: Env): Keypair {
	if (!env.SOLANA_PRIVATE_KEY) {
		throw new Error("SOLANA_PRIVATE_KEY is not set");
	}
	return Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
}

export function getWalletPublicKey(env: Env): string | null {
	try {
		if (!hasWallet(env)) return null;
		return loadKeypair(env).publicKey.toBase58();
	} catch {
		return null;
	}
}
