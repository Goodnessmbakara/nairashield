# Retegol — Superteam Earn Submission (paste-ready)

**Track:** Trading Tools and Agents (primary) · Prediction Markets and Settlement (secondary)

## Links
- **Live app:** https://retegol.pages.dev
- **Agent API:** https://retegol-bot.zanbuilds.workers.dev (`/health`)
- **Public repo:** https://github.com/Goodnessmbakara/nairashield
- **Demo video:** _add Loom/YouTube link after recording_

## One-liner
An autonomous agent that never lets betting capital sit idle: USDC earns
Kamino yield by default and is deployed into live-odds opportunities on
Jupiter Predict only when an LLM-evaluated net-return model (Y_net) beats
the yield being given up — fully autonomous on Cloudflare Workers cron.

## Core idea (technical)
Every minute: fetch live TxLINE consensus odds → flag sharp movement
(>3% between consecutive snapshots) → mark open positions to market
(take-profit +8 prob pts / stop-loss −6, real position closes) → settle
finished books and sweep proceeds back to yield → Llama-3 (Workers AI)
decides TRADE/HOLD via Y_net = C·margin − C·yieldApy·(T/year), guardrailed
by deterministic math → execution signed by the agent's own keypair.
Absolute no-mocks rule: any missing credential or empty feed produces an
honest HOLD with the reason on the dashboard — nothing is ever fabricated.

## TxLINE

Endpoints, auth, and feedback: **[docs/TXLINE.md](docs/TXLINE.md)** (fixtures / per-fixture odds / scores; guest JWT + `X-Api-Token`).
