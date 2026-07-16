# Product Requirements Document (PRD): NairaShield & ConsensusBot
**Target Hackathon:** TxODDS Superteam Earn Hackathon
**Primary Track:** Trading Tools and Agents
**Secondary Track:** Prediction Markets and Settlement

## 1. Executive Summary & Value Proposition
**NairaShield** is an automated portfolio-management and autonomous sports-trading agent built on Solana. It solves the opportunity cost of idle capital in Web3 sports betting. 

**Innovation & Novelty (Hackathon Focus):** Traditional bettors hold idle stablecoins that lose purchasing power to inflation (a major issue for Nigerian Web3 users). NairaShield keeps 100% of the user's capital deployed in decentralized yield vaults (Kamino/Jupiter Lend) earning continuous interest. An autonomous agent running on **Cloudflare Workers edge compute** monitors the **TxLINE API** for high-probability market inefficiencies. When an opportunity is detected, the agent's LLM brain evaluates the trade, atomically recalls capital, executes the position on BetDEX, and routes the settlement back to the yield vault.

---

## 2. System Architecture & Autonomous Logic
*(Addresses the "Logic & Code Architecture" and "Autonomous Operation" criteria)*

### 2.1 The NairaShield Execution Engine
NairaShield operates entirely without manual human input once funded, utilizing a modern Edge AI stack:

1. **Yield State:** User deposits USDC. The contract instantly deposits this into Kamino Finance.
2. **Monitoring State:** A Cloudflare Worker (triggered via Cron) streams the TxLINE API to ingest real-time consensus odds.
3. **Execution State:** **Cloudflare Workers AI (Llama 3)** acts as the brain. It evaluates the odds against the yield rate. If the net return model ($Y_{\text{net}} > 0$) is satisfied, it instructs the **Solana Agent Kit** to trigger a transaction block that:
   - Withdraws required USDC from Kamino.
   - Executes a Maker position on BetDEX using TxLINE odds as the truth baseline.
4. **Settlement State:** Upon event conclusion, the contract collects winnings and auto-reinvests into the Kamino vault.

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
| **Data Ingestion** | We utilize the TxLINE API for real-time odds and cryptographic Merkle proofs for on-chain settlement. |
| **Autonomous Operation** | Powered by Cloudflare Workers AI + Solana Agent Kit, the agent requires zero user input post-deposit. |
| **Innovation & Novelty** | Combining DeFi yield-routing (Kamino) with high-frequency Edge AI sports betting is a novel paradigm. |
| **Production Readiness** | The architecture relies on serverless edge compute, making it infinitely scalable and low-latency. |

---

> [!WARNING]
> ## 4. Red Flags & Critical Concerns (Architectural Resolutions)

### 🚨 1. The Arbitrage Math Problem -> Pivot to Market Making
**The Issue:** You cannot mathematically arbitrage a single set of consensus odds against itself. Arbitrage inherently requires a price disparity across books.
**The Resolution:** We have fully pivoted the agent to an **"In-Play Market Maker"**. The agent uses TxLINE's highly accurate consensus odds as a baseline to quote automated buy/sell maker orders on the **BetDEX** decentralized order book. We capture the spread rather than seeking arbitrage.

### 🚨 2. The "No Live Activity" Demo Constraint
**The Issue:** The hackathon rules explicitly state: *"Since the matches will end after the submission deadline, there may not be live activity on the project during review."*
**The Resolution:** The codebase scaffold explicitly includes mock integrations (`src/integrations/txline.ts`). For the demo video, we will feed simulated live World Cup data into the LLM brain to demonstrate the autonomous execution in real-time.

### 🚨 3. TxLINE Token Restrictions
**The Issue:** The rules state: *"The internal TxLINE credit token is strictly locked to our program for data-authorization and cannot be used by contestants or end-users for peer-to-peer staking..."*
**The Resolution:** The Solana Agent Kit exclusively uses stablecoins (USDC) for Kamino deposits and BetDEX collateral.

### 🚨 4. Solana Atomic Composability Risks
**The Issue:** Moving funds from a Yield Vault -> Prediction Market within a narrow time window introduces execution risks (slippage, network congestion).
**The Resolution:** By migrating the core logic to Cloudflare Workers rather than on-chain CPIs, we gain granular control over error handling. The Solana Agent Kit evaluates the Kamino withdrawal; if it fails due to liquidity crunches, the agent safely aborts before placing the BetDEX order.

---

## 5. Next Steps for Implementation
1. **Swap the Mocks:** Replace the placeholder APIs in the `integrations/` folder with real TxLINE, BetDEX, and Kamino SDK calls.
2. **Build the Demo UI:** Create a Next.js visual dashboard showing the Cloudflare AI brain's real-time decisions for the judges.
3. **Record the Demo:** Focus the 5-minute video entirely on the *autonomous nature* of the bot moving funds from Yield -> Bet -> Yield.
