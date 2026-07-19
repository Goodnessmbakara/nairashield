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
  p1?: string;
  p2?: string;
  start?: number;
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
  withdrewUsdc?: number;
  withdrawTxid?: string;
  redeposited?: boolean;
  redepositTxid?: string;
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
        status?: "Executed" | "Skipped" | "Aborted" | "Error" | "Settled" | string;
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
  /** UI-level: Executed = real fill; Skipped = HOLD / abort / settle / error */
  status: "Executed" | "Skipped";
  /** Full agent status when present (Aborted / Error / Settled from worker) */
  agentStatus?: "Executed" | "Skipped" | "Aborted" | "Error" | "Settled";
  decision: Decision;
  market?: TickMarket;
  yield?: TickYield;
  execution?: TickExecution;
  movement?: TickMovement[];
  verification?: MatchVerification;
};

/** Honest client-side failure tick for the app when the agent cannot be reached.
 * Not a trade, not fabricated odds — pure HOLD describing the failure path. */
export function failureSimulationTick(reason: string): Tick {
  const clean = reason.replace(/\s+/g, " ").trim() || "unknown error";
  return {
    id: `fail_${Date.now()}`,
    receivedAt: new Date().toLocaleTimeString(),
    status: "Skipped",
    agentStatus: "Error",
    decision: {
      action: "HOLD",
      reason: `Agent check failed — ${clean}. No trade placed; capital stays in yield.`,
    },
  };
}

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

  // Worker may return decision + error together (status Error with HOLD) — still a real tick.
  return normalizeTick({
    id: tickId,
    at: ok.tick?.at ?? ok.at,
    status: ok.tick?.status ?? ok.status,
    decision: ok.decision,
    market: ok.tick?.market,
    yield: ok.tick?.yield,
    execution: ok.tick?.execution,
    movement: ok.tick?.movement,
    verification: ok.tick?.verification,
  });
}

export type AgentStatusPayload = {
  ok?: boolean;
  mode: "live" | "demo" | "not_ready";
  integrations: Record<string, boolean>;
  position?: TickYield;
  walletUsdc?: number | null;
  liveApy?: number | null;
  capital?: "funded" | "unfunded" | "unknown";
  openPositions?: Array<{
    id: string;
    matchId?: string;
    match?: string;
    team?: string;
    side?: string;
    sizeUsdc?: number;
    makerOdds?: number;
    status?: string;
  }>;
  lastTick?: {
    id?: string;
    at?: string;
    status?: string;
    decision?: Decision;
    market?: TickMarket;
    yield?: TickYield;
    execution?: TickExecution;
    movement?: TickMovement[];
    verification?: MatchVerification;
    projection?: { decision: Decision; hypotheticalCapitalUsdc: number };
  };
  config: {
    tradeSizeUsdc: number;
    yieldApy: number;
    minEdge: number;
    makerMargin?: number;
    eventHorizonHours?: number;
    maxOpenPositions?: number;
  };
  currentStatus?: { action: string; reason: string; at: string };
};

/** Fetch agent status (mode, integrations, position, currentStatus). Auth required. */
export async function fetchAgentStatus(signal?: AbortSignal): Promise<AgentStatusPayload | null> {
  if (!isConfigured() || !getToken()) return null;
  try {
    const res = await fetch(`${AGENT_URL}/agent/status`, {
      signal,
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    return res.json() as Promise<AgentStatusPayload>;
  } catch {
    return null;
  }
}

/** Normalize a raw worker tick payload into the dashboard Tick shape. */
export function normalizeTick(t: {
  id: string;
  at?: string;
  status?: string;
  decision: Decision;
  market?: TickMarket;
  yield?: TickYield;
  execution?: TickExecution;
  movement?: TickMovement[];
  verification?: MatchVerification;
}): Tick {
  const agentStatus =
    t.status === "Executed" ||
    t.status === "Skipped" ||
    t.status === "Aborted" ||
    t.status === "Error" ||
    t.status === "Settled"
      ? t.status
      : undefined;
  return {
    id: t.id,
    receivedAt: t.at ? new Date(t.at).toLocaleTimeString() : "",
    status: t.status === "Executed" ? "Executed" : "Skipped",
    agentStatus,
    decision: t.decision,
    market: t.market,
    yield: t.yield,
    execution: t.execution,
    movement: t.movement,
    verification: t.verification,
  };
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
  return (body.ticks ?? []).map((t) =>
    normalizeTick({
      id: t.id,
      at: t.at,
      status: t.status,
      decision: t.decision,
      market: t.market,
      yield: t.yield,
      execution: t.execution,
      movement: t.movement,
      verification: t.verification,
    }),
  );
}

export type ReplayFixture = {
  fixtureId: string;
  p1: string;
  p2: string;
  start: number | string;
  live?: boolean;
  bettable?: boolean;
  flag1?: string;
  flag2?: string;
  competition?: string;
  competitionId?: number;
  source?: "ticks" | "txline" | "both";
};

export type ReplayData = {
  fixtures: ReplayFixture[];
  history: Record<string, Tick[]>;
  scores: Record<string, { home: number; away: number; minute?: number }>;
  meta?: { tickFixtures: number; txlinePast: number; matched: number };
};

/** Fetch past fixtures, agent history overlay, and final scores for replays. Auth required. */
export async function fetchReplays(limit = 1000, signal?: AbortSignal): Promise<ReplayData | null> {
  if (!isConfigured() || !getToken()) return null;
  try {
    const res = await fetch(`${AGENT_URL}/agent/replays?limit=${limit}`, {
      signal,
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      fixtures?: ReplayFixture[];
      history?: Record<string, Array<Record<string, unknown>>>;
      scores?: Record<string, { home: number; away: number; minute?: number }>;
      meta?: ReplayData["meta"];
    };

    const normalizedHistory: Record<string, Tick[]> = {};
    if (body.history) {
      for (const [matchId, ticks] of Object.entries(body.history)) {
        normalizedHistory[matchId] = ticks.map((t) =>
          normalizeTick({
            id: String(t.id),
            at: t.at as string | undefined,
            status: t.status as string | undefined,
            decision: t.decision as Decision,
            market: t.market as TickMarket | undefined,
            yield: t.yield as TickYield | undefined,
            execution: t.execution as TickExecution | undefined,
            movement: t.movement as TickMovement[] | undefined,
            verification: t.verification as MatchVerification | undefined,
          }),
        );
      }
    }

    return {
      fixtures: body.fixtures ?? [],
      history: normalizedHistory,
      scores: body.scores ?? {},
      meta: body.meta,
    };
  } catch {
    return null;
  }
}

export type ReplayOddsPoint = {
  ts: number;
  fixtureId?: string;
  inRunning?: boolean;
  prices?: [number, number, number] | number[];
  home?: number;
  draw?: number;
  away?: number;
  /** Raw TxLINE milliodds array (legacy) */
  Prices?: number[];
  pricesRaw?: number[];
};

/** Fetch TxLINE odds timeline for a replay fixture. Auth required. */
export async function fetchReplayOdds(
  fixtureId: string,
  signal?: AbortSignal,
): Promise<ReplayOddsPoint[]> {
  if (!isConfigured() || !getToken()) return [];
  try {
    const res = await fetch(
      `${AGENT_URL}/agent/replays/odds?fixtureId=${encodeURIComponent(fixtureId)}`,
      {
        signal,
        headers: authHeaders(),
        credentials: "include",
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { odds?: ReplayOddsPoint[] };
    return body.odds ?? [];
  } catch {
    return [];
  }
}
