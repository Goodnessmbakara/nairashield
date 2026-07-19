# Retegol — Demo Script (≤5 min)

**Goal:** One working loop. TxLINE → decide → show it. No feature tour.

**URLs (pre-open):**
- App: https://retegol.vercel.app (signed in)
- API: https://retegol-bot.zanbuilds.workers.dev/health
- Repo: https://github.com/Goodnessmbakara/nairashield

**Best time:** During/near Spain vs Argentina kickoff (or any World Cup fixture with odds on TxLINE).

---

### 0:00–0:40 — Problem
Capital sits idle between plays. Retegol keeps USDC in **Kamino yield** and only leaves yield when live **TxLINE** odds say the edge beats that yield (Y_net).

### 0:40–1:20 — Autonomy
Cloudflare Worker cron every minute. Same loop as **Run check** on the dashboard. No human in the loop after deploy.

### 1:20–3:00 — Live product (core)
1. **Watching** — fixtures from `GET /api/fixtures/snapshot` (World Cup).
2. **Run check** — pulls `GET /api/odds/snapshot/{fixtureId}`.
3. **Agent activity** — real HOLD or TRADE reason (never fake fills).
4. **Odds / movement** — consensus prices; flag >3% shifts between ticks.
5. **Health** — `txline`, `jupiter`, `kamino`, `wallet` integrations green.

If unfunded: agent still **decides on live odds** (dry-run path) — say so once, then show the decision, not a funding lecture.

If TRADE: open Solscan for withdraw/order txs.

### 3:00–4:00 — Safety
- Safe abort if Kamino withdraw or Jupiter order fails (capital stays/returns to yield).
- Empty odds interval → honest HOLD, not a fake market.

### 4:00–5:00 — Close
“One agent, one loop: TxLINE data, Y_net policy in code, autonomous cron, fail closed. Production-shaped Worker + dashboard. Repo public.”

---

### Do not demo (unless asked)
Portfolio deposit flows, FossaPay, half-built admin, endless replay tuning.

### If odds are empty right now
Show fixtures list + HOLD: “no match in play / next fixture…” — that *is* correct autonomous behavior.
