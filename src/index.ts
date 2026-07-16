import { Env } from './types';
import { runAgent } from './ai/brain';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// HTTP trigger for manual testing
		const result = await runAgent(env);
		return new Response(JSON.stringify(result, null, 2), {
			headers: { 'Content-Type': 'application/json' },
		});
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		// Cron trigger
		console.log(`Cron triggered at ${event.cron}`);
		try {
			await runAgent(env);
		} catch (error) {
			console.error('Error running agent:', error);
		}
	},
};
