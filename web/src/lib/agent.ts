// Real client for the Retegol Cloudflare Worker.
// Agent ticks require Google auth (Bearer session from /auth/exchange).

import { AGENT_URL, authHeaders, getToken, isAgentConfigured } from "./auth";

export type AgentAction = "TRADE" | "HOLD";

export type Decision = {
  action: AgentAction | "SETTLE";
  team?: string;
  spread?: number;
  side?: "BACK" | "LAY";
  reason: string;
  edge?: number;
  yNet?: number;
  yieldApy?: number;
  fairOdds?: number;
  makerMargin?: number;
};

export type TickMarket = {
  matchId?: string;
  match?: string;
  status?: string;
  minute?: number;
  odds?: Record<string, number>;
  source?: string;
};

export type TickYield = {
  balanceUsdc?: number;
  apy?: number;
  source?: string;
};

export type TickExecution = {
  aborted?: boolean;
  abortReason?: string;
  order?: { orderId?: string; status?: string };
};

/** Sharp odds shift between two consecutive real snapshots of the same fixture. */
export type TickMovement = {
  outcome: string;
  fromOdds: number;
  toOdds: number;
  changePct: number;
  direction: "shortening" | "drifting";
  since?: string;
};

/** On-chain TxLINE fixture check (txoracle Merkle root). */
export type MatchVerification = {
  ok: boolean;
  fixtureId: string;
  cluster: "mainnet-beta" | "devnet";
  programId: string;
  rootsPda?: string;
  proofTs?: number;
  participants?: string;
  stage: "proof" | "pda" | "simulate";
  reason: string;
  explorerUrl?: string;
};

/** Exact shape of the worker's tick response (plus optional user stamp). */
export type AgentResponse =
  | {
      status: "Executed" | "Skipped";
      decision: Decision;
      user?: { email: string; name: string };
      at?: string;
      error?: string;
      tick?: {
        id: string;
        at?: string;
        status?: string;
        market?: TickMarket;
        yield?: TickYield;
        execution?: TickExecution;
        movement?: TickMovement[];
        verification?: MatchVerification;
        durationMs?: number;
      };
    }
  | { error: string; raw?: string; code?: string; detail?: string };

/** A tick we actually observed, stamped client-side at receipt. */
export type Tick = {
  id: string;
  receivedAt: string;
  status: "Executed" | "Skipped";
  decision: Decision;
  market?: TickMarket;
  yield?: TickYield;
  execution?: TickExecution;
  movement?: TickMovement[];
  verification?: MatchVerification;
};

export { AGENT_URL };
export const isConfigured = () => isAgentConfigured();

export class AgentError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Run one agent tick against the real worker. Throws on any failure - no fallback. */
export async function fetchTick(signal?: AbortSignal): Promise<Tick> {
  if (!isConfigured()) {
    throw new AgentError("PUBLIC_AGENT_URL is not set. No agent endpoint configured.");
  }

  if (!getToken()) {
    throw new AgentError("Sign in with Google to run the agent.", "unauthorized");
  }

  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/agent/tick`, {
      method: "POST",
      signal,
      headers: authHeaders(),
      credentials: "include",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AgentError("Cannot reach the agent right now.");
  }

  if (res.status === 401) {
    throw new AgentError("Sign in with Google to run the agent.", "unauthorized");
  }

  if (!res.ok) {
    throw new AgentError("The agent couldn’t complete this check.");
  }

  let body: AgentResponse;
  try {
    body = (await res.json()) as AgentResponse;
  } catch {
    throw new AgentError("The agent returned an unexpected response.");
  }

  if ("error" in body && !("decision" in body)) {
    throw new AgentError(
      body.error === "unauthorized"
        ? "Sign in with Google to run the agent."
        : "The agent couldn’t make a clear decision this round.",
      body.code,
    );
  }

  const ok = body as Extract<AgentResponse, { decision: Decision }>;
  const tickId = ok.tick?.id ?? `${Date.now()}`;

  return {
    id: tickId,
    receivedAt: new Date().toLocaleTimeString(),
    status: ok.status,
    decision: ok.decision,
    market: ok.tick?.market,
    yield: ok.tick?.yield,
    execution: ok.tick?.execution,
    movement: ok.tick?.movement,
    verification: ok.tick?.verification,
  };
}

/** Fetch agent status (mode, integrations, position). Auth required. */
export async function fetchAgentStatus(signal?: AbortSignal) {
  if (!isConfigured() || !getToken()) return null;
  const res = await fetch(`${AGENT_URL}/agent/status`, {
    signal,
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    mode: "live" | "demo";
    integrations: Record<string, boolean>;
    position?: TickYield;
    config: { tradeSizeUsdc: number; yieldApy: number; minEdge: number };
  }>;
}

export type WatchedFixture = {
  fixtureId: string;
  p1: string;
  p2: string;
  start: number;
  live: boolean;
  bettable: boolean;
  flag1?: string;
  flag2?: string;
  competition?: string;
  competitionId?: number;
};

/** Fixtures the agent is watching (real TxLINE feed). Auth required. */
export async function fetchFixtures(signal?: AbortSignal): Promise<WatchedFixture[]> {
  if (!isConfigured() || !getToken()) return [];
  try {
    const res = await fetch(`${AGENT_URL}/agent/fixtures`, {
      signal,
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { fixtures?: WatchedFixture[] };
    return body.fixtures ?? [];
  } catch {
    return [];
  }
}

/** Run on-chain TxLINE proof check for one fixture. Auth required. */
export async function verifyFixture(
  fixtureId: string,
  signal?: AbortSignal,
): Promise<MatchVerification> {
  if (!isConfigured()) {
    throw new AgentError("PUBLIC_AGENT_URL is not set. No agent endpoint configured.");
  }
  if (!getToken()) {
    throw new AgentError("Sign in with Google to verify fixtures.", "unauthorized");
  }
  const res = await fetch(
    `${AGENT_URL}/agent/verify?fixtureId=${encodeURIComponent(fixtureId)}`,
    {
      signal,
      headers: authHeaders(),
      credentials: "include",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AgentError(
      text || `Verify failed (HTTP ${res.status})`,
      res.status === 401 ? "unauthorized" : undefined,
    );
  }
  const body = (await res.json()) as { verification?: MatchVerification; error?: string };
  if (!body.verification) {
    throw new AgentError(body.error || "No verification in response");
  }
  return body.verification;
}

/** Fetch recent tick history from KV. Auth required. */
export async function fetchAgentHistory(limit = 40, signal?: AbortSignal) {
  if (!isConfigured() || !getToken()) return [];
  const res = await fetch(`${AGENT_URL}/agent/history?limit=${limit}`, {
    signal,
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    ticks?: Array<{
      id: string;
      at: string;
      status: string;
      decision: Decision;
      market?: TickMarket;
      yield?: TickYield;
      execution?: TickExecution;
      movement?: TickMovement[];
      verification?: MatchVerification;
    }>;
  };
  return (body.ticks ?? []).map((t) => ({
    id: t.id,
    receivedAt: t.at ? new Date(t.at).toLocaleTimeString() : "",
    status: (t.status === "Executed" ? "Executed" : "Skipped") as "Executed" | "Skipped",
    decision: t.decision,
    market: t.market,
    yield: t.yield,
    execution: t.execution,
    movement: t.movement,
    verification: t.verification,
  })) satisfies Tick[];
}
