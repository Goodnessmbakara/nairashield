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

## TxLINE endpoints used
- `POST /auth/guest/start` — guest JWT (auto-refreshed per call)
- `POST /api/token/activate` — one-time activation after the on-chain
  `subscribe` (service level 1, free tier, devnet — paid with devnet SOL)
- `GET /api/fixtures/snapshot` — fixture discovery + "Watching" panel
- `GET /api/odds/snapshot/{fixtureId}` — live odds (per-fixture)
- `GET /api/scores/snapshot/{fixtureId}` — settlement scores
Auth model: `Authorization: Bearer <guestJwt>` + `X-Api-Token: <activated>`.

## Feedback for TxODDS
**Liked:** single normalized JSON schema across competitions; the on-chain
activation flow is genuinely novel; free World Cup tier made hacking
frictionless; snapshots are fast.
**Friction:** devnet exposes only per-fixture odds/scores endpoints — the
global snapshots 404, which we discovered by probing; empty snapshots
outside the live interval return `[]`, which initially reads as breakage —
a `{"live":false,"next":...}` envelope would help; live payloads use
PascalCase keys while docs show camelCase (we normalize both); the OpenAPI
spec URL referenced by the docs page returns 500.
