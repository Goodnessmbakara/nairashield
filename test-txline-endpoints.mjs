const origin = "https://txline.txodds.com";
const apiKey = "txoracle_api_aa3ef5a029ea4eaabda2b81e216090ec";
async function run() {
  const res = await fetch(`${origin}/auth/guest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  const jwt = data.token;
  const headers = { 'Authorization': `Bearer ${jwt}`, 'X-Api-Token': apiKey, 'accept': 'application/json' };
  
  const urls = [
    '/api/fixtures/snapshot',
    '/api/fixtures/snapshot?date=2022-12-18',
    '/api/fixtures/historical',
    '/api/fixtures/archive',
    '/api/scores/historical/123',
    '/api/scores/historical',
    '/api/fixtures/snapshot?competitionId=72&date=2022-12-18'
  ];
  for (const u of urls) {
    const r = await fetch(origin + u, { headers });
    console.log(u, r.status);
    if(r.ok && u.includes('?date=')) {
      const j = await r.json();
      console.log('  Count:', j.length || Object.keys(j).length);
    }
  }
}
run();
