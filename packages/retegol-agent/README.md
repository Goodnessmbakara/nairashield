# `@retegol/agent`

TypeScript client + **MCP server** for the Retegol sports market-making agent on Solana.

**Read-only v1** — status, fixtures, on-chain verify, history. No trade/tick triggers.

## Install

```bash
npm install @retegol/agent
```

## Env

| Variable | Meaning |
| --- | --- |
| `RETEGOL_URL` | Worker base, e.g. `https://retegol-bot.zanbuilds.workers.dev` |
| `RETEGOL_AGENT_KEY` | Same value as wrangler secret `RETEGOL_AGENT_KEY` |

## SDK

```ts
import { RetegolClient } from "@retegol/agent";

const client = RetegolClient.fromEnv();
// or: new RetegolClient({ baseUrl, apiKey })

const status = await client.status();
const { fixtures } = await client.fixtures();
const { verification } = await client.verify(fixtures[0].fixtureId);
const { ticks } = await client.history(20);
```

## MCP (Cursor / Claude)

```json
{
  "mcpServers": {
    "retegol": {
      "command": "npx",
      "args": ["-y", "@retegol/agent"],
      "env": {
        "RETEGOL_URL": "https://retegol-bot.zanbuilds.workers.dev",
        "RETEGOL_AGENT_KEY": "your-key"
      }
    }
  }
}
```

Tools: `retegol_status`, `retegol_fixtures`, `retegol_verify`, `retegol_history`.

## Publish (maintainers)

```bash
cd packages/retegol-agent
npm run build
npm publish --access public
```

Operator must set the worker secret first:

```bash
npx wrangler secret put RETEGOL_AGENT_KEY
```
