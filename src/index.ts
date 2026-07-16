import type { Env } from "./types";
import { runAgentTick } from "./agent/pipeline";
import { handleFetch, handleWithCors } from "./http/router";
import { json } from "./http/json";

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		try {
			const res = await handleFetch(request, env);
			return handleWithCors(request, env, res);
		} catch (e) {
			console.error("Unhandled worker error", e);
			return handleWithCors(
				request,
				env,
				json(
					{ error: "Internal error", detail: e instanceof Error ? e.message : String(e) },
					500,
				),
			);
		}
	},

	async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
		// Autonomous loop (PRD): settle due books → market make → safe execute
		console.log(`Cron ${event.cron} at ${new Date().toISOString()}`);
		try {
			const tick = await runAgentTick(env);
			const yNet =
				typeof tick.decision.yNet === "number" ? ` yNet=${tick.decision.yNet}` : "";
			const books =
				typeof tick.openPositions === "number" ? ` open=${tick.openPositions}` : "";
			console.log(
				`[cron] ${tick.status} action=${tick.decision.action}${yNet}${books} ${tick.durationMs}ms`,
				tick.decision.reason,
			);
		} catch (error) {
			console.error("Cron agent error:", error);
		}
	},
};
