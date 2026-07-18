# NairaShield — Project Handoff

---

## ✅ Live Status (July 17 session)

**The agent is live and making honest decisions on real data.** What was done:

- **TxLINE ACTIVATED** — real on-chain `subscribe(1, 4)` on devnet
  (tx `5oDTMvhajuAaMiUJ2o19BDwv3UhPnrE1tkGhYAWdvHb9WKUTcDFzdxtgFkaYMJdru7rcCEquPrmWySsT5WVsQZqo`),
  paid entirely with pre-existing free devnet SOL. On-chain pricing matrix
  shows devnet SL1 = **price 0 AND sampling 0 (free + real-time)**. Key is
  wired in `.dev.vars`; the worker authenticates and reads the live
  fixtures/odds feed.
- **Execution venue = Jupiter Predict** (Solana mainnet, no KYC). BetDEX was
  dropped (identity verification wall); Monaco Protocol was evaluated and
  rejected (on-chain program dormant ~6 months — orders would never match).
  `src/integrations/jupiter.ts` builds orders via `POST /orders`, signs the
  returned transaction with the agent keypair, submits to mainnet.
- **JUPITER_MARKET_MAP is live** for both remaining World Cup matches:
  TxLINE fixture `18257865` (France–England, Jul 18) and `18257739`
  (Spain–Argentina final, Jul 19) → 6 verified-open Jupiter markets.
- **Sharp Movement Detector** (`src/agent/movement.ts`) — flags >3% odds
  shifts between consecutive real snapshots; surfaces on the dashboard.
- **No-live-odds handling** — devnet TxLINE serves per-fixture endpoints
  only (global snapshots 404). The client sweeps per-fixture odds from the
  real fixtures feed; a healthy-but-empty feed becomes an honest HOLD
  naming the next real fixture, not an Error.
- **LLM dry-run projection** — with no capital deployed, the real brain
  still runs on the real odds and the tick reports what it *would* do
  (typed `source:"projection"`, never persistable as a real balance).
- Verified end-to-end: cron tick →
  `HOLD — No live odds right now… Next fixture: <real fixture> — capital stays in yield.`

**Still open:** public deploy (wrangler + Pages), demo video (record during
a live match window: Jul 18 France–England or Jul 19 final), optional USDC
funding for live Kamino/Jupiter execution.

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
        ├── txline.ts      — TxLINE odds client (ACTIVATED — live devnet feed)
        ├── kamino.ts      — Kamino Finance yield routing (klend-sdk v9.1.5, kit RPC)
        └── jupiter.ts     — Jupiter Predict order execution (mainnet, no KYC)
      src/agent/movement.ts — Sharp Movement Detector (odds shifts between ticks)

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
| `RPC_URL` | Solana RPC for Kamino/Jupiter (mainnet). Public `api.*.solana.com` **blocks Cloudflare** (403) — use Helius/QuickNode | `https://mainnet.helius-rpc.com/?api-key=…` |
| `TXLINE_RPC_URL` | RPC for on-chain fixture verify; must match TxLINE cluster (devnet when on `txline-dev`) | `https://devnet.helius-rpc.com/?api-key=…` |
| `TXLINE_API_URL` | TxLINE API origin (no `/api` suffix) — **SET: devnet** | `https://txline-dev.txodds.com` |
| `TXLINE_API_KEY` | **Activated token — SET** (devnet SL1, free) | `scripts/txline-activation/activate-devnet.ts` |
| `JUPITER_API_KEY` | Jupiter Predict portal key — **SET** (free, no KYC) | portal.jup.ag/api-keys |
| `JUPITER_MARKET_MAP` | TxLINE fixtureId → Jupiter market map — **SET** | built from live feeds (see staging json) |
| `KAMINO_MARKET_PUBKEY` | Kamino main market — **SET** | `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` |
| `USDC_MINT_PUBKEY` | Mainnet USDC — **SET** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `FOSSAPAY_API_KEY` | FossaPay secret key for managed Solana wallets | `dashboard.fossapay.com` → API Keys (`fp_test_sk_` / `fp_live_sk_`) |
| `FOSSAPAY_WEBHOOK_SECRET` | HMAC secret for `POST /webhooks/fossapay` | FossaPay dashboard webhooks |
| `FOSSAPAY_API_URL` | Optional API base override | default `https://api-production.fossapay.com/api/v1` |
| `RETEGOL_AGENT_KEY` | Bearer key for read-only SDK/MCP (`GET /v1/*`) | `openssl rand -hex 32` |
| `CRON_SECRET` | External cron: `GET /agent/run?key=…` | `openssl rand -hex 32` |

