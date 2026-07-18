/**
 * Thin HTTP client for Retegol's read-only agent API (`GET /v1/*`).
 */

export type RetegolClientOptions = {
  /** Worker base URL, e.g. https://retegol-bot.zanbuilds.workers.dev */
  baseUrl: string;
  /** Value of wrangler secret RETEGOL_AGENT_KEY */
  apiKey: string;
  fetch?: typeof fetch;
};

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

export class RetegolError extends Error {
  status: number;
  body?: string;
  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "RetegolError";
    this.status = status;
    this.body = body;
  }
}

export class RetegolClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RetegolClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** From env: RETEGOL_URL + RETEGOL_AGENT_KEY */
  static fromEnv(
    env: Record<string, string | undefined> = process.env as Record<
      string,
      string | undefined
    >,
  ): RetegolClient {
    const baseUrl = env.RETEGOL_URL?.trim();
    const apiKey = env.RETEGOL_AGENT_KEY?.trim();
    if (!baseUrl) throw new Error("RETEGOL_URL is required");
    if (!apiKey) throw new Error("RETEGOL_AGENT_KEY is required");
    return new RetegolClient({ baseUrl, apiKey });
  }

  private async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Retegol-Key": this.apiKey,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new RetegolError(
        `Retegol ${path} failed (HTTP ${res.status})`,
        res.status,
        text.slice(0, 400),
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  status() {
    return this.get<Record<string, unknown>>("v1/status");
  }

  fixtures() {
    return this.get<{ fixtures: WatchedFixture[] }>("v1/fixtures");
  }

  history(limit = 40) {
    return this.get<{ ticks: unknown[]; count: number }>("v1/history", {
      limit: String(limit),
    });
  }

  verify(fixtureId: string) {
    return this.get<{ verification: MatchVerification }>("v1/verify", {
      fixtureId,
    });
  }
}

export default RetegolClient;
