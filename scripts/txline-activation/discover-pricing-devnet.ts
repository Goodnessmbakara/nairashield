/**
 * READ-ONLY pricing-matrix discovery for the txoracle program.
 *
 * Purpose:
 *   1. Prove the isolated @coral-xyz/anchor@0.32.1 toolchain can parse the
 *      Anchor 0.30+/0.32 txoracle IDL and build an anchor.Program.
 *   2. Derive the `pricing_matrix` PDA and fetch + print every ServiceRow.
 *   3. Identify the FREE real-time service level (pricePerWeekToken === 0 with
 *      the lowest samplingIntervalSec).
 *
 * Spends no SOL, needs no private key. Run:
 *   npx tsx discover-pricing.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";

const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

type Row = {
  rowId: number;
  pricePerWeekToken: bigint;
  samplingIntervalSec: number;
  leagueBundleId: number;
  marketBundleId: number;
};

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  // Build a read-only provider (dummy wallet — we never sign anything here).
  const dummyKeypair = anchor.web3.Keypair.generate();
  const wallet = new anchor.Wallet(dummyKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = `${__dirname}/txoracle-devnet.json`;
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  // Anchor 0.30+/0.32 reads the program id from idl.address.
  const program = new anchor.Program(idl as anchor.Idl, provider);
  console.log("[ok] Anchor 0.32.x built Program");
  console.log("Program ID :", program.programId.toBase58());
  if (program.programId.toBase58() !== PROGRAM_ID.toBase58()) {
    throw new Error("IDL address does not match expected txoracle program id");
  }

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  console.log("PricingMatrix PDA:", pricingMatrixPda.toBase58());

  const matrix: any = await (program.account as any).pricingMatrix.fetch(
    pricingMatrixPda,
  );

  console.log(`\nPricing matrix admin: ${matrix.admin.toBase58()}`);
  console.log(
    `Service level id.  Tokens/week   Sampling (sec)  League bundle  Market bundle`,
  );
  console.log(
    `=================   ===========   ==============  =============  =============`,
  );

  const rows: Row[] = matrix.rows.map((row: any) => ({
    rowId: Number(row.rowId),
    pricePerWeekToken: BigInt(row.pricePerWeekToken.toString()),
    samplingIntervalSec: Number(row.samplingIntervalSec),
    leagueBundleId: Number(row.leagueBundleId),
    marketBundleId: Number(row.marketBundleId),
  }));

  rows.forEach((row) => {
    console.log(
      String(row.rowId).padStart(12, " ") +
        row.pricePerWeekToken.toString().padStart(17, " ") +
        String(row.samplingIntervalSec).padStart(15, " ") +
        String(row.leagueBundleId).padStart(15, " ") +
        String(row.marketBundleId).padStart(12, " "),
    );
  });

  // Determine the free real-time level: pricePerWeekToken === 0 AND the lowest
  // samplingIntervalSec (real-time = smallest sampling interval).
  const freeRows = rows.filter((r) => r.pricePerWeekToken === 0n);
  console.log(`\nFree (0 tokens/week) rows: ${freeRows.map((r) => r.rowId).join(", ") || "none"}`);

  if (freeRows.length === 0) {
    console.log("\nNo zero-price rows found on-chain.");
    return;
  }

  const freeRealtime = freeRows.reduce((best, r) =>
    r.samplingIntervalSec < best.samplingIntervalSec ? r : best,
  );

  console.log("\n================ RESULT ================");
  console.log(
    `FREE REAL-TIME service_level_id = ${freeRealtime.rowId}`,
  );
  console.log(
    `  pricePerWeekToken   = ${freeRealtime.pricePerWeekToken.toString()} (free)`,
  );
  console.log(
    `  samplingIntervalSec = ${freeRealtime.samplingIntervalSec} (lowest among free rows = real-time)`,
  );
  console.log(
    `  leagueBundleId=${freeRealtime.leagueBundleId} marketBundleId=${freeRealtime.marketBundleId}`,
  );
  console.log("========================================");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("discover-pricing failed:", err?.message ?? err);
    process.exit(1);
  },
);
