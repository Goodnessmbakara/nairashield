/** Cloudflare Worker bindings + secrets. */
export interface Env {
	/** Workers AI binding (Llama etc.) */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	AI: any;
	/** Session + OAuth state store */
	SESSIONS: KVNamespace;
	/** Agent tick history + position snapshots + open books */
	AGENT_STATE: KVNamespace;

	/** Solana keypair (base58). Optional in local dev. */
	SOLANA_PRIVATE_KEY?: string;
	/** Solana RPC endpoint */
	RPC_URL?: string;

	/** Google OAuth */
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	WORKER_URL: string;
	FRONTEND_URL: string;
	SESSION_SECRET: string;

	/** Shared secret for the external cron trigger (GET /agent/run?key=…). */
	CRON_SECRET?: string;

	/** Integration credentials (optional until wired) */
	TXLINE_API_URL?: string;
	TXLINE_API_KEY?: string;

	/** Kamino Finance addresses */
	KAMINO_MARKET_PUBKEY?: string;
	USDC_MINT_PUBKEY?: string;

	/** Jupiter Predict (execution venue — Solana mainnet, no KYC, agent-signed) */
	JUPITER_API_URL?: string;
	/** Free key from portal.jup.ag/api-keys (registration, not identity KYC) */
	JUPITER_API_KEY?: string;
	/**
	 * JSON map: TxLINE fixtureId -> { outcomes: { teamLabel: { marketId, side } } }.
	 * Curated because TxLINE fixtures and Jupiter market ids share no common key.
	 */
	JUPITER_MARKET_MAP?: string;
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
	/** Soft cue to query BetDEX for settlement (not synthetic PnL) */
	settleAfter: string;
	status: "open" | "settled";
	/** Filled when settled */
	pnlUsdc?: number;
	settledAt?: string;
	redepositTxid?: string;
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
		betdex: boolean;
		kamino: boolean;
		wallet: boolean;
	};
	position?: YieldPosition;
	openPositions: OpenPosition[];
	lastTick?: AgentTickResult | null;
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