### Agent SDK / MCP (`@retegol/agent`)

Read-only npm package + stdio MCP for other agents (no trade/tick):

| Route | Auth |
|---|---|
| `GET /v1/status` | `Authorization: Bearer $RETEGOL_AGENT_KEY` or `X-Retegol-Key` |
| `GET /v1/fixtures` | same |
| `GET /v1/history?limit=` | same |
| `GET /v1/verify?fixtureId=` | same |

```bash
npx wrangler secret put RETEGOL_AGENT_KEY
cd packages/retegol-agent && npm run build && npm publish --access public
```

Cursor / Claude MCP config:

```json
{
  "mcpServers": {
    "retegol": {
      "command": "npx",
      "args": ["-y", "@retegol/agent"],
      "env": {
        "RETEGOL_URL": "https://retegol-bot.zanbuilds.workers.dev",
        "RETEGOL_AGENT_KEY": "…"
      }
    }
  }
}
```

Package source: [`packages/retegol-agent/`](packages/retegol-agent/).

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
**WIRED + EXECUTABLE.** The `klend-sdk` v9.1.5 API relies on the new `@solana/kit` (web3.js v2), while the rest of the project pins `@solana/web3.js` v1. This version mismatch has been resolved via a translation layer in `src/integrations/kamino.ts` that safely bridges the two versions.

It works by passing a v2 `NoopSigner` to the Kamino SDK to build the raw instructions, manually mapping them to v1 `TransactionInstruction` objects, and finally signing the overall transaction with the v1 `Keypair`. Deposit/withdraw fail **closed** on any issue (honest error, never a fabricated balance), but are fully executable on mainnet.

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

## 🪐 Jupiter Predict — Order Execution (replaces BetDEX)

### Status: WIRED + configured
`src/integrations/jupiter.ts`. No KYC — only a free portal API key
(portal.jup.ag/api-keys). Flow: `POST {api}/orders` (headers `x-api-key`)
→ returns an **unsigned base64 transaction** → agent signs with
`SOLANA_PRIVATE_KEY` → `sendRawTransaction` on mainnet. `orderId` stored as
`orderPubkey|positionPubkey`; settlement reads
`GET /orders/status/{orderPubkey}` + positions, and only reports PnL from
an explicitly resolved position (no fabricated fills).

Order model is binary YES/NO filled by Jupiter's keeper network — BACK a
team buys its mapped side, LAY buys the opposite. The mapping TxLINE
fixture → Jupiter market lives in `JUPITER_MARKET_MAP` (no shared id
exists between the two systems; see `scripts/jupiter-markets.staging.json`
for how it was built from both live APIs).

Why not BetDEX: self-serve API keys require Basic Verification (KYC) which
blocked the team. Why not Monaco on-chain: program dormant since Jan 2026
(verified via getSignaturesForAddress) — orders would never match.

---

## 🔄 Agent Loop

```
POST /agent/tick  OR  cron * * * * *
  │
  ├─ 1. fetchLatestOdds(config)         ← TxLINE (per-fixture sweep; empty feed
  │                                        → honest HOLD naming next fixture)
  ├─ 1b. detectOddsMovement()           ← >3% shifts vs previous snapshot
  ├─ 2. settleOpenBooks()               ← Jupiter resolved-position PnL only
  ├─ 3. getYieldPosition(env)           ← Kamino KV snapshot (HOLD if none;
  │                                        dry-run projection still runs)
  ├─ 4. LLM brain (Llama 3)             ← Y_net decision
  ├─ 5. withdrawYield() + placeMakerOrder() ← Kamino + Jupiter, both agent-signed
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
npx wrangler secret put TXLINE_API_URL
npx wrangler secret put TXLINE_API_KEY
npx wrangler secret put JUPITER_API_KEY
npx wrangler secret put JUPITER_MARKET_MAP
npx wrangler secret put KAMINO_MARKET_PUBKEY
npx wrangler secret put USDC_MINT_PUBKEY
npx wrangler secret put RPC_URL
npx wrangler secret put TXLINE_RPC_URL   # required when TxLINE is on txline-dev (devnet Helius)
npx wrangler secret put RETEGOL_AGENT_KEY  # SDK / MCP read-only API
npx wrangler secret put FOSSAPAY_API_KEY
npx wrangler secret put FOSSAPAY_WEBHOOK_SECRET

# Deploy worker
npx wrangler deploy

# Point FossaPay dashboard webhook to:
#   https://retegol-bot.zanbuilds.workers.dev/webhooks/fossapay
# (events: deposit.completed at minimum)

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
