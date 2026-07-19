# Retegol

Autonomous sports market-making agent on Solana for the **TxODDS Superteam Earn** hackathon (Trading Tools and Agents).

Idle USDC earns **Kamino** yield. Every minute a **Cloudflare Worker** reads live **TxLINE** World Cup odds, decides with Y_net (edge vs yield opportunity cost), and only then withdraws and places a **Jupiter Predict** maker order. No human in the loop after deploy. No fabricated odds, balances, or fills.

| | |
|---|---|
| **App** | https://retegol.vercel.app |
| **Agent API** | https://retegol-bot.zanbuilds.workers.dev |
| **Health** | https://retegol-bot.zanbuilds.workers.dev/health |
| **Repo** | https://github.com/Goodnessmbakara/nairashield |

## Core loop

1. **Cron** (`* * * * *`) or dashboard **Run check**
2. **TxLINE** — fixtures + per-fixture odds (guest JWT + activated API token)
3. **Sharp movement** — flag >3% odds shifts between real snapshots
4. **Decide** — Workers AI (Llama 3) + deterministic Y_net guardrails (`src/agent/math.ts`)
5. **Execute** — Kamino withdraw → Jupiter Predict (safe abort if either fails)
6. **Dashboard** — live fixtures, odds, agent activity (Astro + React on Vercel)

Policy knobs live in code: `src/agent/config.ts` → `AGENT_POLICY` (not env).

## TxLINE

| Method | Path | Use |
|--------|------|-----|
| `POST` | `/auth/guest/start` | Guest JWT |
| `GET` | `/api/fixtures/snapshot` | Watching / discovery (World Cup) |
| `GET` | `/api/odds/snapshot/{fixtureId}` | Live consensus odds |
| `GET` | `/api/odds/updates/{fixtureId}` | Odds history (replays) |
| `GET` | `/api/scores/snapshot/{fixtureId}` | Settlement scores |
| `GET` | `/api/fixtures/validation?fixtureId=` | On-chain verify proof |

Details + feedback: **[docs/TXLINE.md](docs/TXLINE.md)**.

## Stack

Cloudflare Workers + Workers AI · Neon · Kamino · Jupiter Predict · TxLINE · Solana · Astro/React (Vercel)

## Local setup

```bash
pnpm install && cd web && pnpm install && cd ..
cp .dev.vars.example .dev.vars   # fill secrets
echo 'PUBLIC_AGENT_URL=http://127.0.0.1:8787' > web/.env

pnpm dev                         # API → :8787
cd web && pnpm dev               # UI  → :4321
```

Apply SQL in `migrations/` to Neon manually.

## Deploy

- **Worker:** `npx wrangler deploy` (name `retegol-bot`)
- **Frontend:** `web/` → Vercel (`PUBLIC_AGENT_URL=https://retegol-bot.zanbuilds.workers.dev`)
- **Secrets:** `wrangler secret put …` (see `.dev.vars.example`)
- **OAuth callback:** `https://retegol-bot.zanbuilds.workers.dev/auth/google/callback`
- **CORS / return_to:** `FRONTEND_URL` in `wrangler.toml` (includes `https://retegol.vercel.app`)

## Docs

| Doc | What |
|-----|------|
| [SUBMISSION.md](SUBMISSION.md) | Earn paste-ready fields |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | ≤5 min demo path |
| [docs/TXLINE.md](docs/TXLINE.md) | TxLINE integration |
| [HANDOFF.md](HANDOFF.md) | Ops / secrets |

## Disclaimer

Hackathon demo only — not financial advice, not an endorsement of gambling. You are responsible for compliance in your jurisdiction.
