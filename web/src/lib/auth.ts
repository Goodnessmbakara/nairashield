// Google auth client against the Edgeora Cloudflare Worker.
// Token is stored client-side for cross-origin local dev (worker ≠ frontend origin).

export type AuthUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

const TOKEN_KEY = "ns_auth_token";
const USER_KEY = "ns_auth_user";

export const AGENT_URL: string =
  (import.meta.env.PUBLIC_AGENT_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function isAgentConfigured() {
  return AGENT_URL.length > 0;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function persistSession(token: string, user: AuthUser, remember = true) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
  other.removeItem(TOKEN_KEY);
  other.removeItem(USER_KEY);
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function googleSignInUrl(returnTo?: string): string {
  if (!isAgentConfigured()) return "#";
  const next = returnTo || `${window.location.origin}/dashboard`;
  const u = new URL(`${AGENT_URL}/auth/google`);
  u.searchParams.set("return_to", next);
  return u.toString();
}

export async function exchangeCode(code: string): Promise<{ token: string; user: AuthUser }> {
  if (!isAgentConfigured()) {
    throw new Error("Agent URL is not configured (PUBLIC_AGENT_URL).");
  }
  const res = await fetch(`${AGENT_URL}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code }),
    credentials: "include",
  });
  const body = (await res.json()) as {
    token?: string;
    user?: AuthUser;
    error?: string;
  };
  if (!res.ok || !body.token || !body.user) {
    throw new Error(body.error || "Could not complete sign-in.");
  }
  return { token: body.token, user: body.user };
}

export async function emailSignIn(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  if (!isAgentConfigured()) throw new Error("Agent URL is not configured.");
  const res = await fetch(`${AGENT_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  const body = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
  if (!res.ok || !body.token || !body.user) {
    throw new Error(body.error || "Invalid email or password.");
  }
  return { token: body.token, user: body.user };
}

export async function emailRegister(
  email: string,
  password: string,
  name: string,
): Promise<{ token: string; user: AuthUser }> {
  if (!isAgentConfigured()) throw new Error("Agent URL is not configured.");
  const res = await fetch(`${AGENT_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, name }),
    credentials: "include",
  });
  const body = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
  if (!res.ok || !body.token || !body.user) {
    throw new Error(body.error || "Could not create account.");
  }
  return { token: body.token, user: body.user };
}

export async function fetchMe(signal?: AbortSignal): Promise<AuthUser | null> {
  if (!isAgentConfigured()) return null;
  const token = getToken();
  const headers: HeadersInit = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${AGENT_URL}/auth/me`, {
    headers,
    credentials: "include",
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: AuthUser | null };
  if (body.user) {
    // refresh stored user profile
    const t = getToken();
    if (t) persistSession(t, body.user);
  }
  return body.user ?? null;
}

export async function logout(): Promise<void> {
  if (isAgentConfigured()) {
    const token = getToken();
    const headers: HeadersInit = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      await fetch(`${AGENT_URL}/auth/logout`, {
        method: "POST",
        headers,
        credentials: "include",
      });
    } catch {
      // clear local anyway
    }
  }
  clearSession();
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
