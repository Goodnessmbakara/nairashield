const origin = "https://txline.txodds.com";
const apiKey = "txoracle_api_aa3ef5a029ea4eaabda2b81e216090ec";

async function run() {
  const res = await fetch(`${origin}/auth/guest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  const jwt = data.token;
  console.log("Got JWT", !!jwt);
  
  const headers = { 'Authorization': `Bearer ${jwt}`, 'X-Api-Token': apiKey, 'accept': 'application/json' };
  
  // Try to find if there's an archive or history endpoint
  const r1 = await fetch(`${origin}/api/odds/history`, { headers });
  console.log("/api/odds/history:", r1.status);
  
  const r2 = await fetch(`${origin}/api/fixtures/archive`, { headers });
  console.log("/api/fixtures/archive:", r2.status);
}
run();
