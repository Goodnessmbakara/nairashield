# NairaShield 🛡️

NairaShield is an autonomous, AI-driven sports market-making agent built on Solana. It leverages **Cloudflare Workers AI** (Llama 3) for real-time decision making, the **Solana Agent Kit** for blockchain execution, **Kamino Finance** for yield routing, and the **TxLINE API** for verifiable sports data.

Built for the **TxODDS Superteam Earn Hackathon** (Trading Tools and Agents Track).

## 🚀 How It Works
1. **Yield Bearing Capital:** Idle USDC is parked in Kamino Finance to constantly earn yield.
2. **Oracle Streaming:** The bot streams real-time consensus odds from TxLINE.
3. **AI Brain:** Cloudflare's edge AI evaluates the odds and decides if a profitable spread can be captured.
4. **Market Making:** The bot automatically withdraws capital from Kamino, places Maker orders on BetDEX, and captures the spread.

## 🛠 Tech Stack
- **Edge Compute:** Cloudflare Workers (Cron + HTTP Triggers)
- **AI / LLM:** Cloudflare Workers AI (`@cf/meta/llama-3-8b-instruct`)
- **Blockchain Agent:** [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit)
- **Yield Integration:** `@kamino-finance/klend-sdk`
- **Sports Data:** TxLINE API
- **Execution Engine:** BetDEX REST API

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- Cloudflare Wrangler CLI

### Installation
```bash
npm install
```

### Environment Variables
Create a `.dev.vars` file in the root directory (for local testing):
```env
# Optional: The bot will generate a random Devnet key if left blank
SOLANA_PRIVATE_KEY=your_base58_private_key
RPC_URL=https://api.devnet.solana.com
```

### Run Locally
```bash
npx wrangler dev
```
