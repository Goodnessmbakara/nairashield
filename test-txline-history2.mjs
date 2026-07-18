const origin = "https://txline.txodds.com";
const apiKey = "txoracle_api_aa3ef5a029ea4eaabda2b81e216090ec";

async function run() {
  const res = await fetch(`${origin}/auth/guest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  const jwt = data.token;
  const headers = { 'Authorization': `Bearer ${jwt}`, 'X-Api-Token': apiKey, 'accept': 'application/json' };
  
  const r2 = await fetch(`${origin}/api/scores/historical`, { headers });
  console.log("/api/scores/historical:", r2.status);
  if(r2.ok) console.log(Object.keys(await r2.json() || {}));
}
run();
