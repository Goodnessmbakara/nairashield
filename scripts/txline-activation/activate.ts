/**
 * TxLINE (TxODDS) API-token activation — one-time, one wallet, mainnet.
 *
 * Faithful port of the reference flow in _txodds_ref/users.ts:
 *   1. Create the wallet's Token-2022 ATA for the TxL mint in a SEPARATE tx
 *      if it does not already exist (must exist BEFORE subscribe).
 *   2. On-chain `subscribe(service_level_id, weeks)` to the txoracle program.
 *   3. Acquire a guest JWT from POST https://txline.txodds.com/auth/guest/start.
 *   4. Sign the message `${txSig}:${leagues.join(",")}:${jwt}` with the wallet
 *      key (ed25519 detached, base64).
 *   5. POST https://txline.txodds.com/api/token/activate → returns the API token.
 *
 * service_level_id is the FREE REAL-TIME tier discovered on-chain from the
 * pricing_matrix PDA: row 12 (pricePerWeekToken=0, samplingIntervalSec=0).
 * Row 1 is also free but samplingIntervalSec=60 (delayed), so it is NOT
 * real-time. See discover-pricing.ts for the evidence.
 *
 * This still costs a small amount of real SOL: the subscribe tx fee plus, on
 * the first run, the Token-2022 ATA rent (~0.002 SOL). No TxL tokens are spent
 * because the free tier's pricePerWeekToken is 0.
 *
 * Run (only once the wallet is funded):
 *   SOLANA_PRIVATE_KEY=<base58> npx tsx scripts/txline-activation/activate.ts
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "fs";

// ── CONFIG (mainnet) ──────────────────────────────────────────────────────
const RPC_URL = "https://api.mainnet-beta.solana.com";
const API_ORIGIN = "https://txline.txodds.com";
const API_BASE_URL = `${API_ORIGIN}/api`;
const JWT_URL = `${API_ORIGIN}/auth/guest/start`;

const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const TXL_TOKEN_MINT = new PublicKey(
  "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
);

// Free REAL-TIME service level discovered on-chain (row 12: 0 tokens/week,
// samplingIntervalSec=0). Row 1 is free but 60s-delayed.
const SERVICE_LEVEL_ID = 12; // u16
const DURATION_WEEKS = 4; // u8 — must be a multiple of 4 and >= 4
const SELECTED_LEAGUES: number[] = []; // empty = standard bundle

// Refuse to broadcast a guaranteed-fail tx: require a minimum SOL balance.
const MIN_SOL = 0.02;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("SOLANA_PRIVATE_KEY env var is required (base58).");
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  const connection = new Connection(RPC_URL, "confirmed");
  console.log("Network: mainnet");
  console.log("Wallet :", keypair.publicKey.toBase58());

  // ── Preflight: never broadcast a tx we know will fail for lack of SOL ──
  const lamports = await connection.getBalance(keypair.publicKey);
  const sol = lamports / 1e9;
  console.log("Balance:", sol, "SOL");
  if (sol < MIN_SOL) {
    console.error(
      `Need at least ${MIN_SOL} mainnet SOL to activate. Fund the wallet above and re-run.`,
    );
    process.exit(1);
  }

  if (DURATION_WEEKS < 4 || DURATION_WEEKS % 4 !== 0) {
    throw new Error(
      `Invalid subscription duration: ${DURATION_WEEKS} weeks. Must be a multiple of 4 and >= 4.`,
    );
  }

  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = `${__dirname}/txoracle.json`;
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl as anchor.Idl, provider);

  // ── PDAs + token accounts ──
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const userTokenAccountAddress = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // ── Step 1: create the user's Token-2022 ATA if missing (separate tx) ──
  const accountInfo = await connection.getAccountInfo(userTokenAccountAddress);
  if (!accountInfo) {
    console.log("Creating user Token-2022 associated token account…");
    const createTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        userTokenAccountAddress,
        keypair.publicKey,
        TXL_TOKEN_MINT,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await sendAndConfirmTransaction(connection, createTx, [keypair], {
      commitment: "confirmed",
    });
    console.log("ATA created.");
    await delay(3000);
  } else {
    console.log("User Token-2022 ATA already exists.");
  }

  // Confirm the ATA is visible to the RPC before subscribing (retry on lag).
  let userTokenAccount;
  let attempts = 0;
  while (attempts < 5) {
    try {
      userTokenAccount = await getAccount(
        connection,
        userTokenAccountAddress,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      break;
    } catch (err: any) {
      if (err?.name === "TokenAccountNotFoundError") {
        attempts++;
        console.log(`RPC not synced. Retrying (${attempts}/5)…`);
        await delay(2000);
      } else {
        throw err;
      }
    }
  }
  if (!userTokenAccount) {
    throw new Error("RPC failed to sync the new token account.");
  }

  // ── Step 2: on-chain subscribe ──
  console.log(
    `Subscribing on-chain: service level ${SERVICE_LEVEL_ID}, ${DURATION_WEEKS} weeks…`,
  );
  const tx: Transaction = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TXL_TOKEN_MINT,
      userTokenAccount: userTokenAccount.address,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);

  const txSig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    {
      signature: txSig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );
  console.log("Subscription tx confirmed:", txSig);

  // ── Step 3: guest JWT ──
  console.log("Acquiring guest JWT…");
  const authResponse = await axios.post(JWT_URL);
  const jwt: string = authResponse.data.token;

  // ── Step 4: sign `${txSig}:${leagues.join(",")}:${jwt}` ──
  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  // ── Step 5: activate ──
  console.log("Activating API token…");
  const activationResponse = await axios.post(
    `${API_BASE_URL}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  const apiToken: string =
    activationResponse.data.token || activationResponse.data;

  // ── Success: print exactly the two env lines the caller consumes ──
  console.log(`TXLINE_API_URL=${API_ORIGIN}`);
  console.log(`TXLINE_API_KEY=${apiToken}`);
}

main().catch((err) => {
  console.error(
    "Activation failed:",
    err?.response?.data ?? err?.message ?? err,
  );
  process.exit(1);
});
