# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NairaShield: an autonomous AI market-making agent for sports prediction markets on Solana, built for the TxODDS Superteam Earn hackathon. A Cloudflare Worker (`src/`) runs the agent loop; an Astro dashboard (`web/`) is a separate sub-project with its own package.json and its own `CLAUDE.md` (use `astro dev --background` there).

`HANDOFF.md` is the detailed operational reference (TxLINE activation flow, Kamino caveats, Jupiter market mapping, deploy steps). The README predates the BetDEX→Jupiter switch in places; when they disagree, trust HANDOFF.md and the code.

## Commands

```bash
# Worker (repo root) — runs at http://127.0.0.1:8787
npm run dev            # wrangler dev --local
npm run dev:remote     # wrangler dev against real Cloudflare
npm run typecheck      # tsc --noEmit — the only check; there are no tests or lint
npm run deploy         # wrangler deploy

# Dashboard (web/) — runs at http://127.0.0.1:4321
cd web && npm run dev
cd web && npm run build
```

Secrets: copy `.dev.vars.example` → `.dev.vars` (worker root); `web/.env` needs `PUBLIC_AGENT_URL`. Production secrets go in via `wrangler secret put` (full list in HANDOFF.md). Non-secret config lives in `wrangler.toml`.

Trigger a tick manually: `POST /agent/tick` (needs a session) or `GET/POST /agent/run?key=$CRON_SECRET` (secret-gated external cron path). The cron trigger `* * * * *` runs the same loop autonomously.

## Core rule: no mocks, no fakes

The agent never fabricates odds, vault balances, order IDs, or fills. Missing credentials or an empty odds feed produce an honest `HOLD` with a specific reason (e.g. naming the next real fixture) — never invented data, never a demo mode. With no capital deployed the brain still runs on real odds and reports a typed `source:"projection"` dry-run, which must never be persisted as a real balance. Preserve this property in any change.

## Architecture

**Agent tick pipeline** (`src/agent/pipeline.ts`, entered from `src/index.ts` fetch/scheduled handlers via `src/http/router.ts`):

1. Settle due books (`settlement.ts`) — PnL only from explicitly resolved Jupiter positions
2. Fetch real TxLINE consensus odds (`integrations/txline.ts`)
3. Detect sharp odds movement >3% between snapshots (`movement.ts`)
4. Load Kamino yield position (`integrations/kamino.ts`)
5. LLM decision — Workers AI Llama 3 (`src/ai/brain.ts`) with Y_net guardrails (`math.ts`, `risk.ts`)
6. Execute: withdraw Kamino → place Jupiter Predict maker order (`integrations/jupiter.ts`)
7. Persist tick (`store.ts` → `ghstore.ts`)

**Agent policy is code, not env**: tuning knobs (trade size, min edge, maker margin, take-profit/stop-loss) live in `AGENT_POLICY` in `src/agent/config.ts`. Do not move them to env vars. Env (`src/types.ts` `Env`) holds only credentials/endpoints.

**State store**: `ghstore.ts` persists all agent state (tick history, yield position, open books) as one JSON blob committed to a GitHub repo (`GH_STATE_REPO` + `GH_TOKEN`) — KV's 1,000 writes/day quota was too small. `store.ts` is the API over it; consecutive identical idle HOLD ticks are deliberately not persisted. The `SESSIONS`/`AGENT_STATE` KV namespaces remain bound but agent state goes through the GitHub store.

**Integrations — the tricky parts**:
- **TxLINE** (odds source): two-credential auth — an auto-refreshed guest JWT (`Authorization: Bearer`) plus the activated token in `X-Api-Token` (`TXLINE_API_KEY`, minted once per wallet via `scripts/txline-activation/`). Live payloads may use PascalCase field names despite camelCase docs; `txline.ts` normalizes both. Devnet serves per-fixture endpoints only (global snapshots 404), so the client sweeps fixtures from the fixtures feed.
- **Jupiter Predict** (execution venue, Solana mainnet, no KYC): `POST /orders` returns an unsigned base64 transaction that the agent signs with `SOLANA_PRIVATE_KEY` and submits. Markets are binary YES/NO; BACK buys the mapped side, LAY the opposite. TxLINE fixtures and Jupiter markets share no common ID — the curated `JUPITER_MARKET_MAP` env JSON bridges them (see `scripts/jupiter-markets.staging.json`). The integration flag is still named `betdex` in `config.ts` so frontend types stay unchanged.
- **Kamino** (yield): klend-sdk v9.1.5 expects `@solana/kit` (web3.js v2) objects while this repo pins web3.js v1 — deposit/withdraw currently fail closed (honest error) rather than execute. Amounts are raw base units (USDC × 1_000_000); V2 instructions are mapped to v1 `TransactionInstruction`s in `kamino.ts`. All addresses must be network-coherent (mainnet market + mainnet RPC + mainnet USDC mint).

**Auth** (`src/auth/`): Google OAuth → one-time exchange code → stateless HMAC-signed session token (the token itself is the session ID) delivered as both bearer token and cookie. `SESSION_SECRET` signs it.

**Frontend** (`web/`): Astro 7 + React 18 + HeroUI + Tailwind 3. Pages: `index.astro` (landing), `dashboard.astro`, `login`. `web/src/lib/agent.ts` and `auth.ts` talk to the worker at `PUBLIC_AGENT_URL`.
