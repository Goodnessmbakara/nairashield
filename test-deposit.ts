import { depositYield } from "./src/integrations/kamino";
import { loadAgentConfig } from "./src/agent/config";

const env = {
    RPC_URL: "https://api.mainnet-beta.solana.com",
    KAMINO_MARKET_PUBKEY: "DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek",
    USDC_MINT_PUBKEY: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    SOLANA_PRIVATE_KEY: "4XMrdKXKdRcYjVowwVLqvmotaW6N2BMHT26YEfDpGsvQrgX8MuiwKFYyGS5srKmUERVfWRgNCysdzbBkuebVYMsw",
    DATABASE_URL: "postgresql://neondb_owner:npg_xHTXDr1fZ5CS@ep-holy-field-aus8zcgs-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
};

async function run() {
    const config = loadAgentConfig(env as any);
    console.log("Depositing 2 USDC to Kamino...");
    const result = await depositYield(env as any, config, 2);
    console.log(result);
}
run().catch(console.error);
