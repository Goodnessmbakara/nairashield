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
- Google Cloud OAuth 2.0 Web client (for sign-in)

### Installation
```bash
npm install
cd web && npm install && cd ..
```

### Environment Variables
Copy `.dev.vars.example` → `.dev.vars` in the **repo root** (worker):

```env
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=long-random-string-at-least-32-chars
WORKER_URL=http://127.0.0.1:8787
FRONTEND_URL=http://127.0.0.1:4321
# Optional
SOLANA_PRIVATE_KEY=
RPC_URL=https://api.devnet.solana.com
```

Google OAuth **Authorized redirect URI**:
- `http://127.0.0.1:8787/auth/google/callback`
- `https://<your-worker>.workers.dev/auth/google/callback`

Web env (`web/.env`):
```env
PUBLIC_AGENT_URL=http://127.0.0.1:8787
```

### KV sessions
Create a real KV namespace before production deploy:
```bash
npx wrangler kv namespace create SESSIONS
# paste the id into wrangler.toml
```

### Run Locally
```bash
# terminal 1 - agent + auth API
npm run dev

# terminal 2 - marketing + dashboard
cd web && npm run dev
```

### Auth API (worker)
| Route | Auth | Description |
|---|---|---|
| `GET /health` | public | liveness |
| `GET /auth/google` | public | start Google OAuth |
| `GET /auth/google/callback` | Google | OAuth callback |
| `POST /auth/exchange` | one-time code | issue bearer session |
| `GET /auth/me` | bearer | current user |
| `POST /auth/logout` | bearer | destroy session |
| `POST /agent/tick` | **required** | run one agent decision |
| Cron `* * * * *` | internal | autonomous loop |

### Deploy worker
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```
