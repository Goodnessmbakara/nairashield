# Retegol — Superteam Earn Submission (paste-ready)

**Track:** Trading Tools and Agents (primary)

## Links
- **Live app:** https://retegol.vercel.app
- **Agent API:** https://retegol-bot.zanbuilds.workers.dev (`GET /health`)
- **Public repo:** https://github.com/Goodnessmbakara/nairashield
- **Demo video:** _add Loom/YouTube link after recording_

## One-liner
Autonomous market-making agent on Solana: USDC earns Kamino yield by default; a Cloudflare Worker cron reads live TxLINE World Cup odds every minute and only deploys capital to Jupiter Predict when Y_net (spread capture minus yield opportunity cost) clears a hard edge floor.

## Core idea (what judges should see working)
1. **TxLINE in** — fixtures + per-fixture odds snapshots (guest JWT + activated `X-Api-Token`)
2. **Sharp movement** — >3% odds shift between consecutive real snapshots
3. **Decision** — Workers AI Llama 3 + deterministic Y_net guardrails (`src/agent/math.ts`)
4. **Execution path** — Kamino withdraw → Jupiter Predict maker (safe abort if either step fails)
5. **Autonomy** — `* * * * *` cron + optional `GET /agent/run?key=`
6. **Honesty** — no fabricated odds, balances, or fills; empty feed → HOLD with reason

## TxLINE endpoints used
| Method | Path | Use |
|--------|------|-----|
| `POST` | `/auth/guest/start` | Guest JWT |
| `POST` | `/api/token/activate` | One-time activation (script in repo) |
| `GET` | `/api/fixtures/snapshot` | Watching / discovery (World Cup CompId 72) |
| `GET` | `/api/odds/snapshot/{fixtureId}` | Live consensus odds per match |
| `GET` | `/api/odds/updates/{fixtureId}` | Historical odds for replays |
| `GET` | `/api/scores/snapshot/{fixtureId}` | Settlement scores |
| `GET` | `/api/fixtures/validation?fixtureId=` | Merkle proof for on-chain verify |

Docs: [docs/TXLINE.md](docs/TXLINE.md)

## Feedback (TxLINE)
**Liked:** Normalized JSON; free World Cup tier; on-chain activation story; fast snapshots.  
**Friction:** Devnet global odds 404 (per-fixture only); PascalCase wire vs camelCase docs; empty intervals return `[]` which looks like breakage until handled as honest HOLD.

## Demo path (5 min)
1. Open https://retegol.vercel.app → sign in  
2. Dashboard: Watching panel = live TxLINE fixtures  
3. **Run check** → Agent activity shows HOLD/TRADE + odds + movement  
4. Optional: Replays → open fixture → TxLINE odds timeline  
5. Point at `/health` integrations all true  
6. Fail-closed: show HOLD reason when no in-play odds  

Full script: [DEMO_SCRIPT.md](DEMO_SCRIPT.md)
