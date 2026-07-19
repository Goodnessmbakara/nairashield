# Retegol — Superteam Earn Submission (paste-ready)

**Track:** Trading Tools and Agents (primary)

## Links
- **Live app:** https://retegol.vercel.app
- **Agent API:** https://retegol-bot.zanbuilds.workers.dev (`GET /health`)
- **Public repo:** https://github.com/Goodnessmbakara/nairashield
- **Demo video:** _placeholder — no link yet. **RECORD DURING SPAIN–ARGENTINA / any live fixture** — production currently returns live TxLINE odds for Spain vs Argentina IN_PLAY with unfunded projection path. Do not invent a fake demo URL._

## One-liner
Retegol is the only World Cup trading agent that keeps USDC in Kamino by default and only leaves yield when Y_net on live TxLINE odds clears a hard floor before a Jupiter Predict maker order — fail-closed HOLD, no fabricated fills.

## Core idea (what judges should see working)
1. **TxLINE in** — fixtures + per-fixture odds snapshots (guest JWT + activated `X-Api-Token`)
2. **Sharp movement** — >3% odds shift between consecutive real snapshots
3. **Decision** — Workers AI Llama 3 + deterministic Y_net guardrails (`src/agent/math.ts`)
4. **Execution path** — Kamino withdraw → Jupiter Predict maker (safe abort if either step fails)
5. **Autonomy** — `* * * * *` cron + optional `GET /agent/run?key=`
6. **Honesty** — no fabricated odds, balances, or fills; empty feed → HOLD with reason

## TxLINE endpoints used
(Source of truth: `src/integrations/txline.ts`)

| Method | Path | Use |
|--------|------|-----|
| `POST` | `/auth/guest/start` | Guest JWT |
| `POST` | `/api/token/activate` | One-time activation (script in repo) |
| `GET` | `/api/fixtures/snapshot` | Watching / discovery (World Cup CompId 72) |
| `GET` | `/api/odds/snapshot` | Global odds snapshot (may 404 on devnet) |
| `GET` | `/api/odds/snapshot/{fixtureId}` | Live consensus odds per match |
| `GET` | `/api/odds/updates/{fixtureId}` | Historical odds for replays |
| `GET` | `/api/scores/snapshot/{fixtureId}` | Settlement scores |
| `GET` | `/api/fixtures/validation?fixtureId=` | Merkle proof for on-chain verify |

Wire notes: PascalCase payloads; empty `[]` intervals → honest HOLD; client sweeps per-fixture when global is empty/404.

Docs: [docs/TXLINE.md](docs/TXLINE.md)

## Feedback (TxLINE)
**Liked:** Normalized JSON; free World Cup tier; on-chain activation story; fast snapshots.  
**Friction:** Devnet global odds 404 (per-fixture only); PascalCase wire vs camelCase docs; empty intervals return `[]` which looks like breakage until handled as honest HOLD.

## Demo path
1. Open https://retegol.vercel.app → sign in  
2. Dashboard: Watching panel = live TxLINE fixtures  
3. Agent runs autonomously — decision + Live actions update without a human click  
4. Point at `/health` integrations  
5. Fail-closed: show HOLD reason when no in-play odds
