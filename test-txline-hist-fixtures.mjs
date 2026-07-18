const origin = "https://txline.txodds.com";
const apiKey = "txoracle_api_aa3ef5a029ea4eaabda2b81e216090ec";
async function run() {
  const res = await fetch(`${origin}/auth/guest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  const jwt = data.token;
  const headers = { 'Authorization': `Bearer ${jwt}`, 'X-Api-Token': apiKey, 'accept': 'application/json' };
  
  const fRes = await fetch(`${origin}/api/fixtures/snapshot`, { headers });
  const fixtures = await fRes.json();
  console.log("Fixtures:", fixtures.length);
  if(fixtures.length > 0) {
     const fid = fixtures[0].id;
     console.log("Checking historical scores for fixture:", fid);
     const sRes = await fetch(`${origin}/api/scores/historical/${fid}`, { headers });
     console.log("Scores historical:", sRes.status);
     if(sRes.ok) console.log(await sRes.json());
     
     const oRes = await fetch(`${origin}/api/odds/historical/${fid}`, { headers });
     console.log("Odds historical:", oRes.status);
     if(oRes.ok) console.log(Object.keys(await oRes.json()));
  }
}
run();
