const origin = "https://txline.txodds.com";
const apiKey = "txoracle_api_aa3ef5a029ea4eaabda2b81e216090ec";

async function run() {
  const res = await fetch(`${origin}/auth/guest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  const jwt = data.token;
  
  const headers = { 'Authorization': `Bearer ${jwt}`, 'X-Api-Token': apiKey, 'accept': 'application/json' };
  const fRes = await fetch(`${origin}/api/fixtures/snapshot`, { headers });
  const fixtures = await fRes.json();
  
  console.log("Total fixtures:", fixtures.length);
  const ended = fixtures.filter(f => f.Status === 'ENDED' || f.Status === 'FT' || f.status === 'ENDED' || (f.StartTime && f.StartTime < Date.now()));
  console.log("Ended fixtures count:", ended.length);
  if (ended.length > 0) {
    console.log("Sample ended fixture:", Object.keys(ended[0]));
  }
}
run();
