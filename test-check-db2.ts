import { getDb } from "./src/db/client";

const env = {
    DATABASE_URL: "postgresql://neondb_owner:npg_xHTXDr1fZ5CS@ep-holy-field-aus8zcgs-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
};

async function run() {
    const sql = getDb(env as any);
    const sig = "3Auc4Az5RAVfRZbvJXWEptAS2yuARK8dHcdxLSJ1Aav22DSY7BDUA1stimQzxEkuYroPZSKCmQkun1xq2yLchmvB";
    const existing = await sql`SELECT * FROM fund_transactions WHERE tx_signature = ${sig}`;
    console.log("Existing in DB:", existing);
    
    const wallet = await sql`SELECT * FROM user_wallets WHERE deposit_address = 'sPocJ5CPxVCPivdEjTxGXbFDrNwLGHve3mnG9rbvyNn'`;
    console.log("Wallet:", wallet);
}
run().catch(console.error);
