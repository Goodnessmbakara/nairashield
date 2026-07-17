import type { Env } from "../types";

/**
 * Agent policy — edit here, not in env / .dev.vars.
 * Y_net ≈ C · makerMargin − C · yieldApy · (eventHorizonHours / yearHours)
 * TRADE only when yNet/C >= minEdge.
 */
export const AGENT_POLICY = {
	/** Idle capital opportunity rate r (Kamino APY as fraction) */
	yieldApy: 0.08,
	/** USDC size per maker book (C) */
	tradeSizeUsdc: 10,
	/** Minimum Y_net / C before leaving yield */
	minEdge: 0.01,
	/** Quote width around TxLINE fair value */
	makerMargin: 0.02,
	/** Assumed open duration T (hours) for opportunity cost */
	eventHorizonHours: 2,
	/** Concurrent open books */
	maxOpenPositions: 3,
	/** Sharp-movement flag: min relative odds change between ticks (3%) */
	movementThreshold: 0.03,
	/** Default RPC if env.RPC_URL unset */
	defaultRpcUrl: "https://api.devnet.solana.com",
} as const;

export type AgentConfig = {
	tradeSizeUsdc: number;
	yieldApy: number;
	minEdge: number;
	makerMargin: number;
	eventHorizonHours: number;
	maxOpenPositions: number;
	movementThreshold: number;
	rpcUrl: string;
	txlineApiUrl: string;
	txlineApiKey: string;
	kaminoMarketPubKey: string;
	usdcMintPubKey: string;
	/** Agent wallet (base58) — the one keypair that signs Kamino + venue txs. */
	solanaPrivateKey: string;
	/** Jupiter Predict REST base (execution venue). */
	jupiterApiUrl: string;
	/** Jupiter portal API key (free registration, not identity KYC). */
	jupiterApiKey: string;
	/** Curated TxLINE fixture -> Jupiter market map (no shared id exists). */
	jupiterMarketMap: Record<string, JupiterMarketRef>;
};

export type JupiterOutcomeRef = {
	/** Jupiter Predict market id (e.g. from GET /events/{eventId}). */
	marketId: string;
	/** Which binary side represents this team winning. */
	side: "YES" | "NO";
};

export type JupiterMarketRef = {
	/** TxLINE team label -> Jupiter market + side. */
	outcomes: Record<string, JupiterOutcomeRef>;
};

function parseJupiterMarketMap(raw?: string): Record<string, JupiterMarketRef> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as Record<string, JupiterMarketRef>;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

export function loadAgentConfig(env: Env): AgentConfig {
	const p = AGENT_POLICY;
	return {
		tradeSizeUsdc: p.tradeSizeUsdc,
		yieldApy: p.yieldApy,
		minEdge: p.minEdge,
		makerMargin: p.makerMargin,
		eventHorizonHours: p.eventHorizonHours,
		maxOpenPositions: p.maxOpenPositions,
		movementThreshold: p.movementThreshold,
		rpcUrl: env.RPC_URL || p.defaultRpcUrl,
		txlineApiUrl: (env.TXLINE_API_URL || "").replace(/\/$/, ""),
		txlineApiKey: env.TXLINE_API_KEY || "",
		kaminoMarketPubKey: env.KAMINO_MARKET_PUBKEY || "",
		usdcMintPubKey: env.USDC_MINT_PUBKEY || "",
		solanaPrivateKey: env.SOLANA_PRIVATE_KEY || "",
		jupiterApiUrl: (env.JUPITER_API_URL || "https://api.jup.ag/prediction/v1").replace(/\/$/, ""),
		jupiterApiKey: env.JUPITER_API_KEY || "",
		jupiterMarketMap: parseJupiterMarketMap(env.JUPITER_MARKET_MAP),
	};
}

export function integrationFlags(env: Env, config: AgentConfig) {
	return {
		ai: Boolean(env.AI),
		txline: Boolean(config.txlineApiKey && config.txlineApiUrl),
		// Execution venue = Jupiter Predict (agent wallet + portal key + a mapped market).
		// Key kept as `betdex` so AgentStatus/frontend types stay unchanged.
		betdex: Boolean(
			config.solanaPrivateKey &&
				config.jupiterApiKey &&
				Object.keys(config.jupiterMarketMap).length > 0,
		),
		kamino: Boolean(env.SOLANA_PRIVATE_KEY && config.kaminoMarketPubKey && config.usdcMintPubKey),
		wallet: Boolean(env.SOLANA_PRIVATE_KEY),
	};
}

/** True when the agent can attempt a live market-making tick end-to-end. */
export function isAgentReady(env: Env, config: AgentConfig): boolean {
	const f = integrationFlags(env, config);
	return f.txline && f.betdex && f.wallet;
}
