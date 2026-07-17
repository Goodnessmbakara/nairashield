# NairaShield — Project Handoff

---

## ⚠️ Core Rule: No Mocks, No Fakes

The agent **never** fabricates odds, vault balances, order IDs, or settlement PnL.
Missing keys → honest `HOLD` / `Error`. No `AGENT_DEMO_MODE`, no virtual USDC, no fake fills.

---

## 📐 Architecture Summary

```
Cloudflare Worker (src/)
  ├── POST /agent/tick     — manual trigger
  ├── Cron * * * * *       — autonomous loop
  ├── GET/POST /auth/**    — Google OAuth + session
  └── src/integrations/
        ├── txline.ts      — TxLINE odds client (confirmed live API)
        ├── kamino.ts      — Kamino Finance yield routing (klend-sdk v9.1.5)
        └── betdex.ts      — BetDEX maker order execution

Astro Frontend (web/)
  └── Dashboard + marketing landing page
```

---

## 🔑 Required Secrets (`.dev.vars` for local, Wrangler secrets for prod)

| Variable | Description | Where to get |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth app client ID | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth app secret | Google Cloud Console |
| `SESSION_SECRET` | HMAC secret ≥32 chars | `openssl rand -base64 32` |
| `SOLANA_PRIVATE_KEY` | Base58 wallet private key | `solana-keygen new` |
| `RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` or Helius/QuickNode |
| `TXLINE_API_URL` | TxLINE API origin (no `/api` suffix) | See table below |
| `TXLINE_API_KEY` | **Activated API token** from `/api/token/activate` | See activation flow below ↓ |
| `BETDEX_API_URL` | BetDEX REST base URL | `https://prod.api.btdx.io` |
| `BETDEX_API_KEY` | BetDEX API key | BetDEX dashboard |
| `KAMINO_MARKET_PUBKEY` | Kamino market address | See Kamino section below ↓ |
| `USDC_MINT_PUBKEY` | USDC mint (devnet default provided) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

---

## 🌐 TxLINE — Full Activation Flow

TxLINE uses a **two-credential auth system**. Every data request needs:
- `Authorization: Bearer {guestJwt}` — refreshed automatically by our code, no need to store
- `X-Api-Token: {activatedApiToken}` — **this is `TXLINE_API_KEY` in `.dev.vars`**

### Network Selection

| Network | API Origin | Program ID |
|---|---|---|
| **Mainnet** | `https://txline.txodds.com` | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |
| **Devnet** | `https://txline-dev.txodds.com` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |

Set `TXLINE_API_URL` to the **origin only** (no `/api` suffix). Code appends `/api/...` paths automatically.

### Free Tier (No TxL Purchase Needed)

The World Cup hackathon grants free access to **Service Level 12** (real-time) on mainnet through July 19 2026 23:59 UTC. No TxL token purchase required. You just need SOL for the on-chain transaction fee.

### Step-by-Step Activation Script

Run this **once per wallet** to get your `TXLINE_API_KEY`:

```bash
# Install dependencies first
pnpm add @coral-xyz/anchor @solana/spl-token axios tweetnacl bs58 --save-dev
```

Create `scripts/activate-txline.ts`:

```typescript
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
// Toggle between devnet and mainnet. For the hackathon, use mainnet SL12.
const NETWORK: "mainnet" | "devnet" = "mainnet";

// Service level:
//   1  = 60-second delayed World Cup (free)
//   12 = real-time World Cup (free during hackathon)
const SERVICE_LEVEL_ID = 12;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = []; // empty = standard bundle

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

// Load wallet from SOLANA_PRIVATE_KEY env var (base58 encoded)
const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY!;
const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
console.log("Wallet:", keypair.publicKey.toBase58());

const connection = new Connection(rpcUrl, "confirmed");
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  commitment: "confirmed",
});
anchor.setProvider(provider);

// Load IDL — download the correct one from TxLINE devnet examples repo
// https://github.com/txodds/txline-devnet-examples
const txoracleIdl = JSON.parse(fs.readFileSync("./scripts/txoracle.json", "utf-8"));
const program = new anchor.Program(txoracleIdl, provider);

// Derive PDAs
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")],
  program.programId
);
const tokenTreasuryVault = getAssociatedTokenAddressSync(
  txlTokenMint, tokenTreasuryPda, true,
  TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
);
const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")],
  program.programId
);
const userTokenAccount = getAssociatedTokenAddressSync(
  txlTokenMint, keypair.publicKey, false,
  TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
);

// Step 1: Subscribe on-chain
console.log("Submitting on-chain subscription...");
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

// Step 2: Get guest JWT
const authResponse = await axios.post(`${apiOrigin}/auth/guest/start`);
const jwt = authResponse.data.token;

// Step 3: Sign activation message
// Message format: "{txSig}::{jwt}"  (two colons because SELECTED_LEAGUES=[])
const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
const message = new TextEncoder().encode(messageString);
const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
const walletSignature = Buffer.from(signatureBytes).toString("base64");

// Step 4: Activate API token
const activationResponse = await axios.post(
  `${apiBaseUrl}/token/activate`,
  { txSig, walletSignature, leagues: SELECTED_LEAGUES },
  { headers: { Authorization: `Bearer ${jwt}` } }
);

const apiToken = activationResponse.data.token || activationResponse.data;
console.log("\n✅ TXLINE_API_KEY =", apiToken);
console.log("\nAdd to .dev.vars:");
console.log(`TXLINE_API_URL=${apiOrigin}`);
console.log(`TXLINE_API_KEY=${apiToken}`);
```

