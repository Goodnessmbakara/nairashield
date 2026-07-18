import { fetchUpcomingFixtures } from "./src/integrations/txline";
import { loadAgentConfig } from "./src/agent/config";

async function run() {
  const env = process.env;
  const config = loadAgentConfig(env as any);
  console.log(config.txlineApiUrl);
  // Let's get guest JWT
  const res = await fetch(`${config.txlineApiUrl}/auth/guest/start`, { method: 'POST' });
  const data = await res.json();
  const jwt = data.token;
  console.log("Got JWT");
  
  // Try to hit /api/odds/history or /api/fixtures/archive
  const headers = { 'Authorization': `Bearer ${jwt}`, 'X-Api-Token': config.txlineApiKey };
  const fixturesRes = await fetch(`${config.txlineApiUrl}/api/fixtures/snapshot`, { headers });
  const fixtures = await fixturesRes.json();
  const fixtureId = fixtures[0]?.FixtureId || fixtures[0]?.fixtureId;
  console.log("Fixture:", fixtureId);
  
  const hRes = await fetch(`${config.txlineApiUrl}/api/odds/history/${fixtureId}`, { headers });
  console.log("/api/odds/history:", hRes.status);
  
  const aRes = await fetch(`${config.txlineApiUrl}/api/archive/odds/${fixtureId}`, { headers });
  console.log("/api/archive/odds:", aRes.status);
}
run();
