# Project Handoff: NairaShield Bot

## Current State of the Codebase
The core architecture and scaffolding are complete. The bot is designed to run as a **Cloudflare Worker** using **TypeScript**, making it extremely fast, serverless, and low-latency.

### What is working:
1. **The Infrastructure:** The `wrangler.toml` is configured to use Cloudflare AI (`AI` binding) and has a Cron Trigger setup to run the bot automatically every minute.
2. **The LLM Brain:** `src/ai/brain.ts` successfully initializes Llama 3 via Cloudflare Workers AI. It takes mocked TxLINE odds, feeds them into a strict prompt, and parses the returned JSON string into a structured decision.
3. **The Agent Wallet:** `src/blockchain/agent.ts` safely initializes the Solana Agent Kit. It gracefully falls back to generating a random Devnet keypair if one isn't provided in the environment variables, meaning the app will not crash during a local demo.

## What Needs to Be Done Next (The "Mocks")
To finish the hackathon submission, you need to replace the mock functions in `src/integrations/*` with actual API calls:

1. **`txline.ts`**: Replace the static return object with a `fetch` request to the TxLINE API or an SSE stream listener to get real consensus odds.
2. **`kamino.ts`**: Use the imported `SolanaAgentKit` or `@kamino-finance/klend-sdk` to execute real `deposit` and `withdraw` instructions for USDC on Solana Devnet.
3. **`betdex.ts`**: Obtain a BetDEX API token and write the HTTP `POST` request to their REST API to actually place the maker order on the orderbook.

## How to Test
1. Make sure you have your dependencies installed (`npm install`).
2. Run the local Cloudflare dev server: `npx wrangler dev`.
3. Press `b` in your terminal to open the browser. This will hit the HTTP fetch handler in `src/index.ts`, simulating a cron-tick, and you will see the LLM's trading decision output on the screen.

## Next Steps for the Hackathon
- **UI/Dashboard:** Since it's a hackathon, judges want to see something visual. Consider creating a quick Next.js frontend that simply calls your Cloudflare Worker URL and displays the resulting trade decisions in a nice feed!
