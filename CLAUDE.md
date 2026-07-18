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
7. Persist tick (`store.ts` → Neon PostgreSQL)

**Agent policy is code, not env**: tuning knobs (trade size, min edge, maker margin, take-profit/stop-loss) live in `AGENT_POLICY` in `src/agent/config.ts`. Do not move them to env vars. Env (`src/types.ts` `Env`) holds only credentials/endpoints.

**State store**: Neon PostgreSQL via `@neondatabase/serverless` (`src/db/client.ts`, `DATABASE_URL` secret) holds agent state — ticks, positions, open books — and email/password users. Schema lives in `migrations/*.sql` and is applied to Neon manually (no wrangler migration step). `store.ts` is the API over it; consecutive identical idle HOLD ticks are deliberately not persisted. Earlier stores this replaced: KV (1,000 writes/day quota too small), then a GitHub JSON-blob store (`ghstore.ts`, now unused). The `SESSIONS`/`AGENT_STATE` KV namespaces remain bound for sessions/OAuth state.

**Integrations — the tricky parts**:
- **FossaPay** (user deposit wallets): when `FOSSAPAY_API_KEY` is set, `POST /account/wallet` creates a FossaPay Solana USDC wallet after `POST /account/profile` (KYC fields). Deposits credit the Neon fund ledger via `POST /webhooks/fossapay` (`deposit.completed`); local keypair + `sweep.ts` remain only for `provider='local'` wallets. Without the key, local custodial wallets still work.
- **TxLINE** (odds source): two-credential auth — an auto-refreshed guest JWT (`Authorization: Bearer`) plus the activated token in `X-Api-Token` (`TXLINE_API_KEY`, minted once per wallet via `scripts/txline-activation/`). Live payloads may use PascalCase field names despite camelCase docs; `txline.ts` normalizes both. Devnet serves per-fixture endpoints only (global snapshots 404), so the client sweeps fixtures from the fixtures feed.
- **Jupiter Predict** (execution venue, Solana mainnet, no KYC): `POST /orders` returns an unsigned base64 transaction that the agent signs with `SOLANA_PRIVATE_KEY` and submits. Markets are binary YES/NO; BACK buys the mapped side, LAY the opposite. TxLINE fixtures and Jupiter markets share no common ID — `jupiter.ts` auto-discovers the market for a fixture by searching Jupiter with the TxLINE participant names (cached per matchId). The integration flag is still named `betdex` in `config.ts` so frontend types stay unchanged.
- **Kamino** (yield): klend-sdk v9.1.5 runs on `@solana/kit` (web3.js v2) while the rest of the repo uses web3.js v1 — `kamino.ts` bridges this by building instructions with a kit `Rpc` + noop signer, then mapping them to v1 `TransactionInstruction`s signed by the agent keypair. Keep `@solana/kit` on the ^2.x line klend-sdk's peers expect (a ^7 pin previously broke typecheck and peer resolution). klend-sdk also imports `@solana-program/compute-budget`/`memo` without declaring them — they're direct deps here for that reason. Amounts are raw base units (USDC × 1_000_000); all addresses must be network-coherent (mainnet market + mainnet RPC + mainnet USDC mint).

**Auth** (`src/auth/`): Google OAuth → one-time exchange code → stateless HMAC-signed session token (the token itself is the session ID) delivered as both bearer token and cookie. `SESSION_SECRET` signs it.

**Frontend** (`web/`): Astro 7 + React 18 + HeroUI + Tailwind 3. Pages: `index.astro` (landing), `dashboard.astro`, `login`. `web/src/lib/agent.ts` and `auth.ts` talk to the worker at `PUBLIC_AGENT_URL`.
