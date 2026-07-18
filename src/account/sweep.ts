import {
	Connection,
	PublicKey,
	Keypair,
	Transaction,
	sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
	getAssociatedTokenAddress,
	createTransferInstruction,
	getAccount,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Env } from "../types";
import type { AgentConfig } from "../agent/config";
import { getAllWallets, decryptPrivkey } from "./wallet";
import { insertTransaction } from "./ledger";
import { loadKeypair } from "../blockchain/wallet";

const SWEEP_TIMEOUT_MS = 30_000;

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

export async function sweepDeposits(env: Env, config: AgentConfig): Promise<void> {
	const wallets = await getAllWallets(env);
	if (wallets.length === 0) return;

	const connection = new Connection(config.rpcUrl, "confirmed");
	const usdcMint = new PublicKey(config.usdcMintPubKey || "");
	const poolKeypair = loadKeypair(env);
	const poolTokenAccount = await getAssociatedTokenAddress(usdcMint, poolKeypair.publicKey);

	for (const wallet of wallets) {
		try {
			await sweepWallet(env, connection, usdcMint, poolKeypair, poolTokenAccount, wallet);
		} catch (e) {
			console.log(`[sweep] wallet ${wallet.depositAddress} error:`, e instanceof Error ? e.message : e);
		}
	}
}

async function sweepWallet(
	env: Env,
	connection: Connection,
	usdcMint: PublicKey,
	poolKeypair: Keypair,
	poolTokenAccount: PublicKey,
	wallet: { userSub: string; depositAddress: string },
): Promise<void> {
	const depositPubkey = new PublicKey(wallet.depositAddress);
	const depositTokenAccount = await getAssociatedTokenAddress(usdcMint, depositPubkey);

	let tokenAccountInfo;
	try {
		tokenAccountInfo = await getAccount(connection, depositTokenAccount);
	} catch {
		return;
	}

	const balanceLamports = BigInt(tokenAccountInfo.amount.toString());
	if (balanceLamports === 0n) return;

	const sigs = await connection.getSignaturesForAddress(depositTokenAccount, { limit: 20 });

	for (const sigInfo of sigs) {
		if (sigInfo.err) continue;
		const sig = sigInfo.signature;

		const txDetail = await connection.getTransaction(sig, {
			maxSupportedTransactionVersion: 0,
		});
		if (!txDetail) continue;

		const preBalances = txDetail.meta?.preTokenBalances ?? [];
		const postBalances = txDetail.meta?.postTokenBalances ?? [];
		const pre = preBalances.find(
			(b) => b.mint === usdcMint.toBase58() && b.owner === wallet.depositAddress,
		);
		const post = postBalances.find(
			(b) => b.mint === usdcMint.toBase58() && b.owner === wallet.depositAddress,
		);
		if (!post) continue;

		const preAmt = BigInt(pre?.uiTokenAmount?.amount ?? "0");
		const postAmt = BigInt(post.uiTokenAmount?.amount ?? "0");
		const inflow = postAmt - preAmt;
		if (inflow <= 0n) continue;

		const encryptedPrivkey = await getEncryptedPrivkey(env, wallet.userSub);
		const depositPrivBytes = await decryptPrivkey(env, encryptedPrivkey);
		const depositKeypair = Keypair.fromSecretKey(depositPrivBytes);

		const sweepTx = new Transaction().add(
			createTransferInstruction(
				depositTokenAccount,
				poolTokenAccount,
				depositPubkey,
				inflow,
				[],
				TOKEN_PROGRAM_ID,
			),
		);

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Sweep confirmation timed out")), SWEEP_TIMEOUT_MS),
		);
		const sweepSig = await Promise.race([
			sendAndConfirmTransaction(connection, sweepTx, [depositKeypair], { commitment: "confirmed" }),
			timeoutPromise,
		]);

		await insertTransaction(env, {
			id: uuidv4(),
			userSub: wallet.userSub,
			type: "deposit",
			amountUsdc: inflow,
			status: "confirmed",
			txSignature: sweepSig,
			notes: `Swept from ${wallet.depositAddress}; source tx: ${sig}`,
		});
	}
}

async function getEncryptedPrivkey(env: Env, userSub: string): Promise<string> {
	const { getDb } = await import("../db/client");
	const sql = getDb(env);
	const rows = await sql`SELECT encrypted_privkey FROM user_wallets WHERE user_sub = ${userSub} LIMIT 1`;
	if (!rows[0]) throw new Error(`No wallet found for ${userSub}`);
	return rows[0].encrypted_privkey as string;
}
