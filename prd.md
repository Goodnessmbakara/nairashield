# Product Requirements Document (PRD): NairaShield & ConsensusBot
**Target Hackathon:** TxODDS Superteam Earn Hackathon
**Primary Track:** Trading Tools and Agents
**Secondary Track:** Prediction Markets and Settlement

## 1. Executive Summary & Value Proposition
**NairaShield** is an automated portfolio-management and autonomous sports-trading agent built on Solana. It solves the opportunity cost of idle capital in Web3 sports betting. 

**Innovation & Novelty (Hackathon Focus):** Traditional bettors hold idle stablecoins that lose purchasing power to inflation (a major issue for Nigerian Web3 users). NairaShield keeps 100% of the user's capital deployed in decentralized yield vaults (Kamino/Jupiter Lend) earning continuous interest. An autonomous agent monitors the **TxLINE API** for high-probability market inefficiencies. When an opportunity is detected, the agent atomically recalls capital, executes the position, and routes the settlement back to the yield vault.

**ConsensusBot** serves as the settlement and ingestion layer, utilizing an HTTP 402 (x402) micro-payment gateway to allow the agent to pay fractional stablecoins ($0.001) for ultra-low-latency TxLINE match data, powering micro-prediction market resolutions.

---

## 2. System Architecture & Autonomous Logic
*(Addresses the "Logic & Code Architecture" and "Autonomous Operation" criteria)*

### 2.1 The NairaShield Execution Engine
NairaShield operates entirely without manual human input once funded. 

1. **Yield State:** User deposits USDC. The contract instantly deposits this into Kamino Finance.
2. **Monitoring State:** The off-chain agent streams the TxLINE API.
3. **Execution State:** When the net return model ($Y_{\text{net}} > 0$) is satisfied, the agent triggers a Solana transaction block that:
   - Withdraws required USDC from Kamino.
   - Executes the position on an on-chain prediction market (e.g., BetDEX or Monaco Protocol) utilizing TxLINE odds as the truth baseline.
4. **Settlement State:** Upon event conclusion, ConsensusBot validates the TxLINE signature. The contract collects winnings and auto-reinvests into the Kamino vault.

### 2.2 Mathematical Model
The net return ($Y_{\text{net}}$) over match duration $T$:

$$Y_{\text{net}} = \left( \sum_{i=1}^{k} \alpha_i \cdot O_i - 1 \right) \cdot C_{\text{deployed}} - C_{\text{deployed}} \cdot r_{\text{opportunity}} \cdot T$$

*Where:*
* $\alpha_i$: Capital allocation ratio
* $O_i$: Decimal consensus odds from TxLINE
* $r_{\text{opportunity}}$: Kamino continuous yield rate
* $C_{\text{deployed}}$: Recalled capital

---

## 3. Alignment with Hackathon Judging Criteria

To maximize the chance of winning, the development and demo will focus explicitly on these judging criteria:

| Category | How We Fulfill It |
| :--- | :--- |
| **Data Ingestion** | We utilize the TxLINE SSE Stream for real-time odds and utilize the cryptographic Merkle proofs for on-chain settlement. |
| **Autonomous Operation** | The agent requires zero user input post-deposit. The yield-routing, odds-monitoring, and execution are fully programmatic. |
| **Innovation & Novelty** | Combining DeFi yield-routing (Kamino) with high-frequency sports betting is a novel paradigm. It solves real-world inflation problems for emerging markets. |
| **Production Readiness** | The architecture relies on composable, audited Solana DeFi primitives (Jupiter/Kamino) and robust programmatic logic. |

---

> [!WARNING]
> ## 4. Red Flags & Critical Concerns to Address

### 🚨 1. The Arbitrage Math Problem (Crucial)
**The Issue:** The original spec mentions finding "sports arbitrage opportunities" by monitoring the TxLINE API. However, TxLINE provides a single feed of *consensus odds*. You cannot mathematically arbitrage a single set of consensus odds against itself. Arbitrage inherently requires a price disparity.
**The Solution:** 
* **Pivot to Market Making:** Position the agent as an **"In-Play Market Maker"** (which is directly suggested in the hackathon brief). The agent uses TxLINE's highly accurate consensus odds as a baseline to quote automated buy/sell orders on decentralized order books. 
* **Cross-Book Arb:** Alternatively, the agent must monitor TxLINE *and* compare it to an on-chain AMM pool to find mispricings, acting as a Keeper to correct the market.

### 🚨 2. The "No Live Activity" Demo Constraint
**The Issue:** The hackathon rules explicitly state: *"Since the matches will end after the submission deadline, there may not be live activity on the project during review."* The demo video is an "Absolute requirement to pass initial screening."
**The Solution:** You **cannot** rely on live World Cup matches for your final demo video. We must build a script that simulates/mocks the TxLINE SSE stream or replays historical match data so the video clearly demonstrates the agent autonomously executing a trade and routing funds.

### 🚨 3. TxLINE Token Restrictions
**The Issue:** The rules state: *"The internal TxLINE credit token is strictly locked to our program for data-authorization and cannot be used by contestants or end-users for peer-to-peer staking..."*
**The Solution:** Ensure that ConsensusBot’s x402 micro-payments and the NairaShield escrow vaults exclusively use stablecoins (USDC/USDT), and NEVER the internal TxLINE token for payouts or betting collateral.

### 🚨 4. Solana Atomic Composability Risks
**The Issue:** Moving funds from a Yield Vault -> Prediction Market within a narrow time window introduces execution risks (slippage, network congestion, Kamino withdrawal limits).
**The Solution:** The agent must pre-flight simulate transactions and include fallback logic. If the Kamino withdrawal fails or takes too long, the agent must gracefully abort rather than locking funds in a partial state.

---

## 5. Next Steps for Implementation
1. **Mock the TxLINE Feed:** Set up a local test script that mimics the TxLINE JSON schema to allow testing of the agent's logic regardless of live matches.
2. **Refine the Trading Logic:** Update the agent logic from "pure arbitrage" to either "Market Making" or "Cross-Platform Arbitrage" using TxLINE as the source of truth.
3. **Build the Anchor Program:** Develop the smart contract that handles the Kamino CPI (withdraw/deposit) and the secure execution vault.
4. **Record the Demo:** Focus the 5-minute video entirely on the *autonomous nature* of the bot moving funds from Yield -> Bet -> Yield.
