import { KaminoMarket, address } from "@kamino-finance/kliquidity-sdk";
import { createSolanaRpc } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

async function test() {
    const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
    const market = await KaminoMarket.load(rpc, address("DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek"), 400);
    const obligation = await market.getObligationByWallet(address("DsE6GDZcHBujEdZB6uypHiFFUKMonaySqK8eHZjgYkSu"));
    if (!obligation) {
        console.log("No obligation found for this wallet");
        return;
    }
    const deposits = obligation.state.deposits;
    console.log("Deposits count:", deposits.length);
    for (const d of deposits) {
        console.log(d.depositReserve.toString());
    }
    // Is the $10 there?
}
test().catch(console.error);
