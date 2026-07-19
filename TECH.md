# Retegol — technical overview

**Capital that never sits still.** Idle USDC earns Kamino yield; an autonomous
agent only leaves yield when live TxLINE odds clear a hard Y_net floor, then
executes on Jupiter Predict.

Track: **Trading Tools and Agents** (TxODDS World Cup hackathon).  
Network: **Solana mainnet** for Kamino/Jupiter when keys are set; TxLINE often
on **txline-dev** with matching verify RPC.  
Data: **TxLINE**.

---

## The thesis in one line

Every tick is **real data in → deterministic guardrails → optional AI narrative
→ safe execution or honest HOLD**. The agent never invents odds, vault balances,
order IDs, or fills. Empty feed or missing capital still runs the decision path
as a typed dry-run / projection where configured — never as a fake live balance.

That is what the dashboard is built to show: live fixtures, live odds when the
feed has them, movement between real snapshots, and fail-closed reasons.

---

## TxLINE endpoints used

Base origin (devnet example): `https://txline-dev.txodds.com`  
(mainnet: `https://txline.txodds.com`)

| Purpose | Method | Endpoint |
| --- | --- | --- |
| Guest session (JWT) | `POST` | `/auth/guest/start` |
| Activate → `X-Api-Token` | `POST` | `/api/token/activate` (see `scripts/txline-activation/`) |
| Fixtures snapshot | `GET` | `/api/fixtures/snapshot` |
| Per-fixture odds | `GET` | `/api/odds/snapshot/{fixtureId}` |
| Odds history (replays) | `GET` | `/api/odds/updates/{fixtureId}` |
| Scores snapshot | `GET` | `/api/scores/snapshot/{fixtureId}` |
| Merkle fixture validation | `GET` | `/api/fixtures/validation?fixtureId=` |

Auth on data calls: `Authorization: Bearer <guestJwt>` + `X-Api-Token: <activated token>`.

Wire note: live payloads often use **PascalCase** (`Prices`, `FixtureId`); the
client normalizes both cases and treats milliodds (e.g. `2390` → `2.390`).

### Where each endpoint shows up in the product

- **Watching panel** (`web/src/components/dashboard/WatchingPanel.tsx`) —
  `GET /agent/fixtures` → Worker → TxLINE fixtures snapshot (World Cup filter).
- **Agent tick** (`src/agent/pipeline.ts` + `src/integrations/txline.ts`) —
  odds snapshot per nearest fixture; sharp movement vs last stored tick.
- **On-chain verify** (`src/integrations/txline-verify.ts`) —
  fixtures validation proof + roots PDA / simulate path when RPC allows.
- **Replays** (`web/src/components/dashboard/ReplaysView.tsx`) —
  past fixtures + agent ticks + sampled `/api/odds/updates/{id}`.
- **Settlement scores** — `fetchScoreSnapshot` when closing books.

Full product notes: [docs/TXLINE.md](./docs/TXLINE.md).

---

## Agent policy (code, not env)

```ts
// src/agent/config.ts — AGENT_POLICY
yieldApy: 0.08
tradeSizeUsdc: 10
minEdge: 0.01
makerMargin: 0.02
eventHorizonHours: 2
maxOpenPositions: 3
movementThreshold: 0.03   // 3% relative odds change
takeProfitEdge: 0.08
stopLossEdge: 0.06
```

Env / secrets hold credentials only (`TXLINE_*`, `SOLANA_PRIVATE_KEY`, `RPC_URL`,
`DATABASE_URL`, OAuth, etc.) — see `.dev.vars.example`.

---

## Runtime architecture

| Piece | Role |
| --- | --- |
| Cloudflare Worker `retegol-bot` | Cron + HTTP: auth, agent tick, account, v1 API |
| Workers AI (Llama 3) | Decision narrative; math guardrails always apply |
| Neon PostgreSQL | Ticks, positions, fund ledger, users |
| Kamino | Idle yield (mainnet market + USDC when configured) |
| Jupiter Predict | Binary maker books |
| Astro + React (`web/`) | Dashboard + marketing on Vercel |

### Tick pipeline (`src/agent/pipeline.ts`)

1. Best-effort deposit sweep / queued withdrawals  
2. TxLINE odds (or honest HOLD if none usable)  
3. Sharp movement vs previous tick  
4. Optional on-chain fixture verify  
5. Settle due books + TP/SL risk exits  
6. Load yield position  
7. Decide (or dry-run projection if unfunded)  
8. Execute TRADE safely or HOLD  
9. Persist tick + `current_status` for the dashboard  

### Worker routes (high level)

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | public | Integrations + last status |
| `POST /agent/tick` | session | One decision cycle |
| `GET /agent/status` | session | Position, last tick, capital flags |
| `GET /agent/fixtures` | session | Watching list |
| `GET /agent/history` | session | Recent ticks |
| `GET /agent/replays` | session | Past matches + tick overlay |
| `GET /agent/replays/odds` | session | TxLINE odds history |
| `GET /agent/run?key=` | `CRON_SECRET` | External cron trigger |
| `GET /v1/*` | `RETEGOL_AGENT_KEY` | Read-only agent SDK |

---

## Frontend stack

Astro 7 · React 18 · HeroUI · Tailwind · framer-motion · Recharts.  
Deployed on **Vercel** with `PUBLIC_AGENT_URL` baked at build time.

Core demo surface: Overview → Watching + Run check + Agent activity + odds.

---

## What “done” means for this track

Judges need a **running** agent that ingests TxLINE and shows autonomous
decisions. Prefer a clean 3–5 minute demo of the loop over a tour of half-built
side features. See [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) and [SUBMISSION.md](./SUBMISSION.md).
