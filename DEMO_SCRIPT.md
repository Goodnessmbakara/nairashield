# NairaShield — 5-Minute Demo Script

**Record during a live match** (France–England Jul 18 21:00 UTC or the final
Jul 19 ~19:00 UTC) so real odds are on screen. Tabs pre-opened:
dashboard (edgeora.pages.dev, signed in), Solscan on the wallet, repo.

---

**0:00 – 0:35 — The problem.**
"Sports bettors hold stablecoins that sit idle between plays, losing value —
a real problem for Nigerian Web3 users. NairaShield is an autonomous agent
that never lets capital sleep: USDC earns Kamino yield by default, and only
moves into a bet when live math says the edge beats the yield it gives up."

**0:35 – 1:10 — Architecture in 30 seconds.** (repo README diagram)
"A Cloudflare Worker wakes every minute. It reads live consensus odds from
TxLINE — cryptographically anchored on Solana — runs a Llama-3 brain over
Y_net = spread capture minus yield opportunity cost, and executes on
Jupiter Predict with its own keypair. No human input after deploy."

**1:10 – 2:30 — Live dashboard tour.**
- Watching panel: "these fixtures come from the authenticated TxLINE feed —
  this match is LIVE right now."
- Odds panel: live decimal odds updating.
- Sharp movement rows when odds shift >3%: "the agent flags market moves
  between its own snapshots."
- Decisions feed: read one real reasoning line aloud. Emphasize: "every
  number here is real or absent — the system fails closed, never fabricates."

**2:30 – 3:30 — THE moment.**
Point at the newest decision during live play:
- If unfunded: "no capital is deployed, so the agent runs its brain as a
  dry-run: here it says it WOULD place this maker quote and why."
- If funded: show a TRADE tick → open Solscan → the actual Kamino withdraw
  and Jupiter order transactions. "That bet was decided, signed, and placed
  by the agent alone."

**3:30 – 4:15 — Risk management + honesty.**
"Open positions are marked to market every tick: +8 probability points →
take profit; −6 → stop loss — real position closes, policy-driven. And when
nothing is live, the agent tells the truth" — show a 'no match in play —
capital stays in yield' entry with the ×N collapse.

**4:15 – 5:00 — Close.**
"Built on TxLINE fixtures, odds, and scores endpoints; activated via the
on-chain subscribe flow using devnet SOL. Production-ready shape: deployed
worker, cron autonomy, honest failure modes. Roadmap: per-user agents with
keyless custody via session-signer policies — design in ROADMAP.md.
NairaShield: capital that never sits still."
