import type { Env } from "../types";

export type AgentConfig = {
	tradeSizeUsdc: number;
	yieldApy: number;
	minEdge: number;
	/** Maker margin around TxLINE fair value */
	makerMargin: number;
	/** Assumed event horizon T (hours) for opportunity cost */
	eventHorizonHours: number;
	maxOpenPositions: number;
	rpcUrl: string;
	txlineApiUrl: string;
	txlineApiKey: string;
	betdexApiUrl: string;
	betdexApiKey: string;
};

export function loadAgentConfig(env: Env): AgentConfig {
	const tradeSizeUsdc = num(env.TRADE_SIZE_USDC, 10);
	const yieldApy = num(env.YIELD_APY, 0.08);
	const minEdge = num(env.MIN_EDGE, 0.01);
	const makerMargin = num(env.MAKER_MARGIN, 0.02);
	const eventHorizonHours = num(env.EVENT_HORIZON_HOURS, 2);
	const maxOpenPositions = Math.max(1, Math.floor(num(env.MAX_OPEN_POSITIONS, 3)));

	return {
		tradeSizeUsdc,
		yieldApy,
		minEdge,
		makerMargin,
		eventHorizonHours,
		maxOpenPositions,
		rpcUrl: env.RPC_URL || "https://api.devnet.solana.com",
		txlineApiUrl: (env.TXLINE_API_URL || "").replace(/\/$/, ""),
		txlineApiKey: env.TXLINE_API_KEY || "",
		betdexApiUrl: (env.BETDEX_API_URL || "https://prod.api.btdx.io").replace(/\/$/, ""),
		betdexApiKey: env.BETDEX_API_KEY || "",
	};
}

function num(v: string | undefined, fallback: number): number {
	if (v == null || v === "") return fallback;
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

export function integrationFlags(env: Env, config: AgentConfig) {
	return {
		ai: Boolean(env.AI),
		txline: Boolean(config.txlineApiKey && config.txlineApiUrl),
		betdex: Boolean(config.betdexApiKey),
		kamino: Boolean(env.SOLANA_PRIVATE_KEY),
		wallet: Boolean(env.SOLANA_PRIVATE_KEY),
	};
}

/** True when the agent can attempt a live market-making tick end-to-end. */
export function isAgentReady(env: Env, config: AgentConfig): boolean {
	const f = integrationFlags(env, config);
	return f.txline && f.betdex && f.wallet;
}
