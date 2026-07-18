import { decryptPrivkey } from "./src/account/wallet";
import { getDb } from "./src/db/client";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".dev.vars") });

const env = {
    DATABASE_URL: process.env.DATABASE_URL!,
    ACCOUNT_MASTER_KEY: process.env.ACCOUNT_MASTER_KEY!
};

async function run() {
    console.log("Master key:", env.ACCOUNT_MASTER_KEY);
    const sql = getDb(env as any);
    const rows = await sql`SELECT encrypted_privkey FROM user_wallets WHERE deposit_address = 'sPocJ5CPxVCPivdEjTxGXbFDrNwLGHve3mnG9rbvyNn'`;
    console.log("Encrypted:", rows[0].encrypted_privkey);
    try {
        const bytes = await decryptPrivkey(env as any, rows[0].encrypted_privkey);
        console.log("Decrypted successfully!", bytes.length);
    } catch(e) {
        console.log("Decryption failed:", e);
    }
}
run().catch(console.error);
