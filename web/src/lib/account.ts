import { AGENT_URL, authHeaders, getToken, isAgentConfigured } from "./auth";

export type AccountWallet = {
  depositAddress: string | null;
  withdrawalAddress: string | null;
  provider?: "local" | "fossapay" | null;
  fossapayRequired?: boolean;
};

export type AccountProfile = {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  dob: string;
  address: string;
  city: string;
  country: string;
};

export type ProfileResponse = {
  profile: AccountProfile | null;
  fossapayRequired: boolean;
  sessionEmail: string;
  sessionName: string;
};

export type AccountBalance = {
  netUsdc: string;
  lockedUsdc: string;
  sharePct: number;
  estimatedValueUsdc: string;
};

export type FundTransaction = {
  id: string;
  type: "deposit" | "withdrawal_request" | "withdrawal_executed";
  amountUsdc: string;
  status: string;
  txSignature: string | null;
  notes: string | null;
  createdAt: number;
};

function microToUsdc(micro: string): string {
  const n = Number(micro) / 1_000_000;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export { microToUsdc };

async function apiFetch(path: string, init?: RequestInit) {
  if (!isAgentConfigured() || !getToken()) return null;
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getProfile(): Promise<ProfileResponse | null> {
  return apiFetch("/account/profile");
}

export async function saveProfile(
  input: AccountProfile,
): Promise<{ ok: true; profile: AccountProfile } | { error: string }> {
  if (!isAgentConfigured() || !getToken()) return { error: "Not authenticated" };
  const res = await fetch(`${AGENT_URL}/account/profile`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) return { error: data?.error || "Failed to save profile" };
  return { ok: true, profile: data.profile };
}

export async function getOrCreateWallet(): Promise<AccountWallet | { error: string; code?: string } | null> {
  if (!isAgentConfigured() || !getToken()) return null;
  const res = await fetch(`${AGENT_URL}/account/wallet`, {
    method: "POST",
    headers: { ...authHeaders() },
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) return { error: data?.error || "Failed to create wallet", code: data?.code };
  return data as AccountWallet;
}

export async function getWallet(): Promise<AccountWallet | null> {
  return apiFetch("/account/wallet");
}

export async function setWithdrawalAddress(address: string): Promise<boolean> {
  const res = await apiFetch("/account/wallet/withdrawal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return res?.ok === true;
}

export async function getBalance(): Promise<AccountBalance | null> {
  return apiFetch("/account/balance");
}

export async function getTransactions(limit = 20): Promise<FundTransaction[]> {
  const res = await apiFetch(`/account/transactions?limit=${limit}`);
  return res?.transactions ?? [];
}

export async function requestWithdrawal(amountUsdc: string): Promise<{ id: string } | { error: string }> {
  if (!isAgentConfigured() || !getToken()) return { error: "Not authenticated" };
  const res = await fetch(`${AGENT_URL}/account/withdraw`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ amount_usdc: amountUsdc }),
  });
  return res.json();
}
