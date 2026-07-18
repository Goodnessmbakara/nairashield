import postgres from "postgres";

async function run() {
    const dbUrl = "postgresql://neondb_owner:npg_xHTXDr1fZ5CS@ep-holy-field-aus8zcgs-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    const sql = postgres(dbUrl);
    
    // The deposit signature from my earlier test: 3Auc4Az5RAVfRZbvJXWEptAS2yuARK8dHcdxLSJ1Aav22DSY7BDUA1stimQzxEkuYroPZSKCmQkun1xq2yLchmvB
    const sig = "3Auc4Az5RAVfRZbvJXWEptAS2yuARK8dHcdxLSJ1Aav22DSY7BDUA1stimQzxEkuYroPZSKCmQkun1xq2yLchmvB";
    const existing = await sql`SELECT * FROM fund_transactions WHERE tx_signature = ${sig}`;
    console.log("Existing in DB:", existing);
    
    // Also check user_wallets to see when it was created
    const wallet = await sql`SELECT * FROM user_wallets WHERE deposit_address = 'sPocJ5CPxVCPivdEjTxGXbFDrNwLGHve3mnG9rbvyNn'`;
    console.log("Wallet:", wallet);
    
    sql.end();
}
run().catch(console.error);
