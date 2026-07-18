# Retegol

An autonomous AI-driven sports market-making agent on Solana. Users deposit USDC into a shared pool; the agent earns yield via Kamino Finance and places maker orders on Jupiter Predict using real-time odds from TxLINE.

| | |
|---|---|
| **App** | https://retegol.pages.dev |
| **Agent API** | https://retegol-bot.zanbuilds.workers.dev |
| **Health** | https://retegol-bot.zanbuilds.workers.dev/health |
| **Repo** | https://github.com/Goodnessmbakara/nairashield |

Built for the **TxODDS Superteam Earn Hackathon** (Trading Tools and Agents Track).

> The GitHub repo folder may still be named `nairashield`; the product, Cloudflare Worker (`retegol-bot`), and Pages project (`retegol`) are **Retegol**.

## How It Works

1. **Deposit** — Users send USDC to their personal deposit address (FossaPay when configured, otherwise local custodial). Credits land in the Neon fund ledger.
2. **Yield** — Idle pool USDC earns yield in Kamino Finance.
3. **Decision** — Cloudflare Workers AI (Llama 3) evaluates TxLINE consensus odds and decides whether the spread justifies leaving yield.
4. **Execution** — When edge > threshold: withdraw from Kamino → place maker order on Jupiter Predict → book open position.
5. **Settlement** — Confirmed positions are settled, proceeds redeposited into Kamino.
6. **Withdrawal** — Users request withdrawals; admins approve on-chain USDC transfers back to user wallets.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Edge compute | Cloudflare Workers (cron + HTTP) — `retegol-bot` |
| AI / LLM | Cloudflare Workers AI — Llama 3 |
| Database | Neon PostgreSQL (`@neondatabase/serverless`) |
| Yield | Kamino Finance (`@kamino-finance/klend-sdk`) |
| Execution | Jupiter Predict REST API |
| Sports data | TxLINE API |
| Deposits | FossaPay (optional) + local custodial wallets |
| Blockchain | Solana (`@solana/web3.js`, `@solana/spl-token`) |
| Frontend | Astro + React + Tailwind — Cloudflare Pages `retegol` |
| CI/CD | GitHub Actions → Cloudflare (auto-deploy on push to `main`) |

## TxLINE Integration Details

Retegol pulls consensus odds from TxLINE to determine fair market value. The agent supports polling the following TxLINE endpoints depending on the API environment and versioning:

- `/odds/stableprice`
- `/v1/odds/stableprice`
- `/odds/latest`
- `/v1/odds/latest`
- `/consensus/latest`

Auth model in production: guest JWT (`Authorization: Bearer`) + activated token (`X-Api-Token` / `TXLINE_API_KEY`).

### TxLINE Feedback

*Hackathon Requirement: "What was your team’s experience using the TxLINE API? (What did you like most, and where did you hit friction?)"*

**What we liked:** The unified, normalized JSON schema made standardizing our odds parsers incredibly easy. We didn't have to write different integrations for different matches. Frequent polling gave our LLM access to pricing action for sharp movement detection.

**Friction points:** Navigating endpoint deprecation across `v1` vs non-v1 API paths took trial and error (hence our fallback loop), and handling strict authorization headers (`x-api-key` vs `Bearer`) wasn't entirely clear in the initial Quickstart docs. Once connected, the data density was fantastic.

## Local Development

### Prerequisites

- Node.js 22+, pnpm 10+
- Cloudflare account + Wrangler CLI
- Google Cloud OAuth 2.0 Web client (redirect URI → worker `/auth/google/callback`)

### Setup

```bash
pnpm install
cd web && pnpm install && cd ..
```

Create `.dev.vars` in the repo root (see `.dev.vars.example`):

```env
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=<32+ random chars>
WORKER_URL=http://127.0.0.1:8787
FRONTEND_URL=http://127.0.0.1:4321

DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require&channel_binding=require

SOLANA_PRIVATE_KEY=<base58 keypair>
RPC_URL=https://api.mainnet-beta.solana.com

# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ACCOUNT_MASTER_KEY=<64 hex chars>
ADMIN_EMAILS=you@example.com

TXLINE_API_URL=https://txline.txodds.com
TXLINE_API_KEY=...
JUPITER_API_URL=https://api.jup.ag/prediction/v1
KAMINO_MARKET_PUBKEY=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
USDC_MINT_PUBKEY=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Optional — managed Solana USDC deposit wallets
# FOSSAPAY_API_KEY=fp_test_sk_...
# FOSSAPAY_WEBHOOK_SECRET=
# FOSSAPAY_API_URL=https://api-production.fossapay.com/api/v1
```

Create `web/.env`:

```env
PUBLIC_AGENT_URL=http://127.0.0.1:8787
```

For production builds, CI sets `PUBLIC_AGENT_URL=https://retegol-bot.zanbuilds.workers.dev`.

