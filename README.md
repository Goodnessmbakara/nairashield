# Retegol

Autonomous AI sports market-making agent on Solana. USDC earns Kamino yield by default; the agent places Jupiter Predict maker orders only when TxLINE odds clear the yield bar.

| | |
|---|---|
| **App** | https://retegol.pages.dev |
| **Agent API** | https://retegol-bot.zanbuilds.workers.dev |
| **Health** | https://retegol-bot.zanbuilds.workers.dev/health |

Built for the **TxODDS Superteam Earn Hackathon** (Trading Tools and Agents).

> Repo path may still say `nairashield`. Product / Worker / Pages are **Retegol** (`retegol-bot`, `retegol`).

## How it works

1. **Deposit** — USDC to a personal address (FossaPay or local custodial) → Neon fund ledger  
2. **Yield** — Idle capital in Kamino  
3. **Decide** — Workers AI (Llama 3) on TxLINE odds vs yield opportunity cost  
4. **Execute** — Withdraw Kamino → Jupiter Predict maker order  
5. **Settle** — Resolve books → redeposit to Kamino  
6. **Withdraw** — User request → admin on-chain payout  

## Tech stack

Cloudflare Workers + Workers AI · Neon · Kamino · Jupiter Predict · TxLINE · Solana · Astro/React (Pages) · GitHub Actions

## TxLINE

Retegol polls TxLINE fixtures, per-fixture odds, and scores each tick (guest JWT + activated API token). Full endpoint list, auth model, and hackathon feedback: **[docs/TXLINE.md](docs/TXLINE.md)**.

## Local setup

```bash
pnpm install && cd web && pnpm install && cd ..
cp .dev.vars.example .dev.vars   # fill secrets
echo 'PUBLIC_AGENT_URL=http://127.0.0.1:8787' > web/.env

pnpm dev                         # API → :8787
cd web && pnpm dev               # UI  → :4321
```

Apply SQL in `migrations/` to Neon manually. Ops detail: [HANDOFF.md](HANDOFF.md). Submission paste: [SUBMISSION.md](SUBMISSION.md).

## Deploy

Push to `main` → Actions deploys Worker `retegol-bot` then Pages `retegol`.  
Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` + `wrangler secret put …` (see `.dev.vars.example`).  
OAuth callback: `https://retegol-bot.zanbuilds.workers.dev/auth/google/callback`

## Disclaimer

Hackathon demo only — not financial advice, not an endorsement of gambling. You are responsible for compliance in your jurisdiction.
