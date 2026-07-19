/** Cloudflare Worker bindings + secrets. */
export interface Env {
	/** Workers AI binding (Llama etc.) */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	AI: any;
	/** Neon PostgreSQL connection string */
	DATABASE_URL: string;
	/** Session + OAuth state store */
	SESSIONS: KVNamespace;
	/** Agent tick history + position snapshots + open books */
	AGENT_STATE: KVNamespace;

	/** Solana keypair (base58). Optional in local dev. */
	SOLANA_PRIVATE_KEY?: string;
	/** Solana RPC for Kamino / Jupiter (mainnet). Public Solana RPCs block Cloudflare — use Helius/QuickNode. */
	RPC_URL?: string;
	/**
	 * Solana RPC for TxLINE on-chain verify (must match TxLINE cluster).
	 * When TxLINE is on txline-dev, set a *devnet* Helius/QuickNode URL here.
	 * Falls back to RPC_URL if unset.
	 */
	TXLINE_RPC_URL?: string;

	/** Google OAuth */
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	WORKER_URL: string;
	FRONTEND_URL: string;
	SESSION_SECRET: string;
	/** 32-byte hex key for AES-GCM encryption of custodial deposit keypairs */
	ACCOUNT_MASTER_KEY: string;
	/** Comma-separated admin emails, e.g. "alice@example.com,bob@example.com" */
	ADMIN_EMAILS?: string;

	/** FossaPay — managed Solana USDC wallets (replaces local deposit keypairs when set) */
	FOSSAPAY_API_KEY?: string;
	/** HMAC secret for POST /webhooks/fossapay */
	FOSSAPAY_WEBHOOK_SECRET?: string;
	/** Override API base (default https://api-production.fossapay.com/api/v1) */
	FOSSAPAY_API_URL?: string;

	/** Shared secret for the external cron trigger (GET /agent/run?key=…). */
	CRON_SECRET?: string;
	/**
	 * API key for read-only agent SDK / MCP (`GET /v1/*`).
	 * Pass as `Authorization: Bearer …` or `X-Retegol-Key`.
	 */
	RETEGOL_AGENT_KEY?: string;
	/** Fine-grained GitHub token for the team-designated state repo. */
	GH_TOKEN?: string;
	/** Team-designated state repo as "owner/repo" (owned by whoever mints GH_TOKEN). */
	GH_STATE_REPO?: string;

	/** Integration credentials (optional until wired) */
	TXLINE_API_URL?: string;
	TXLINE_API_KEY?: string;

	/** Kamino Finance addresses */
	KAMINO_MARKET_PUBKEY?: string;
	USDC_MINT_PUBKEY?: string;

	/** Jupiter Predict (execution venue — Solana mainnet, no KYC, agent-signed) */
	JUPITER_API_URL?: string;
	// Agent policy (yieldApy, trade size, margins, etc.) lives in src/agent/config.ts — not env.
}

// ── Agent domain ────────────────────────────────────────────────────

export type AgentAction = "TRADE" | "HOLD" | "SETTLE";

export type Decision = {
	action: AgentAction;
	team?: string;
	/** Decision decimal odds recorded on the book (execution fills at market) */
	spread?: number;
	/** BACK | LAY */
	side?: "BACK" | "LAY";
	reason: string;
	/** Y_net / C (fraction) after opportunity cost */
	edge?: number;
	/** Absolute expected Y_net in USDC */
	yNet?: number;
	/** Yield APY used in the decision */
	yieldApy?: number;
	/** Fair TxLINE decimal odds for selected outcome */
	fairOdds?: number;
	/** Maker margin applied */
	makerMargin?: number;
};

export type MarketOdds = {
	matchId: string;
	match: string;
	/** TxLINE participant names — used by Jupiter auto-discovery */
	p1?: string;
	p2?: string;
	status: "PRE_MATCH" | "IN_PLAY" | "ENDED" | "UNKNOWN";
	minute?: number;
	/** Decimal odds keyed by outcome label — TxLINE consensus / fair value */
	odds: Record<string, number>;
	source: "txline";
	fetchedAt: string;
};

export type YieldPosition = {
	protocol: "kamino";
	asset: "USDC";
	/** Current principal + accrued, USDC */
	balanceUsdc: number;
	/** Annualized APY as fraction */
	apy: number;
	/** Last known deposit tx */
	lastTxid?: string;
	updatedAt: string;
	/**
	 * Only "live" snapshots are ever stored (store.ts rejects the rest on load).
	 * "projection" is an ephemeral, never-persisted hypothetical used solely to
	 * run the decision model on live odds for a dry-run — never a real balance.
	 */
	source: "live" | "projection";
};

export type TradeOrder = {
	orderId: string;
	team: string;
	side: "BACK" | "LAY";
	/** Maker limit (decimal odds) */
	spread: number;
	/** TxLINE fair odds at quote time */
	fairOdds?: number;
	sizeUsdc: number;
	status: "placed" | "failed" | "skipped";
	txid?: string;
	error?: string;
};

/** Virtual paper capital for hackathon simulation (real TxLINE odds still required). */
export type SimMode = "off" | "paper";

