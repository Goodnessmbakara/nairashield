## Research Results: Retegol Hackathon Integration

### TL;DR
Building Retegol requires integrating Kamino for yield and either Monaco Protocol or BetDEX for the execution layer, with TxLINE acting as the data oracle. Because TxLINE provides a consensus feed, the agent cannot arbitrage against TxLINE itself. Instead, it must act as an In-Play Market Maker on a decentralized order book (like BetDEX/Monaco) using TxLINE as the pricing baseline, or perform cross-book arbitrage comparing TxLINE's implied probabilities against existing AMM pools.

### Findings

#### Theme 1: Yield Integration (Kamino Finance)
- **Integration Path**: Kamino provides a comprehensive TypeScript SDK (`@kamino-finance/klend-sdk`) and a Rust interface (`kamino_lending_interface` via `solores`) for Cross-Program Invocations (CPI).
- **Strategy**: For an autonomous bot, the TypeScript SDK is likely the fastest to prototype for the hackathon. You can programmatically deposit/withdraw USDC from their lending pools.
- **Risks**: Atomic composability (withdrawing from Kamino and placing a bet in a single Solana transaction) may hit transaction size limits or liquidity constraints. You may need to design the bot to operate in two discrete steps.

#### Theme 2: Prediction Markets (BetDEX & Monaco Protocol)
- **Monaco Protocol**: The underlying decentralized betting engine on Solana. It handles order placement and shared liquidity entirely on-chain. It is non-custodial and has an open-source SDK.
- **BetDEX**: A premier sportsbook platform built *on top of* Monaco Protocol. BetDEX offers a highly developer-friendly REST API for order management and a WebSocket Stream API for low-latency market updates. 
- **Comparison**: For a fast hackathon build, integrating with BetDEX's off-chain APIs might be significantly faster than writing custom Rust CPIs directly into the Monaco smart contracts.

#### Theme 3: Data Oracle & In-Play Market Making (TxLINE)
- **TxLINE Architecture**: It is a hybrid system. You authenticate via an on-chain Solana transaction to activate your subscription (using their IDL), then consume data via an off-chain API/SSE stream.
- **Market Making Logic**: To build the "Agent vs Agent" or "In-Play Market Maker" required by the hackathon track, the bot should:
  1. Stream TxLINE's real-time odds.
  2. Treat the TxLINE odds as the objective "fair value".
  3. Quote automated buy/sell prices on BetDEX with a slight margin/spread to capture profit, adjusting dynamically as the TxLINE feed updates.

### Recommendation
**Architecture for the Hackathon:**
1. Use **TypeScript/Node.js** to build the off-chain autonomous agent.
2. Use the **TxLINE API (SSE Stream)** for the real-time truth feed.
3. Use the **Kamino TS SDK** to manage the yield portfolio (depositing idle funds and withdrawing when the bot needs to execute a trade).
4. Use **BetDEX REST/WebSocket APIs** for trade execution.

**Pivot Strategy:** Pivot the core PRD logic from "pure arbitrage" to "In-Play Market Making". Use TxLINE odds to set your spread, and place maker orders on BetDEX. When orders fill, you earn the spread. Return the profits to Kamino.

### Open Questions for the Team
- **Latency & Liquidity**: What are the actual withdrawal latency and liquidity limitations of Kamino when trying to recall capital instantly for high-frequency in-play betting?
- **Judging Preference**: Will the hackathon judges prefer a fully off-chain TypeScript bot using APIs, or do they heavily prefer an Anchor Rust program doing on-chain CPIs into TxLINE's program? (The track brief mentions both are acceptable, but we should weigh our team's strengths).

### Sources
- [Kamino Build Docs](https://kamino.finance/build/api-reference/introduction)
- [Monaco Protocol GitHub](https://github.com/MonacoProtocol/protocol)
- [BetDEX API Portal](https://docs.betdex.com/)
- [TxLINE Quickstart](https://txline.txodds.com/documentation/quickstart)