Run it:
```bash
SOLANA_PRIVATE_KEY="<your-base58-key>" npx ts-node scripts/activate-txline.ts
```

Copy the output `TXLINE_API_KEY` into `.dev.vars`.

### TxLINE API Endpoints (Confirmed Live)

| Endpoint | Auth Required | Description |
|---|---|---|
| `POST /auth/guest/start` | None | Get guest JWT (auto-refreshed by our code) |
| `POST /api/token/activate` | Guest JWT | Activate API token after on-chain subscribe |
| `GET /api/odds/snapshot` | JWT + X-Api-Token | Global odds snapshot |
| `GET /api/odds/snapshot/{fixtureId}` | JWT + X-Api-Token | Single fixture odds |
| `GET /api/scores/snapshot` | JWT + X-Api-Token | Global scores |
| `GET /api/scores/snapshot/{fixtureId}` | JWT + X-Api-Token | Single fixture scores |
| `GET /api/fixtures/snapshot` | JWT + X-Api-Token | Fixture metadata |
| `SSE /api/odds/stream` | JWT + X-Api-Token | Streaming odds (Server-Sent Events) |
| `SSE /api/scores/stream` | JWT + X-Api-Token | Streaming scores |

> **Note on wire format:** TxLINE responses may use PascalCase field names in live payloads (`FixtureId`, `Status`, `Odds`) despite docs showing camelCase. Our `txline.ts` normalises both.

---

## 💰 Kamino Finance — Yield Integration

### Status
The `klend-sdk` v9.1.5 API is wired (correct method shapes, V2→V1 instruction
mapping, `getReservesByMint`). Deposit/withdraw fail **closed** (honest error, never
a fabricated balance) but are **not yet executable**: `klend-sdk` v9.1.5 depends on
`@solana/kit` (web3.js v2), while this project pins `@solana/web3.js` v1.
`KaminoMarket.load` needs a kit `Rpc` and `owner` needs a kit `TransactionSigner`;
passing a v1 `Connection`/`Keypair` throws at first call. Executing for real
requires wiring `createSolanaRpc(rpcUrl)` + a kit signer (in progress).

### Finding a Kamino Market Address

**Mainnet** — The primary Kamino main market (verified against klend-sdk + Kamino docs):
```
7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
```

**Devnet** — No stable public Kamino market exists, so the coherent path is
**mainnet-only** (market + RPC + USDC mint all mainnet). A mainnet market cannot be
used with a devnet RPC or the devnet USDC mint — mixing networks makes the market
load return null.

Set in `.dev.vars` (all mainnet, coherent):
```
RPC_URL=https://api.mainnet-beta.solana.com          # paid RPC recommended (public is rate-limited)
KAMINO_MARKET_PUBKEY=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
USDC_MINT_PUBKEY=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  # mainnet USDC (NOT devnet)
```
The wallet must already hold real USDC (deposit transfers from the owner's USDC ATA;
zero balance fails at simulation) plus some SOL for fees/ATA rent.

### Key SDK Behavior (klend-sdk v9.1.5)
- `KaminoAction.buildDepositTxns` / `buildWithdrawTxns` take a **single props object**
  (`useV2Ixs`, `scopeRefreshConfig`, `currentSlot` are required) and return V2 `Instruction`s
