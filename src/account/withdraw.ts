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
import { getWallet, isValidSolanaPubkey } from "./wallet";
import {
	getTransaction,
	listTransactions,
} from "./ledger";
import { loadKeypair } from "../blockchain/wallet";
import { getDb } from "../db/client";

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

	// Calculate the gross balance (confirmed deposits minus completed withdrawals)
	// from the ledger to use as the upper bound in the atomic UPDATE guard.
	const txs = await listTransactions(env, userSub, 1000, 0);
	const confirmedIn = txs
		.filter((t) => t.type === "deposit" && t.status === "confirmed")
		.reduce((s, t) => s + t.amountUsdc, 0n);
	const completedOut = txs
		.filter((t) => t.type === "withdrawal_executed" && t.status === "completed")
		.reduce((s, t) => s + t.amountUsdc, 0n);
	const grossBalance = confirmedIn - completedOut;

	const id = uuidv4();
	const now = Date.now();
	const sql = getDb(env);

	// Atomic TOCTOU guard: the WHERE clause ensures that after incrementing
	// locked_usdc the total does not exceed the gross balance.  If a concurrent
	// request already used up part of the available balance the UPDATE affects
	// 0 rows and we return an error without touching the ledger.
	const updateResult = await sql`
		UPDATE user_wallets
		SET locked_usdc = locked_usdc + ${amountUsdc.toString()}
		WHERE user_sub = ${userSub}
		  AND (locked_usdc + ${amountUsdc.toString()}) <= ${grossBalance.toString()}
		RETURNING locked_usdc
	`;

	if (updateResult.length === 0) {
		return { error: "Insufficient available balance (concurrent request reduced it)." };
	}

	await sql`
		INSERT INTO fund_transactions
			(id, user_sub, type, amount_usdc, status, tx_signature, notes, created_at, updated_at)
		VALUES (
			${id}, ${userSub}, ${"withdrawal_request"}, ${amountUsdc.toString()},
			${"pending"}, ${null}, ${`To: ${wallet.withdrawalAddress}`},
			${now}, ${now}
		)
	`;

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
		const sql = getDb(env);
		const now = Date.now();
		await sql`
			UPDATE fund_transactions
			SET status = ${"pending"}, notes = ${`Send failed: ${msg}`}, updated_at = ${now}
			WHERE id = ${requestId}
		`;
		return { error: `On-chain transfer failed: ${msg}` };
	}

	// Atomically: insert execution record, decrement locked_usdc, mark request completed.
	const sql = getDb(env);
	const execId = uuidv4();
	const now = Date.now();
	await sql.transaction([
		sql`
			INSERT INTO fund_transactions
				(id, user_sub, type, amount_usdc, status, tx_signature, notes, created_at, updated_at)
			VALUES (
				${execId}, ${tx.userSub}, ${"withdrawal_executed"}, ${tx.amountUsdc.toString()},
				${"completed"}, ${sweepSig}, ${`Approved withdrawal. Request: ${requestId}`},
				${now}, ${now}
			)
		`,
		sql`
			UPDATE user_wallets
			SET locked_usdc = locked_usdc - ${tx.amountUsdc.toString()}
			WHERE user_sub = ${tx.userSub}
		`,
		sql`
			UPDATE fund_transactions
			SET status = ${"completed"}, notes = ${`Executed: ${sweepSig}`}, updated_at = ${now}
			WHERE id = ${requestId}
		`,
	]);

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

	// Atomically: decrement locked_usdc and mark request rejected.
	const sql = getDb(env);
	const now = Date.now();
	await sql.transaction([
		sql`
			UPDATE user_wallets
			SET locked_usdc = locked_usdc - ${tx.amountUsdc.toString()}
			WHERE user_sub = ${tx.userSub}
		`,
		sql`
			UPDATE fund_transactions
			SET status = ${"rejected"}, notes = ${reason ?? "Rejected by admin"}, updated_at = ${now}
			WHERE id = ${requestId}
		`,
	]);

	return { ok: true };
}

export async function listPendingWithdrawals(env: Env): Promise<WithdrawalRequest[]> {
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
