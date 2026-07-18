import { sweepDeposits } from "./src/account/sweep";
import { loadAgentConfig } from "./src/agent/config";
import { depositYield } from "./src/integrations/kamino";

const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    ACCOUNT_MASTER_KEY: process.env.ACCOUNT_MASTER_KEY,
    RPC_URL: process.env.RPC_URL,
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
    USDC_MINT_PUBKEY: process.env.USDC_MINT_PUBKEY,
    KAMINO_MARKET_PUBKEY: process.env.KAMINO_MARKET_PUBKEY
};

async function run() {
    const cfg = loadAgentConfig(env as any);
    console.log("Running manual sweep...");
    await sweepDeposits(env as any, cfg);
    console.log("Sweep complete!");
    
    console.log("Depositing swept USDC to Kamino...");
    const result = await depositYield(env as any, cfg, 2);
    console.log("Deposit result:", result);
}
run().catch(console.error);