### Run

```bash
# Terminal 1 — Worker API (http://127.0.0.1:8787)
pnpm dev

# Terminal 2 — Dashboard (http://127.0.0.1:4321)
cd web && pnpm dev
```

### Database migrations

Apply SQL in `migrations/` to Neon manually (no Wrangler migration step):

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const url = fs.readFileSync('.dev.vars','utf8').split('\n').find(l=>l.startsWith('DATABASE_URL=')).replace('DATABASE_URL=','').trim();
const sql = neon(url);
(async () => {
  for (const f of ['0002_neon.sql','0003_fund_accounts.sql','0004_fossapay.sql']) {
    const stmts = fs.readFileSync('./migrations/'+f,'utf8').split(';').map(s=>s.trim()).filter(Boolean);
    for (const s of stmts) await sql.query(s);
    console.log(f+' done');
  }
})();
"
```

## API Routes

Base URL (production): `https://retegol-bot.zanbuilds.workers.dev`

### Public

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Service + agent health |

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/auth/google` | Start Google OAuth |
| `POST` | `/auth/register` | Email/password register |
| `POST` | `/auth/login` | Email/password login |
| `GET` | `/auth/me` | Current session user |
| `POST` | `/auth/logout` | Clear session |

### Agent

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/agent/status` | required | Pool status, open positions, last tick |
| `GET` | `/agent/history` | required | Tick history |
| `GET` | `/agent/fixtures` | required | Live TxLINE fixtures |
| `POST` | `/agent/tick` | required | Manually trigger one tick |
| `GET`/`POST` | `/agent/run?key=` | cron secret | External cron path |

### Account

| Method | Route | Description |
|--------|-------|-------------|
| `GET`/`POST` | `/account/profile` | KYC profile (required before FossaPay wallet) |
| `POST` | `/account/wallet` | Create deposit address |
| `GET` | `/account/wallet` | Current deposit wallet |
| `GET` | `/account/balance` | Share %, estimated value, locked USDC |
| `GET` | `/account/transactions` | Deposit/withdrawal history |
| `POST` | `/account/withdraw` | Request a withdrawal |
| `POST` | `/webhooks/fossapay` | FossaPay deposit webhooks |

### Admin (`ADMIN_EMAILS`)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/admin/withdrawals` | Pending withdrawal requests |
| `POST` | `/admin/withdrawals/:id/approve` | Approve + execute on-chain |
| `POST` | `/admin/withdrawals/:id/reject` | Reject + release funds |
| `GET` | `/admin/fund/balance` | Pool total, per-user shares |

## Deployment

CI (`.github/workflows/deploy.yml`) deploys on every push to `main`:

1. **Worker** → Cloudflare Worker `retegol-bot` (+ typecheck + `/health` smoke check)
2. **Dashboard** → Cloudflare Pages project `retegol` (`PUBLIC_AGENT_URL` → agent API)

### GitHub Secrets required

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Workers + Pages edit token |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### Wrangler secrets (set once on `retegol-bot`)

```bash
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put SESSION_SECRET
pnpm wrangler secret put DATABASE_URL
pnpm wrangler secret put SOLANA_PRIVATE_KEY
pnpm wrangler secret put ACCOUNT_MASTER_KEY
pnpm wrangler secret put ADMIN_EMAILS
pnpm wrangler secret put TXLINE_API_KEY
pnpm wrangler secret put KAMINO_MARKET_PUBKEY
pnpm wrangler secret put USDC_MINT_PUBKEY
# Optional
pnpm wrangler secret put FOSSAPAY_API_KEY
pnpm wrangler secret put FOSSAPAY_WEBHOOK_SECRET
pnpm wrangler secret put CRON_SECRET
```

Google OAuth redirect URI must be:

`https://retegol-bot.zanbuilds.workers.dev/auth/google/callback`

Non-secret URLs live in `wrangler.toml`:

- `WORKER_URL` = `https://retegol-bot.zanbuilds.workers.dev`
- `FRONTEND_URL` = `https://retegol.pages.dev`

## Legal & Compliance Disclaimer

**IMPORTANT: This project is an experimental hackathon submission for educational and demonstration purposes only.**

Retegol is a technical demonstration of algorithmic trading concepts and autonomous agents using Solana and the TxLINE API.

- It does **not** constitute financial advice, and it is **not** an endorsement of gambling or illegal betting.
- Users and developers deploying this software are solely responsible for ensuring their use complies with all applicable laws and regulations in their jurisdiction, including but not limited to gambling, gaming, financial, consumer protection, and securities laws.
- TxLINE, Superteam Earn, and the creators of this project do not endorse or authorize illegal betting, wagering, or any illicit financial activity.

By using or deploying this software, you assume all risks associated with automated trading and smart contract interactions.
