import { AGENT_URL, authHeaders, getToken, isAgentConfigured } from "./auth";

export type FundBalance = {
  poolTotalUsdc: string;
  kaminoBalanceUsdc: string;
  users: {
    userSub: string;
    netUsdc: string;
    sharePct: number;
    estimatedValueUsdc: string;
  }[];
};

export type PendingWithdrawal = {
  id: string;
  userSub: string;
  amountUsdc: string;
  status: string;
  notes: string | null;
  createdAt: number;
};

async function adminFetch(path: string, init?: RequestInit) {
  if (!isAgentConfigured() || !getToken()) return null;
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getFundBalance(): Promise<FundBalance | null> {
  return adminFetch("/admin/fund/balance");
}

export async function getPendingWithdrawals(): Promise<PendingWithdrawal[]> {
  const res = await adminFetch("/admin/withdrawals");
  return res?.withdrawals ?? [];
}

export async function approveWithdrawal(
  id: string,
): Promise<{ ok: true; txSignature: string } | { error: string }> {
  if (!isAgentConfigured() || !getToken()) return { error: "Not authenticated" };
  const res = await fetch(`${AGENT_URL}/admin/withdrawals/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
  });
  return res.json();
}

export async function rejectWithdrawal(
  id: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  if (!isAgentConfigured() || !getToken()) return { error: "Not authenticated" };
  const res = await fetch(`${AGENT_URL}/admin/withdrawals/${id}/reject`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason }),
  });
  return res.json();
}

/** Returns true if the current user has admin access */
export async function checkAdminAccess(): Promise<boolean> {
  if (!isAgentConfigured() || !getToken()) return false;
  const res = await fetch(`${AGENT_URL}/admin/fund/balance`, {
    headers: authHeaders(),
    credentials: "include",
  });
  return res.ok;
}
