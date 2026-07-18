import type { Env } from "../types";
import type { AgentConfig } from "../agent/config";
import { getDb } from "../db/client";
import { getWallet } from "./wallet";
import { getTransaction, insertTransaction, updateTransactionStatus } from "./ledger";
import { loadKeypair } from "../blockchain/wallet";
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

function uuidv4(): string {
	const arr = crypto.getRandomValues(new Uint8Array(16));
	arr[6] = (arr[6]! & 0x0f) | 0x40;
	arr[8] = (arr[8]! & 0x3f) | 0x80;
	return [...arr]
		.map((b, i) =>
			[4, 6, 8, 10].includes(i)
				? `-${b.toString(16).padStart(2, "0")}`
				: b.toString(16).padStart(2, "0"),
		)
		.join("");
}

/**
 * Process one pending withdrawal per tick if it has been queued long enough
 * and the user has not exceeded the daily limit. Runs best-effort — never
 * aborts the cron tick on failure.
 */
export async function processQueuedWithdrawals(env: Env, config: AgentConfig): Promise<void> {
	const sql = getDb(env);
	const delayMs = config.withdrawalDelayHours * 60 * 60 * 1000;
	const cutoff = Date.now() - delayMs;

	// Fetch the oldest pending request past the delay window — process one per tick
	const rows = await sql`
		SELECT id, user_sub, amount_usdc, created_at
		FROM fund_transactions
		WHERE type = 'withdrawal_request'
		  AND status = 'pending'
		  AND created_at <= ${cutoff}
		ORDER BY created_at ASC
		LIMIT 1
	`;
	if (!rows[0]) return;

	const request = rows[0];
	const requestId = request.id as string;
	const userSub = request.user_sub as string;
	const amountUsdc = BigInt(request.amount_usdc as string | number);

	// Daily limit check: sum completed withdrawals in last 24h for this user
	const since24h = Date.now() - 24 * 60 * 60 * 1000;
	const [dailyRow] = await sql`
		SELECT COALESCE(SUM(amount_usdc), 0) AS total
		FROM fund_transactions
		WHERE user_sub = ${userSub}
		  AND type = 'withdrawal_executed'
		  AND status = 'completed'
		  AND created_at >= ${since24h}
	`;
	const dailyTotal = BigInt(dailyRow.total as string | number);
	if (dailyTotal + amountUsdc > config.maxDailyWithdrawalUsdc) {
		await updateTransactionStatus(
			env,
			requestId,
			"pending",
			`Daily limit reached — will retry next window. Daily used: ${dailyTotal}`,
		);
		return;
	}

	const wallet = await getWallet(env, userSub);
	if (!wallet?.withdrawalAddress) {
		await updateTransactionStatus(env, requestId, "rejected", "No withdrawal address set");
		const sql2 = getDb(env);
		await sql2`
			UPDATE user_wallets
			SET locked_usdc = locked_usdc - ${amountUsdc.toString()}
			WHERE user_sub = ${userSub}
		`;
		return;
	}

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
				amountUsdc,
				[],
				TOKEN_PROGRAM_ID,
			),
		);
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
		transferTx.recentBlockhash = blockhash;
		transferTx.feePayer = poolKeypair.publicKey;
		transferTx.sign(poolKeypair);
		sweepSig = await connection.sendRawTransaction(transferTx.serialize());
		await connection.confirmTransaction(
			{ signature: sweepSig, blockhash, lastValidBlockHeight },
			"confirmed",
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await updateTransactionStatus(env, requestId, "pending", `Send failed: ${msg}`);
		return;
	}

	// Atomic: record execution + decrement lock + mark request completed
	const execId = uuidv4();
	const now = Date.now();
	const sql3 = getDb(env);
	await sql3.transaction([
		sql3`
			INSERT INTO fund_transactions
				(id, user_sub, type, amount_usdc, status, tx_signature, notes, created_at, updated_at)
			VALUES (
				${execId}, ${userSub}, ${"withdrawal_executed"}, ${amountUsdc.toString()},
				${"completed"}, ${sweepSig}, ${`Auto-processed. Request: ${requestId}`},
				${now}, ${now}
			)
		`,
		sql3`
			UPDATE user_wallets
			SET locked_usdc = locked_usdc - ${amountUsdc.toString()}
			WHERE user_sub = ${userSub}
		`,
		sql3`
			UPDATE fund_transactions
			SET status = ${"completed"}, notes = ${`Executed: ${sweepSig}`}, updated_at = ${now}
			WHERE id = ${requestId}
		`,
	]);

	console.log(`[autowithdraw] processed ${requestId} for ${userSub}: ${amountUsdc} micro-USDC → ${sweepSig}`);
}
