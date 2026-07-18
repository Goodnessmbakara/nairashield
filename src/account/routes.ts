import type { Env } from "../types";
import { json } from "../http/json";
import { requireSession } from "../auth/session";
import { loadAgentConfig } from "../agent/config";
import { getOrCreateWallet, getWallet, setWithdrawalAddress } from "./wallet";
import {
	getUserBalance,
	listTransactions,
	listSnapshots,
	getAllUserBalances,
	getPoolTotalUsdc,
} from "./ledger";
import { requestWithdrawal, approveWithdrawal, rejectWithdrawal, listPendingWithdrawals } from "./withdraw";
import { loadPosition } from "../agent/store";

function isAdmin(env: Env, email: string): boolean {
	const admins = (env.ADMIN_EMAILS || "")
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return admins.includes(email.toLowerCase());
}

async function kaminoBalance(env: Env): Promise<bigint> {
	const pos = await loadPosition(env);
	if (!pos || pos.source !== "live") return 0n;
	return BigInt(Math.floor(pos.balanceUsdc * 1_000_000));
}

export async function handleAccountRoutes(
	request: Request,
	env: Env,
	path: string,
	method: string,
): Promise<Response | null> {
	// ── User routes ────────────────────────────────────────────────────
	if (path.startsWith("/account/") || path === "/account") {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		const { session } = auth;
		const userSub = session.user.sub;

		// POST /account/wallet — create or return deposit address
		if (method === "POST" && path === "/account/wallet") {
			const wallet = await getOrCreateWallet(env, userSub);
			return json({ depositAddress: wallet.depositAddress, withdrawalAddress: wallet.withdrawalAddress });
		}

		// GET /account/wallet
		if (method === "GET" && path === "/account/wallet") {
			const wallet = await getWallet(env, userSub);
			if (!wallet) return json({ depositAddress: null, withdrawalAddress: null });
			return json({ depositAddress: wallet.depositAddress, withdrawalAddress: wallet.withdrawalAddress });
		}

		// PUT /account/wallet/withdrawal
		if (method === "PUT" && path === "/account/wallet/withdrawal") {
			let body: { address?: string } = {};
			try { body = (await request.json()) as typeof body; } catch { return json({ error: "Invalid JSON" }, 400); }
			if (!body.address) return json({ error: "address is required" }, 400);
			try {
				await setWithdrawalAddress(env, userSub, body.address);
				return json({ ok: true });
			} catch (e) {
				return json({ error: e instanceof Error ? e.message : "Invalid address" }, 400);
			}
		}

		// GET /account/balance
		if (method === "GET" && path === "/account/balance") {
			const kamino = await kaminoBalance(env);
			const bal = await getUserBalance(env, userSub, kamino);
			return json({
				netUsdc: bal.netUsdc.toString(),
				lockedUsdc: bal.lockedUsdc.toString(),
				sharePct: bal.sharePct,
				estimatedValueUsdc: bal.estimatedValueUsdc.toString(),
			});
		}

		// GET /account/transactions
		if (method === "GET" && path === "/account/transactions") {
			const url = new URL(request.url);
			const limit = Math.min(Number(url.searchParams.get("limit") || 40), 100);
			const offset = Number(url.searchParams.get("offset") || 0);
			const txs = await listTransactions(env, userSub, limit, offset);
			return json({
				transactions: txs.map((t) => ({ ...t, amountUsdc: t.amountUsdc.toString() })),
				count: txs.length,
			});
		}

		// GET /account/snapshots
		if (method === "GET" && path === "/account/snapshots") {
			const url = new URL(request.url);
			const days = Math.min(Number(url.searchParams.get("days") || 30), 365);
			const snaps = await listSnapshots(env, days);
			return json({ snapshots: snaps.map((s) => ({ ...s, totalUsdc: s.totalUsdc.toString() })) });
		}

		// POST /account/withdraw
		if (method === "POST" && path === "/account/withdraw") {
			let body: { amount_usdc?: string | number } = {};
			try { body = (await request.json()) as typeof body; } catch { return json({ error: "Invalid JSON" }, 400); }
			if (!body.amount_usdc) return json({ error: "amount_usdc is required" }, 400);
			const amount = BigInt(body.amount_usdc);
			const result = await requestWithdrawal(env, userSub, amount);
			if ("error" in result) return json({ error: result.error }, 400);
			return json({ ok: true, id: result.id }, 201);
		}

		// GET /account/withdraw
		if (method === "GET" && path === "/account/withdraw") {
			const txs = await listTransactions(env, userSub, 100, 0);
			const withdrawals = txs.filter((t) => t.type === "withdrawal_request" || t.type === "withdrawal_executed");
			return json({ withdrawals: withdrawals.map((t) => ({ ...t, amountUsdc: t.amountUsdc.toString() })) });
		}

		return null;
	}

	// ── Admin routes ───────────────────────────────────────────────────
	if (path.startsWith("/admin/")) {
		const auth = await requireSession(request, env);
		if (auth instanceof Response) return auth;
		if (!isAdmin(env, auth.session.user.email)) {
			return json({ error: "Forbidden" }, 403);
		}

		const config = loadAgentConfig(env);

		// GET /admin/withdrawals
		if (method === "GET" && path === "/admin/withdrawals") {
			const pending = await listPendingWithdrawals(env);
			return json({ withdrawals: pending.map((w) => ({ ...w, amountUsdc: w.amountUsdc.toString() })) });
		}

		// POST /admin/withdrawals/:id/approve
		const approveMatch = path.match(/^\/admin\/withdrawals\/([^/]+)\/approve$/);
		if (method === "POST" && approveMatch) {
			const result = await approveWithdrawal(env, config, approveMatch[1]!);
			if ("error" in result) return json({ error: result.error }, 400);
			return json(result);
		}

		// POST /admin/withdrawals/:id/reject
		const rejectMatch = path.match(/^\/admin\/withdrawals\/([^/]+)\/reject$/);
		if (method === "POST" && rejectMatch) {
			let body: { reason?: string } = {};
			try { body = (await request.json()) as typeof body; } catch { /* optional */ }
			const result = await rejectWithdrawal(env, rejectMatch[1]!, body.reason);
			if ("error" in result) return json({ error: result.error }, 400);
			return json(result);
		}

		// GET /admin/fund/balance
		if (method === "GET" && path === "/admin/fund/balance") {
			const kamino = await kaminoBalance(env);
			const poolTotal = await getPoolTotalUsdc(env);
			const users = await getAllUserBalances(env, kamino);
			return json({
				poolTotalUsdc: poolTotal.toString(),
				kaminoBalanceUsdc: kamino.toString(),
				users: users.map((u) => ({
					userSub: u.userSub,
					netUsdc: u.netUsdc.toString(),
					sharePct: u.sharePct,
					estimatedValueUsdc: u.estimatedValueUsdc.toString(),
				})),
			});
		}

		return null;
	}

	return null;
}
