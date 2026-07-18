/**
 * One-time Kamino USDC deposit script.
 * Run: SOLANA_PRIVATE_KEY=<base58> npx tsx scripts/kamino-deposit.ts
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { KaminoAction, KaminoMarket, VanillaObligation, PROGRAM_ID } from "@kamino-finance/klend-sdk";
import { createSolanaRpc, createNoopSigner, address } from "@solana/kit";
// @ts-ignore
import BN from "bn.js";
import bs58 from "bs58";

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const KAMINO_MARKET_PUBKEY = process.env.KAMINO_MARKET_PUBKEY || "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const USDC_MINT_PUBKEY = process.env.USDC_MINT_PUBKEY || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEPOSIT_USDC = Number(process.env.DEPOSIT_USDC || "10");

async function main() {
	const privateKey = process.env.SOLANA_PRIVATE_KEY;
	if (!privateKey) {
		console.error("SOLANA_PRIVATE_KEY env var required");
		process.exit(1);
	}

	const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
	console.log("Wallet:", keypair.publicKey.toBase58());
	console.log("Depositing:", DEPOSIT_USDC, "USDC");
	console.log("Market:", KAMINO_MARKET_PUBKEY);

	const connection = new Connection(RPC_URL, "confirmed");

	// Check USDC balance first
	const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(
		keypair.publicKey,
		{ mint: new PublicKey(USDC_MINT_PUBKEY) },
	);
	if (tokenAccounts.length === 0) {
		console.error("No USDC token account found. Send USDC to the wallet first.");
		process.exit(1);
	}
	const usdcBalance = tokenAccounts[0].account.data.parsed.info.tokenAmount.uiAmount as number;
	console.log("USDC balance:", usdcBalance);
	if (usdcBalance < DEPOSIT_USDC) {
		console.error(`Insufficient USDC: have ${usdcBalance}, need ${DEPOSIT_USDC}`);
		process.exit(1);
	}

	const rpc = createSolanaRpc(RPC_URL);
	const market = await KaminoMarket.load(rpc, address(KAMINO_MARKET_PUBKEY), 400);
	if (!market) throw new Error("Could not load Kamino market");

	const reserves = market.getReservesByMint(address(USDC_MINT_PUBKEY));
	if (!reserves || reserves.length === 0) throw new Error("USDC reserve not found in market");
	const reserve = reserves[0];
	console.log("Reserve:", reserve.address);

	const owner = createNoopSigner(address(keypair.publicKey.toBase58()));
	const amountBn = new BN(Math.floor(DEPOSIT_USDC * 1_000_000));
	const currentSlot = await rpc.getSlot().send();

	const action = await KaminoAction.buildDepositTxns({
		kaminoMarket: market,
		amount: amountBn,
		reserveAddress: reserve.address,
		owner,
		obligation: new VanillaObligation(PROGRAM_ID),
		useV2Ixs: false,
		scopeRefreshConfig: undefined,
		currentSlot,
	});

	const rawInstructions = [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
	const instructions = rawInstructions.map((ix: any) =>
		new TransactionInstruction({
			programId: new PublicKey(ix.programAddress),
			keys: (ix.accounts ?? []).map((acc: any) => ({
				pubkey: new PublicKey(acc.address),
				isSigner: acc.role === 2 || acc.role === 3,
				isWritable: acc.role === 1 || acc.role === 3,
			})),
			data: Buffer.from(ix.data ?? []),
		}),
	);

	const tx = new Transaction().add(...instructions);
	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
	tx.recentBlockhash = blockhash;
	tx.feePayer = keypair.publicKey;
	tx.sign(keypair);

	console.log("Sending transaction...");
	const txid = await connection.sendRawTransaction(tx.serialize());
	await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, "confirmed");

	console.log("✓ Deposit confirmed:", txid);
	console.log(`https://solscan.io/tx/${txid}`);
}

main().catch((err) => {
	console.error("Deposit failed:", err?.message ?? err);
	process.exit(1);
});
