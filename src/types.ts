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

	/** Integration credentials (optional until wired) */
	TXLINE_API_URL?: string;
	TXLINE_API_KEY?: string;
	BETDEX_API_URL?: string;
	BETDEX_API_KEY?: string;

	/** Kamino Finance addresses */
	KAMINO_MARKET_PUBKEY?: string;
	USDC_MINT_PUBKEY?: string;
	// Agent policy (yieldApy, trade size, margins, etc.) lives in src/agent/config.ts — not env.
}

// ── Agent domain ────────────────────────────────────────────────────

export type AgentAction = "TRADE" | "HOLD" | "SETTLE";

export type Decision = {
	action: AgentAction;
	team?: string;
	/** Maker limit price (decimal odds) used on BetDEX */
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
	/** Only live snapshots are stored — never synthetic vaults */
	source: "live";
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

export type AgentTickResult = {
	id: string;
	at: string;
	status: "Executed" | "Skipped" | "Aborted" | "Error" | "Settled";
	decision: Decision;
	market?: MarketOdds;
	yield?: YieldPosition;
	execution?: TickExecution;
	openPositions?: number;
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
