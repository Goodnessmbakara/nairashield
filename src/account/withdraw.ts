import {
	Connection,
	PublicKey,
	Transaction,
} from "@solana/web3.js";
import {
	getAssociatedTokenAddress,
	createTransferInstruction,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Env } from "../types";
import type { AgentConfig } from "../agent/config";
import { getWallet, adjustLockedUsdc, isValidSolanaPubkey } from "./wallet";
import {
	insertTransaction,
	updateTransactionStatus,
	getTransaction,
	listTransactions,
} from "./ledger";
import { loadKeypair } from "../blockchain/wallet";

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

export type WithdrawalRequest = {
	id: string;
	userSub: string;
	amountUsdc: bigint;
	status: string;
	notes: string | null;
	createdAt: number;
};

export async function requestWithdrawal(
	env: Env,
	userSub: string,
	amountUsdc: bigint,
): Promise<{ id: string } | { error: string }> {
	if (amountUsdc <= 0n) return { error: "Amount must be greater than zero" };

	const wallet = await getWallet(env, userSub);
	if (!wallet) return { error: "No deposit wallet found. Call POST /account/wallet first." };
	if (!wallet.withdrawalAddress) return { error: "Set a withdrawal address first via PUT /account/wallet/withdrawal" };

	const txs = await listTransactions(env, userSub, 1000, 0);
	const confirmedIn = txs
		.filter((t) => t.type === "deposit" && t.status === "confirmed")
		.reduce((s, t) => s + t.amountUsdc, 0n);
	const completedOut = txs
		.filter((t) => t.type === "withdrawal_executed" && t.status === "completed")
		.reduce((s, t) => s + t.amountUsdc, 0n);
	const available = confirmedIn - completedOut - wallet.lockedUsdc;

	if (amountUsdc > available) {
		return { error: `Insufficient available balance. Available: ${available} micro-USDC` };
	}

	const id = uuidv4();
	await adjustLockedUsdc(env, userSub, amountUsdc);
	await insertTransaction(env, {
		id,
		userSub,
		type: "withdrawal_request",
		amountUsdc,
		status: "pending",
		txSignature: null,
		notes: `To: ${wallet.withdrawalAddress}`,
	});

	return { id };
}

export async function approveWithdrawal(
	env: Env,
	config: AgentConfig,
	requestId: string,
): Promise<{ ok: true; txSignature: string } | { error: string }> {
	const tx = await getTransaction(env, requestId);
	if (!tx) return { error: "Withdrawal request not found" };
	if (tx.type !== "withdrawal_request") return { error: "Not a withdrawal request" };
	if (tx.status !== "pending") return { error: `Request is already ${tx.status}` };

	const wallet = await getWallet(env, tx.userSub);
	if (!wallet?.withdrawalAddress) return { error: "User has no withdrawal address set" };
	if (!isValidSolanaPubkey(wallet.withdrawalAddress)) return { error: "Invalid withdrawal address" };

	const connection = new Connection(config.rpcUrl, "confirmed");
	const usdcMint = new PublicKey(config.usdcMintPubKey || "");
	const poolKeypair = loadKeypair(env);
	const poolTokenAccount = await getAssociatedTokenAddress(usdcMint, poolKeypair.publicKey);
	const destPubkey = new PublicKey(wallet.withdrawalAddress);
	const destTokenAccount = await getAssociatedTokenAddress(usdcMint, destPubkey);

	let sweepSig: string;
	try {
		const transferTx = new Transaction().add(
			createTransferInstruction(
				poolTokenAccount,
				destTokenAccount,
				poolKeypair.publicKey,
				tx.amountUsdc,
				[],
				TOKEN_PROGRAM_ID,
			),
		);
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
		transferTx.recentBlockhash = blockhash;
		transferTx.feePayer = poolKeypair.publicKey;
		transferTx.sign(poolKeypair);
		sweepSig = await connection.sendRawTransaction(transferTx.serialize());
		await connection.confirmTransaction({ signature: sweepSig, blockhash, lastValidBlockHeight }, "confirmed");
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await updateTransactionStatus(env, requestId, "pending", `Send failed: ${msg}`);
		return { error: `On-chain transfer failed: ${msg}` };
	}

	await insertTransaction(env, {
		id: uuidv4(),
		userSub: tx.userSub,
		type: "withdrawal_executed",
		amountUsdc: tx.amountUsdc,
		status: "completed",
		txSignature: sweepSig,
		notes: `Approved withdrawal. Request: ${requestId}`,
	});

	await adjustLockedUsdc(env, tx.userSub, -tx.amountUsdc);
	await updateTransactionStatus(env, requestId, "completed", `Executed: ${sweepSig}`);

	return { ok: true, txSignature: sweepSig };
}

export async function rejectWithdrawal(
	env: Env,
	requestId: string,
	reason?: string,
): Promise<{ ok: true } | { error: string }> {
	const tx = await getTransaction(env, requestId);
	if (!tx) return { error: "Withdrawal request not found" };
	if (tx.type !== "withdrawal_request") return { error: "Not a withdrawal request" };
	if (tx.status !== "pending") return { error: `Request is already ${tx.status}` };

	await adjustLockedUsdc(env, tx.userSub, -tx.amountUsdc);
	await updateTransactionStatus(env, requestId, "rejected", reason ?? "Rejected by admin");
	return { ok: true };
}

export async function listPendingWithdrawals(env: Env): Promise<WithdrawalRequest[]> {
	const { getDb } = await import("../db/client");
	const sql = getDb(env);
	const rows = await sql`
		SELECT id, user_sub, amount_usdc, status, notes, created_at
		FROM fund_transactions
		WHERE type = 'withdrawal_request' AND status = 'pending'
		ORDER BY created_at ASC
	`;
	return rows.map((r) => ({
		id: r.id as string,
		userSub: r.user_sub as string,
		amountUsdc: BigInt(r.amount_usdc as string | number),
		status: r.status as string,
		notes: (r.notes as string) ?? null,
		createdAt: Number(r.created_at),
	}));
}
