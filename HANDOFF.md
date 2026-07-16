# Project Handoff: NairaShield Bot

## Rule: no mocks

The agent **never** fabricates odds, vault balances, order IDs, or settlement PnL.
Missing keys → honest HOLD / Error. No `AGENT_DEMO_MODE`, no virtual USDC, no fake fills.

## Compliance vs PRD / research

| Requirement | Status |
|---|---|
| Idle USDC in Kamino | Live path only (fails closed until klend deposit/withdraw wired) |
| Cron monitors TxLINE fair odds | Real API only (`TXLINE_*` required) |
| In-play market making (not arb) | Yes — `src/agent/math.ts` + brain |
| Maker quotes with margin on BetDEX | Real REST only (`BETDEX_API_KEY`) |
| Y_net before leaving yield | Yes |
| Safe abort if withdraw fails | Yes |
| Settlement → redeposit Kamino | Only when BetDEX confirms real settlement |
| USDC only | Yes |
| Google auth + dashboard | Yes |

## Loop (`POST /agent/tick` + cron)

1. TxLINE fair odds (throws if not configured)
2. Settle open books **only** with BetDEX-confirmed PnL
3. Read live Kamino snapshot (HOLD if none)
4. Llama + Y_net decision
5. Withdraw → maker order → open book (all real or abort)
6. Persist tick history

## Required secrets for a live tick

```
TXLINE_API_URL, TXLINE_API_KEY
BETDEX_API_KEY
SOLANA_PRIVATE_KEY
+ Google OAuth secrets for dashboard auth
```

## Still to wire (real, not mock)

- Kamino `klend-sdk` deposit/withdraw instruction builders (currently fail closed with clear errors)
- Exact BetDEX order schema once API docs/token are available
- TxLINE path may need endpoint path tweak once credentials land

## Agent policy

Edit `src/agent/config.ts` → `AGENT_POLICY` (not env):
`yieldApy`, `tradeSizeUsdc`, `minEdge`, `makerMargin`, `eventHorizonHours`, `maxOpenPositions`.
