#!/usr/bin/env node
/**
 * Retegol MCP server (stdio).
 *
 * Env:
 *   RETEGOL_URL         — worker base URL
 *   RETEGOL_AGENT_KEY   — wrangler secret RETEGOL_AGENT_KEY
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RetegolClient } from "./client.js";

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: msg }],
  };
}

async function main() {
  let client: RetegolClient;
  try {
    client = RetegolClient.fromEnv();
  } catch (e) {
    console.error(
      e instanceof Error ? e.message : String(e),
      "\nSet RETEGOL_URL and RETEGOL_AGENT_KEY.",
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: "retegol",
    version: "0.1.0",
  });

  server.registerTool(
    "retegol_status",
    {
      description:
        "Retegol agent status: live mode, integrations, Kamino yield position, last tick (read-only).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(await client.status());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "retegol_fixtures",
    {
      description:
        "List TxLINE fixtures the Retegol agent is watching (live odds feed, read-only).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(await client.fixtures());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "retegol_verify",
    {
      description:
        "Run on-chain TxLINE Merkle proof check (txoracle validate_fixture) for a fixture ID.",
      inputSchema: z.object({
        fixtureId: z.string().describe("TxLINE fixture ID to verify on Solana"),
      }),
    },
    async ({ fixtureId }) => {
      try {
        return textResult(await client.verify(fixtureId));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "retegol_history",
    {
      description: "Recent Retegol agent ticks (decisions, optional verification payloads).",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max ticks to return (default 40, max 50)"),
      }),
    },
    async ({ limit }) => {
      try {
        return textResult(await client.history(limit ?? 40));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("retegol MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
