# Changes — NairaShield agent build

## Summary

Built the full autonomous agent stack on the Cloudflare Worker, aligned to the PRD and research (in-play market making + Kamino yield + BetDEX execution), with **no mock data**.

## What landed

### Agent core
- **Pipeline** (`src/agent/pipeline.ts`) — settle → market → yield → decide → execute → open book → persist
- **Y_net math** (`src/agent/math.ts`) — TxLINE fair value, maker quotes with margin, opportunity-cost model
- **Settlement** (`src/agent/settlement.ts`) — redeposit only when BetDEX confirms real settlement
- **Store** (`src/agent/store.ts`) — KV tick history, live yield snapshot, open books
- **Config** (`src/agent/config.ts`) — policy from env (`YIELD_APY`, `MIN_EDGE`, `MAKER_MARGIN`, etc.)

### Decision brain
- **Llama 3** via Workers AI + local guardrails (`src/ai/brain.ts`)
- Strategy is **market making**, not arbitrage against TxLINE
- Math overrides the model when edge is weak

### Integrations (real only)
- **TxLINE** — requires `TXLINE_API_URL` + `TXLINE_API_KEY`; throws if missing/empty
- **BetDEX** — requires `BETDEX_API_KEY`; no fake order IDs
- **Kamino** — no virtual vault; fails closed until klend deposit/withdraw is wired
- **Wallet** — requires `SOLANA_PRIVATE_KEY`; no ephemeral demo keypairs

### Auth + HTTP
- Google OAuth session flow (`src/auth/*`)
- Routes: `/agent/tick`, `/agent/status`, `/agent/history` + auth endpoints
- Cron `* * * * *` runs the full tick autonomously

### Web
- Astro dashboard + landing under `web/`
- Agent client talks to real worker only (auth required for ticks)

### Ops
- `wrangler.toml` — AI, SESSIONS + AGENT_STATE KV, policy vars
- `.dev.vars.example` — secrets template (no demo mode flag)
- `HANDOFF.md` — compliance checklist, no-mocks rule

## Explicitly removed / banned

| Removed | Why |
|---|---|
| `AGENT_DEMO_MODE` | User rule: no mocks |
| Fake TxLINE odds catalog | Fabricated markets |
| Virtual 1000 USDC Kamino seed | Fabricated capital |
| Demo BetDEX order IDs | Fabricated execution |
| Synthetic settlement PnL | Fabricated PnL |
| Ephemeral Solana keypairs | Fake wallet |

Missing credentials → honest **HOLD** / **Error** / **Aborted**, never invented numbers.

## Still open (live wiring, not mocks)

1. Kamino `klend-sdk` deposit/withdraw instruction builders
2. Exact BetDEX order schema once API token/docs are available
3. TxLINE endpoint path may need tweak when keys land
4. Real KV namespace IDs + secrets for production deploy

## How to run

```bash
cp .dev.vars.example .dev.vars   # fill Google + integration secrets
npm install && npm run dev       # worker :8787
cd web && npm install && npm run dev
```

## Verification

- `npx tsc --noEmit` — clean
- `npx wrangler deploy --dry-run` — bundle OK
