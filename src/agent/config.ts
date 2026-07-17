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
	/** Default RPC if env.RPC_URL unset */
	defaultRpcUrl: "https://api.devnet.solana.com",
	/** Default BetDEX API host if env.BETDEX_API_URL unset */
	defaultBetdexApiUrl: "https://prod.api.btdx.io",
} as const;

export type AgentConfig = {
	tradeSizeUsdc: number;
	yieldApy: number;
	minEdge: number;
	makerMargin: number;
	eventHorizonHours: number;
	maxOpenPositions: number;
	rpcUrl: string;
	txlineApiUrl: string;
	txlineApiKey: string;
	betdexApiUrl: string;
	betdexApiKey: string;
	kaminoMarketPubKey: string;
	usdcMintPubKey: string;
};

export function loadAgentConfig(env: Env): AgentConfig {
	const p = AGENT_POLICY;
	return {
		tradeSizeUsdc: p.tradeSizeUsdc,
		yieldApy: p.yieldApy,
		minEdge: p.minEdge,
		makerMargin: p.makerMargin,
		eventHorizonHours: p.eventHorizonHours,
		maxOpenPositions: p.maxOpenPositions,
		rpcUrl: env.RPC_URL || p.defaultRpcUrl,
		txlineApiUrl: (env.TXLINE_API_URL || "").replace(/\/$/, ""),
		txlineApiKey: env.TXLINE_API_KEY || "",
		betdexApiUrl: (env.BETDEX_API_URL || p.defaultBetdexApiUrl).replace(/\/$/, ""),
		betdexApiKey: env.BETDEX_API_KEY || "",
		kaminoMarketPubKey: env.KAMINO_MARKET_PUBKEY || "",
		usdcMintPubKey: env.USDC_MINT_PUBKEY || "",
	};
}

export function integrationFlags(env: Env, config: AgentConfig) {
	return {
		ai: Boolean(env.AI),
		txline: Boolean(config.txlineApiKey && config.txlineApiUrl),
		betdex: Boolean(config.betdexApiKey),
		kamino: Boolean(env.SOLANA_PRIVATE_KEY && config.kaminoMarketPubKey && config.usdcMintPubKey),
		wallet: Boolean(env.SOLANA_PRIVATE_KEY),
	};
}

/** True when the agent can attempt a live market-making tick end-to-end. */
export function isAgentReady(env: Env, config: AgentConfig): boolean {
	const f = integrationFlags(env, config);
	return f.txline && f.betdex && f.wallet;
}