/** Open maker book awaiting settlement (PRD Settlement State). */
export type OpenPosition = {
	id: string;
	matchId: string;
	match: string;
	team: string;
	side: "BACK" | "LAY";
	sizeUsdc: number;
	/** Maker fill / limit odds */
	makerOdds: number;
	fairOdds: number;
	orderId: string;
	placedAt: string;
	/** Soft cue to query Jupiter Predict for settlement (not synthetic PnL) */
	settleAfter: string;
	status: "open" | "settled";
	/** Filled when settled */
	pnlUsdc?: number;
	settledAt?: string;
	redepositTxid?: string;
	/** Set when the position was closed early by risk management */
	exitReason?: "take_profit" | "stop_loss";
	/** Real close transaction signature (Jupiter position close) */
	exitTxid?: string;
};

/** One early close performed by the TP/SL risk manager this tick. */
export type RiskExit = {
	positionId: string;
	team: string;
	reason: "take_profit" | "stop_loss";
	/** Implied win-probability move since entry, in points (+ favors us) */
	edgePoints: number;
	success: boolean;
	txid?: string;
	error?: string;
};

export type TickExecution = {
	withdrewUsdc?: number;
	withdrawTxid?: string;
	order?: TradeOrder;
	redeposited?: boolean;
	redepositTxid?: string;
	aborted?: boolean;
	abortReason?: string;
	/** Positions settled this tick */
	settlements?: SettlementResult[];
	/** Early closes performed by the TP/SL risk manager this tick */
	riskExits?: RiskExit[];
	/**
	 * True when this fill used virtual bankroll (no live Kamino/Jupiter).
	 * Odds and fixtures are still live TxLINE — only capital is paper.
	 */
	simulated?: boolean;
	/** Remaining virtual USDC after this sim tick */
	simBankrollUsdc?: number;
};

export type SettlementResult = {
	positionId: string;
	matchId: string;
	pnlUsdc: number;
	returnedUsdc: number;
	redepositTxid?: string;
	success: boolean;
	error?: string;
};

/**
 * Sharp odds movement between two consecutive real TxLINE snapshots.
 * Derived only from persisted tick history — never synthesized.
 */
export type OddsMovement = {
	outcome: string;
	/** Decimal odds at the previous tick */
	fromOdds: number;
	/** Decimal odds now */
	toOdds: number;
	/** Relative change, e.g. -0.042 = odds shortened 4.2% (market moved toward this outcome) */
	changePct: number;
	direction: "shortening" | "drifting";
	/** Previous snapshot timestamp (tick.at) */
	since: string;
};

export type AgentTickResult = {
	id: string;
	at: string;
	status: "Executed" | "Skipped" | "Aborted" | "Error" | "Settled";
	decision: Decision;
	market?: MarketOdds;
	yield?: YieldPosition;
	execution?: TickExecution;
	openPositions?: number;
	/**
	 * Dry-run only: what the agent WOULD decide on the live odds if it held
	 * policy-sized capital. Populated when there is no live position, so the
	 * demo shows genuine model reasoning. Never executed, never a real balance.
	 */
	projection?: {
		decision: Decision;
		hypotheticalCapitalUsdc: number;
	};
	/** Sharp odds shifts vs the previous tick's snapshot of the same fixture */
	movement?: OddsMovement[];
	/** TxLINE fixture verified against on-chain Merkle root (txoracle) */
	verification?: {
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
	error?: string;
	raw?: string;
	/** ms spent in this tick */
	durationMs: number;
};

export type AgentStatus = {
	ok: boolean;
	/** live = integrations configured; not_ready = missing keys (agent HOLDs honestly) */
	mode: "live" | "not_ready";
	integrations: {
		ai: boolean;
		txline: boolean;
		jupiter: boolean;
		kamino: boolean;
		wallet: boolean;
	};
	/** Live Kamino obligation only — omitted when unfunded (never invented). */
	position?: YieldPosition;
	/**
	 * free USDC in the agent wallet (SPL), not in Kamino.
	 * null = could not read; 0 = read and empty.
	 */
	walletUsdc?: number | null;
	/** Live Kamino USDC supply APY when readable (even if unfunded). */
	liveApy?: number | null;
	/** Honest capital state for the dashboard. */
	capital: "funded" | "unfunded" | "unknown" | "simulation";
	/** Paper bankroll when capital === "simulation" (hackathon path). */
	simBankrollUsdc?: number;
	openPositions: OpenPosition[];
	lastTick?: AgentTickResult | null;
	/** Most recent tick status — written to KV on every tick, including idle HOLDs not stored in DB. */
	currentStatus?: { action: string; reason: string; at: string };
	config: {
		tradeSizeUsdc: number;
		yieldApy: number;
		minEdge: number;
		makerMargin: number;
		eventHorizonHours: number;
		maxOpenPositions: number;
	};
};

// ── Auth (existing) ─────────────────────────────────────────────────

export type AuthUser = {
	sub: string;
	email: string;
	name: string;
	picture?: string;
};

export type SessionRecord = {
	id: string;
	user: AuthUser;
	createdAt: number;
	expiresAt: number;
};

export type OAuthStateRecord = {
	returnTo: string;
	createdAt: number;
};

/** @deprecated use AgentTickResult */
export type AgentResult =
	| { status: "Executed" | "Skipped"; decision: Decision }
	| { error: string; raw?: string };
