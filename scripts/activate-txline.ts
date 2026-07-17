/**
 * TxLINE API token activation — one-time, one wallet.
 *
 * Flow (per HANDOFF.md, validated against examples/mainnet/idl/txoracle.json):
 *   1. On-chain `subscribe(service_level_id, weeks)` to the txoracle program
 *   2. Fetch a guest JWT
 *   3. Sign "{txSig}:{leagues}:{jwt}" with the wallet key
 *   4. POST /api/token/activate → returns the activated API token
 *
 * Run:
 *   SOLANA_PRIVATE_KEY="<base58>" npx ts-node scripts/activate-txline.ts
 *
 * Costs real SOL: one subscribe tx fee + ATA rent (~0.01 SOL). SL12 is the
 * free hackathon tier — no TxL purchase — but the wallet still pays the fee.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "fs";

// ── CONFIG ──────────────────────────────────────────────────────────────
const NETWORK: "mainnet" | "devnet" = "mainnet";

// Service level: 1 = 60s-delayed World Cup (free), 12 = real-time (free during hackathon)
const SERVICE_LEVEL_ID = 12;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = []; // empty = standard bundle

// Minimum SOL to even attempt (subscribe fee + up to 2 ATA rents + headroom)
const MIN_SOL = 0.02;

const CONFIG = {
  mainnet: {
    rpcUrl: "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
  },
  devnet: {
    rpcUrl: "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
  },
} as const;

const { rpcUrl, apiOrigin, programId, txlTokenMint } = CONFIG[NETWORK];
const apiBaseUrl = `${apiOrigin}/api`;
// ────────────────────────────────────────────────────────────────────────

async function main() {
  const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("✖ SOLANA_PRIVATE_KEY env var is required (base58).");
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  const connection = new Connection(rpcUrl, "confirmed");
  console.log(`Network: ${NETWORK}`);
  console.log("Wallet: ", keypair.publicKey.toBase58());

  // Preflight: refuse to spend a guaranteed-fail transaction.
  const lamports = await connection.getBalance(keypair.publicKey);
  const sol = lamports / 1e9;
  console.log("Balance:", sol, "SOL");
  if (sol < MIN_SOL) {
    console.error(
      `✖ Need at least ${MIN_SOL} ${NETWORK} SOL to subscribe. Fund the wallet above and re-run.`,
    );
    process.exit(1);
  }

  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idlPath = `${__dirname}/txoracle.json`;
  const txoracleIdl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(txoracleIdl, provider);

  // PDAs + token accounts
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlTokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    programId,
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    txlTokenMint,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Step 1: on-chain subscribe
  console.log("Submitting on-chain subscription (SL", SERVICE_LEVEL_ID, ",", DURATION_WEEKS, "weeks)…");
  const txSig = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("Subscription tx:", txSig);

  // Step 2: guest JWT
  const authResponse = await axios.post(`${apiOrigin}/auth/guest/start`);
  const jwt = authResponse.data.token;

  // Step 3: sign "{txSig}:{leagues}:{jwt}"
  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  // Step 4: activate
  const activationResponse = await axios.post(
    `${apiBaseUrl}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  const apiToken = activationResponse.data.token || activationResponse.data;

  console.log("\n✅ TXLINE_API_KEY =", apiToken);
  console.log("\nAdd these to .dev.vars:");
  console.log(`TXLINE_API_URL=${apiOrigin}`);
  console.log(`TXLINE_API_KEY=${apiToken}`);
}

main().catch((err) => {
  console.error("\n✖ Activation failed:", err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});
