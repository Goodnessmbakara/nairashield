# TxLINE integration (Retegol)

How Retegol uses the TxLINE API for live sports odds.

## Endpoints we use

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/auth/guest/start` | Guest JWT (refreshed per call) |
| `POST` | `/api/token/activate` | One-time activation after on-chain `subscribe` |
| `GET` | `/api/fixtures/snapshot` | Fixture discovery / Watching panel |
| `GET` | `/api/odds/snapshot/{fixtureId}` | Live per-fixture odds |
| `GET` | `/api/scores/snapshot/{fixtureId}` | Settlement scores |

Auth: `Authorization: Bearer <guestJwt>` + `X-Api-Token: <activated token>` (`TXLINE_API_KEY` in env).

Implementation: [`src/integrations/txline.ts`](../src/integrations/txline.ts). Activation script: [`scripts/txline-activation/`](../scripts/txline-activation/).

## How it drives the agent

Every cron tick the worker:

1. Loads fixtures from `/api/fixtures/snapshot`
2. Pulls per-fixture odds (devnet global snapshots 404, so we sweep fixtures)
3. Detects sharp moves (>3% between snapshots)
4. Feeds consensus odds into the Llama 3 decision (Y_net vs Kamino yield)
5. Uses scores snapshots when settling open books

No mocks: empty feed or missing credentials → honest `HOLD` with a reason.

## Hackathon feedback (TxODDS)

**Liked:** Normalized JSON across competitions; on-chain activation is novel; free World Cup tier; fast snapshots.

**Friction:** Devnet only exposes per-fixture odds/scores (global 404); empty live windows return `[]` (reads like breakage); live payloads use PascalCase while docs show camelCase (we normalize both); OpenAPI URL from docs returned 500.