- We map V2 `Instruction` → v1 `TransactionInstruction` (role decode: signer = role 2|3, writable = role 1|3)
- `getReservesByMint(address)` returns an array — we take `[0]`
- Amount is in **raw base units** — `amountUsdc * 1_000_000` for USDC (6 decimals)
- `KaminoMarket.load(rpc, …)` / `owner` require **`@solana/kit` (web3.js v2)** objects, not v1

---

## 🎲 BetDEX — Maker Order Execution

### Status
Wired in `src/integrations/betdex.ts`. Needs `BETDEX_API_KEY`.

```
BETDEX_API_URL=https://prod.api.btdx.io
BETDEX_API_KEY=<your-key>
```

Contact BetDEX for API credentials. The order schema in `betdex.ts` uses their v1 REST API. Exact field names may need adjustment once you have live credentials — check their docs at https://docs.btdx.io.

---

## 🔄 Agent Loop

```
POST /agent/tick  OR  cron * * * * *
  │
  ├─ 1. fetchLatestOdds(config)         ← TxLINE (throws if not configured)
  ├─ 2. settleOpenBooks()               ← BetDEX confirmed PnL only
  ├─ 3. getYieldPosition(env)           ← Kamino KV snapshot (HOLD if none)
  ├─ 4. LLM brain (Llama 3)             ← Y_net decision
  ├─ 5. withdrawYield() + placeOrder()  ← real on-chain + real REST
  └─ 6. persistTick()                   ← KV history
```

No step fabricates data. If any required credential is missing, the agent returns `HOLD` with a clear error message.

---

## 🚀 Running Locally

```bash
# Terminal 1 — Cloudflare Worker (agent + auth API)
pnpm run dev

# Terminal 2 — Astro dashboard
cd web && pnpm run dev
```

Agent runs at `http://127.0.0.1:8787`  
Dashboard runs at `http://127.0.0.1:4321`

Trigger a manual tick:
```bash
curl -X POST http://127.0.0.1:8787/agent/tick \
  -H "Content-Type: application/json"
```

---

## 🚢 Deploy to Production

```bash
# Set secrets in Cloudflare (one-time)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SOLANA_PRIVATE_KEY
npx wrangler secret put TXLINE_API_KEY
npx wrangler secret put BETDEX_API_KEY
npx wrangler secret put KAMINO_MARKET_PUBKEY

# Deploy worker
npx wrangler deploy

# Create KV namespace (if not done)
npx wrangler kv namespace create SESSIONS
# Paste the resulting ID into wrangler.toml under [[kv_namespaces]]

# Deploy frontend (Cloudflare Pages or Vercel)
cd web && pnpm run build
# Upload dist/ to Cloudflare Pages or push to Vercel
```

---

## 🏆 Hackathon Submission Checklist

- [ ] **Demo video** (≤5 min, Loom/YouTube): Show TxLINE odds → LLM decision → Kamino withdraw → BetDEX order
- [ ] **Public GitHub repo**: Make repo public before July 19 23:59 UTC
- [ ] **Live URL**: Deploy worker + frontend (judge must be able to click a link)
- [ ] **Technical docs**: README covers TxLINE endpoints used + feedback section ✅
- [ ] **Legal disclaimer**: In README ✅ and web footer ✅

**Deadline: July 19, 2026 23:59 UTC**  
**Prizes: 1st $10k / 2nd $4k / 3rd $2k USDT**

---

## 🔧 Agent Policy

Edit `src/agent/config.ts` → `AGENT_POLICY` (**not** env vars):

| Field | Default | Description |
|---|---|---|
| `yieldApy` | 0.05 | Expected annual yield from Kamino |
| `tradeSizeUsdc` | 100 | Max USDC per BetDEX order |
| `minEdge` | 0.02 | Minimum edge (2%) before placing a maker quote |
| `makerMargin` | 0.015 | Spread margin added to fair odds |
| `eventHorizonHours` | 2 | Only trade events starting within this window |
| `maxOpenPositions` | 3 | Max concurrent open BetDEX positions |

---

## ⚖️ Compliance Notes

- Participants are responsible for complying with gambling/financial laws in their jurisdiction
- TxLINE and Superteam Earn do not endorse illegal betting
- This is an experimental hackathon submission for educational purposes
- By running NairaShield, you accept the [TxODDS Hackathon T&C](https://txline.txodds.com/documentation/legal/hackathon-terms)
