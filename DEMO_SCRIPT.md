# Retegol — Demo Script (≤5 min)

**Goal:** One working loop. TxLINE → decide → show it. No feature tour.

**URLs (pre-open):**
- App: https://retegol.vercel.app (signed in)
- API: https://retegol-bot.zanbuilds.workers.dev/health
- Repo: https://github.com/Goodnessmbakara/nairashield

**Best time:** During Spain vs Argentina (or any live World Cup fixture with odds on TxLINE). Production has returned live TxLINE odds for Spain vs Argentina IN_PLAY; capital is typically unfunded, so expect a **projection** TRADE/HOLD with real Y_net numbers — not a fake fill.

**UI labels (must match screen):** **Watching** · **Run check** · **Agent activity**

---

### 0:00–0:40 — Problem
Capital sits idle between plays. Retegol keeps USDC in **Kamino yield** and only leaves yield when live **TxLINE** odds say the edge beats that yield (**Y_net**). Execution venue is **Jupiter Predict** (not a sportsbook tour).

### 0:40–1:20 — Autonomy
Cloudflare Worker cron every minute. Same loop as **Run check** on the dashboard. No human in the loop after deploy.

### 1:20–3:00 — Live product (core)

Say what is on screen at each step.

1. **Watching** — fixtures from TxLINE `GET /api/fixtures/snapshot` (World Cup CompId 72). Point at Spain vs Argentina (or whatever is live / nearest).
2. **Run check** — one tick: Worker pulls `GET /api/odds/snapshot/{fixtureId}` (or per-fixture sweep).
3. **Agent activity** — real HOLD or TRADE reason with fixture, odds, and movement if present. Never claim a fill that did not happen.
4. **Odds / movement** — consensus prices; flag relative moves ≥3% between consecutive real snapshots.
5. **Self-verify (no click)** — every cron tick anchors the fixture on Solana (TxLINE proof → roots PDA → `validate_fixture`). TRADE cannot leave yield without `verification.ok`. Point at the VAR strip on the Agent card; open **Proofs** only to show the full receipt stack.
6. **Health** (optional) — `txline`, `jupiter`, `kamino`, `wallet` from `GET /health`.

#### Branch A — Live odds + unfunded capital (most likely demo path)
Agent still **decides on live odds**. Activity shows a typed **projection** (TRADE or HOLD) with **Y_net / minEdge** numbers. Say once: “Unfunded — this is a dry-run projection, not an on-chain fill.” Then stay on the decision card.

#### Branch B — Empty feed / no match in play
**Watching** may still list fixtures. **Agent activity** shows HOLD: “no live odds / no match in play / next fixture…” Capital stays in yield. That *is* correct autonomous behavior — do not invent a market.

#### Branch C — Funded + TRADE
If capital is live and the gate passes: show TRADE reason, then open **Solscan** for Kamino withdraw and/or Jupiter Predict order txs. Safe abort if either step fails (capital stays or returns to yield).

### 3:00–4:00 — Safety
- Safe abort if Kamino withdraw or Jupiter order fails.
- Empty odds interval (`[]`) → honest HOLD, not a fabricated market.
- Y_net floor is code policy (`AGENT_POLICY` in `src/agent/config.ts`); LLM narrative cannot bypass math.

### 4:00–5:00 — Close
“One agent, one loop: TxLINE data, Y_net policy in code, autonomous cron, fail closed. Production-shaped Worker + dashboard. Repo public.”

---

### Do not demo (unless asked)
- FossaPay / deposit rails
- Admin panel
- Portfolio deep dive or funding lecture
- Endless replay chart tuning
- Privy / multi-user roadmap

### Recording note
Record during a live fixture window when possible. If only the empty-feed HOLD is available, still record it — honesty beats a staged fake TRADE.
