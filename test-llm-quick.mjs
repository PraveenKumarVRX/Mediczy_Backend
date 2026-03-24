const BASE = 'http://127.0.0.1:8888';

async function run() {
  const lr = await fetch(BASE + '/api/crm/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'crm@mediczy.com', password: 'Crm@1234567' })
  });
  const ld = await lr.json();
  console.log('Login status:', lr.status);
  const tk = ld.token || ld.data?.accessToken || ld.accessToken;
  console.log('Token present:', !!tk);

  if (!tk) { console.log('NO TOKEN - aborting'); return; }

  for (let i = 1; i <= 3; i++) {
    console.log(`\nTest ${i}...`);
    const t0 = Date.now();
    const r = await fetch(BASE + '/api/crm/rfqs/5/ai-generate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }
    });
    const d = await r.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  Status: ${r.status}, Time: ${elapsed}s`);
    console.log(`  Success: ${d.success}`);
    console.log(`  llm_assessment: ${d.data?.llm_assessment ? 'GOT DATA' : 'null'}`);
    if (d.data?.llm_assessment?.executive_summary) {
      console.log(`  Summary: ${d.data.llm_assessment.executive_summary.substring(0, 200)}`);
    }
    if (!d.success) {
      console.log(`  Error: ${d.message || d.error}`);
    }
  }
}

run().catch(e => console.error(e));
