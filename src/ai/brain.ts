import { Env } from '../types';
import { fetchLatestOdds } from '../integrations/txline';
import { executeTrade } from '../integrations/betdex';
import { withdrawYield, depositYield } from '../integrations/kamino';
import { initializeAgent } from '../blockchain/agent';

export async function runAgent(env: Env) {
	// 1. Fetch Oracle Data
	const odds = await fetchLatestOdds();
	
	// 2. Prepare Prompt for AI
	const prompt = `
	You are NairaShield, an autonomous sports market making agent.
	Current TxLINE Odds: ${JSON.stringify(odds)}
	
	Your goal is to act as an In-Play Market Maker. If there is a favorable match, you should place a maker order.
	Respond ONLY in JSON format with your decision:
	{
		"action": "TRADE" | "HOLD",
		"team"?: string,
		"spread"?: number,
		"reason": string
	}
	`;

	// 3. Ask Cloudflare Workers AI
	const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: [
			{ role: 'system', content: 'You are a highly logical sports trading algorithm. Output strictly valid JSON.' },
			{ role: 'user', content: prompt }
		]
	});

	let decision;
	try {
		// Try to parse the raw JSON string out of the AI response
		// The AI might wrap it in markdown block \`\`\`json ... \`\`\`
		const rawContent = response.response;
		const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
		decision = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
	} catch (e) {
		console.error('Failed to parse AI response:', response.response);
		return { error: 'Invalid AI output', raw: response.response };
	}

	console.log('AI Decision:', decision);

	// 4. Execute based on decision
	if (decision.action === 'TRADE') {
		const agent = initializeAgent(env);
		
		// Mock execution flow
		// a. Withdraw capital from yield vault
		await withdrawYield(agent, 10);
		
		// b. Place maker order on BetDEX
		await executeTrade(decision.team, decision.spread);
		
		// (In reality, we would wait for settlement then re-deposit)
		return { status: 'Executed', decision };
	}

	return { status: 'Skipped', decision };
}
