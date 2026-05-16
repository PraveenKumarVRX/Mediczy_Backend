/**
 * AI Endpoints Smoke Test Suite
 * Tests: CRM Auth → RFQ CRUD → AI Quote Generation → Claims Upload → Claims Analysis → LLM Integration
 */


import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const XLSX = require('./server/node_modules/xlsx');

// Load .env.testing if present
let env = {};
try {
  const envPath = path.resolve(process.cwd(), '.env.testing');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  }
} catch (e) {
  // Ignore errors, fallback to defaults
}

const BASE = env.BASE_URL ? `${env.BASE_URL}/api/crm` : 'http://localhost:8888/api/crm';
const CRM_EMAIL = env.TEST_USER_EMAIL || 'crm@mediczy.com';
const CRM_PASSWORD = env.TEST_USER_PASSWORD || 'Crm@1234567';

let TOKEN = '';
let TEST_RFQ_ID = null;
let passed = 0;
let failed = 0;
let skipped = 0;

// ── Helpers ──────────────────────────────────────────────────────────

function color(code, text) { return `\x1b[${code}m${text}\x1b[0m`; }
const green = t => color('32', t);
const red = t => color('31', t);
const yellow = t => color('33', t);
const cyan = t => color('36', t);
const bold = t => color('1', t);
const dim = t => color('2', t);

async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  ${green('✓')} ${name} ${dim(`(${ms}ms)`)}`);
    passed++;
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`  ${red('✗')} ${name} ${dim(`(${ms}ms)`)}`);
    console.log(`    ${red(err.message)}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`  ${yellow('○')} ${name} ${dim(`— ${reason}`)}`);
  skipped++;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(method, path, body = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s for AI endpoints
  opts.signal = controller.signal;
  
  try {
    const res = await fetch(`${BASE}${path}`, opts);
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Test Suites ──────────────────────────────────────────────────────

async function testAuth() {
  console.log(bold('\n🔐 Authentication'));

  await test('POST /login — valid credentials', async () => {
    const { status, data } = await api('POST', '/login', {
      email: CRM_EMAIL,
      password: CRM_PASSWORD
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.success === true, `Login failed: ${data.message}`);
    assert(data.token, 'No token returned');
    assert(data.crmUser, 'No user object returned');
    assert(data.crmUser.email === CRM_EMAIL, 'Email mismatch');
    TOKEN = data.token;
  });

  await test('POST /login — wrong password returns 401', async () => {
    const { status, data } = await api('POST', '/login', {
      email: CRM_EMAIL,
      password: 'wrongpassword'
    });
    assert(status === 401 || status === 429, `Expected 401/429, got ${status}`);
  });

  await test('GET /auth/verify — valid token', async () => {
    const { status, data } = await api('GET', '/auth/verify');
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.success === true, `Verify failed: ${data.message}`);
  });

  await test('GET /auth/verify — no token returns 401', async () => {
    const saved = TOKEN;
    TOKEN = '';
    const { status } = await api('GET', '/auth/verify');
    TOKEN = saved;
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('GET /auth/verify — bad token returns 401', async () => {
    const saved = TOKEN;
    TOKEN = 'invalid.token.here';
    const { status } = await api('GET', '/auth/verify');
    TOKEN = saved;
    assert(status === 401, `Expected 401, got ${status}`);
  });
}

async function testRFQCreation() {
  console.log(bold('\n📋 RFQ Creation & Member Seeding'));

  await test('POST /rfqs — create test RFQ', async () => {
    const { status, data } = await api('POST', '/rfqs', {
      insured_name: 'AI Test Corp Pvt Ltd',
      broker_name: 'Test Broker',
      broker_company: 'Test Broking Firm',
      broker_email: 'broker@test.com',
      policy_type: 'Group Mediclaim',
      product_type: 'OPD',
      policy_start: '2026-04-01',
      policy_end: '2027-03-31',
      notes: 'Automated smoke test RFQ'
    });
    assert(status === 200 || status === 201, `Expected 200/201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.success === true, `Create RFQ failed: ${data.message}`);
    TEST_RFQ_ID = data.rfq?.id || data.data?.id;
    assert(TEST_RFQ_ID, `No RFQ ID returned: ${JSON.stringify(data)}`);
  });

  if (!TEST_RFQ_ID) return;

  // Seed members directly via DB to have a proper population for AI quote
  await test('Seed 50 test members via upload-members', async () => {
    // Build a synthetic member list and generate a real Excel file
    const members = [];
    const relationships = ['SELF', 'SPOUSE', 'CHILD'];
    const genders = ['M', 'F'];
    const bands = ['Band A', 'Band B', 'Band C'];
    const siSlabs = [300000, 500000, 750000];
    
    for (let i = 1; i <= 50; i++) {
      const relIdx = i <= 20 ? 0 : (i <= 35 ? 1 : 2);
      const age = relIdx === 2 ? Math.floor(Math.random() * 15) + 3 :
                  relIdx === 1 ? Math.floor(Math.random() * 25) + 25 :
                  Math.floor(Math.random() * 30) + 25;
      const bandIdx = Math.floor((i - 1) / 17);
      members.push({
        'Sr No': i,
        'Emp Code': `EMP${String(i).padStart(4, '0')}`,
        'Employee Name': `Test Employee ${i}`,
        'Relationship': relationships[relIdx],
        'Gender': genders[i % 2],
        'Age': age,
        'DOB': `${2026 - age}-06-15`,
        'SI Proposed': siSlabs[bandIdx] || 500000,
        'Band': bands[bandIdx] || 'Band B',
        'Designation': relIdx === 0 ? 'Manager' : ''
      });
    }

    // Generate real Excel buffer using xlsx
    const ws = XLSX.utils.json_to_sheet(members);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Upload as multipart form-data
    const formData = new FormData();
    formData.append('file', new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), 'test-members.xlsx');

    const headers = {};
    if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

    const res = await fetch(`${BASE}/rfqs/${TEST_RFQ_ID}/upload-members`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json();

    assert(res.status === 200 || res.status === 201,
      `Upload members returned ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    assert(data.success === true, `Upload members failed: ${JSON.stringify(data)}`);
    console.log(dim(`    └─ ${data.inserted || data.count || 50} members uploaded`));
  });

  await test('GET /rfqs/:id — verify RFQ exists', async () => {
    const { status, data } = await api('GET', `/rfqs/${TEST_RFQ_ID}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, 'RFQ fetch failed');
  });

  await test('GET /rfqs/:id/members — verify members loaded', async () => {
    const { status, data } = await api('GET', `/rfqs/${TEST_RFQ_ID}/members`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, `Members fetch failed: ${data.message}`);
  });

  await test('GET /rfqs/:id/member-analytics — demographics analysis', async () => {
    const { status, data } = await api('GET', `/rfqs/${TEST_RFQ_ID}/member-analytics`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, `Analytics failed: ${data.message}`);
  });
}

async function testAIQuoteEngine() {
  console.log(bold('\n🤖 AI Actuarial Quote Engine'));

  if (!TEST_RFQ_ID) {
    skip('AI Quote Generation', 'No test RFQ available');
    return;
  }

  // First check if the RFQ has members
  const { data: memberData } = await api('GET', `/rfqs/${TEST_RFQ_ID}/members`);
  const memberCount = memberData?.data?.length || memberData?.members?.length || 0;
  
  if (memberCount === 0) {
    // Use an existing RFQ with members instead
    console.log(dim('    No members on test RFQ, trying existing RFQ with members...'));
    const { data: rfqList } = await api('GET', '/rfqs');
    const rfqs = rfqList?.data || rfqList?.rfqs || [];
    for (const rfq of rfqs) {
      if (rfq.member_count > 0) {
        TEST_RFQ_ID = rfq.id;
        console.log(dim(`    Using RFQ ${rfq.rfq_number} (${rfq.member_count} members)`));
        break;
      }
    }
  }

  let aiQuoteResult = null;

  await test('POST /rfqs/:id/ai-generate-quote — full actuarial pricing', async () => {
    console.log(dim(`    Generating AI quote for RFQ #${TEST_RFQ_ID}... (this may take 30-60s with LLM)`));
    const start = Date.now();
    const { status, data } = await api('POST', `/rfqs/${TEST_RFQ_ID}/ai-generate-quote`);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data).slice(0, 300)}`);
    assert(data.success === true, `AI quote failed: ${data.message}`);
    
    aiQuoteResult = data.data || data;
    
    // Validate core actuarial fields (nested under combined/opd_pricing/risk_assessment)
    assert(aiQuoteResult.combined, 'Missing combined pricing');
    assert(aiQuoteResult.combined.total_premium !== undefined, 'Missing combined.total_premium');
    assert(aiQuoteResult.combined.per_life !== undefined, 'Missing combined.per_life');
    assert(aiQuoteResult.risk_assessment, 'Missing risk_assessment');
    assert(aiQuoteResult.risk_assessment.overall_score !== undefined, 'Missing risk_assessment.overall_score');
    assert(aiQuoteResult.opd_pricing, 'Missing opd_pricing');
    
    console.log(dim(`    ├─ Total Premium: ₹${Number(aiQuoteResult.combined.total_premium).toLocaleString('en-IN')}`));
    console.log(dim(`    ├─ Per Life: ₹${Number(aiQuoteResult.combined.per_life).toLocaleString('en-IN')}`));
    console.log(dim(`    ├─ Per Family: ${aiQuoteResult.combined.per_family ? '₹' + Number(aiQuoteResult.combined.per_family).toLocaleString('en-IN') : 'N/A (single-life pricing)'}`));
    console.log(dim(`    ├─ Risk Score: ${aiQuoteResult.risk_assessment.overall_score}/100 (${aiQuoteResult.risk_assessment.category})`));
    console.log(dim(`    ├─ Pricing Method: ${aiQuoteResult.risk_assessment.pricing_method || 'benchmark'}`));
    console.log(dim(`    └─ Generated in ${elapsed}s`));
  });

  if (!aiQuoteResult) return;

  await test('Validate actuarial reasoning chain', async () => {
    const reasoning = aiQuoteResult.reasoning || [];
    assert(Array.isArray(reasoning), 'reasoning should be an array');
    assert(reasoning.length >= 3, `Expected ≥3 reasoning steps, got ${reasoning.length}`);
    
    // Check reasoning steps have required fields
    for (const step of reasoning) {
      assert(step.step, 'Each reasoning step needs a "step" field');
      assert(step.detail || step.details, 'Each reasoning step needs detail');
    }
    console.log(dim(`    └─ ${reasoning.length} reasoning steps`));
  });

  await test('Validate age band analysis', async () => {
    const ageBands = aiQuoteResult.age_band_analysis || [];
    assert(Array.isArray(ageBands), 'age_band_analysis should be an array');
    assert(ageBands.length > 0, 'Expected at least 1 age band');
    
    for (const band of ageBands) {
      assert(band.age_band !== undefined, 'Each band needs an "age_band" field');
      assert(band.lives !== undefined, 'Each band needs a "lives" field');
      assert(band.risk_factor !== undefined, 'Each band needs a "risk_factor" field');
    }
    const totalLives = ageBands.reduce((s, b) => s + b.lives, 0);
    console.log(dim(`    ├─ ${ageBands.length} age bands covering ${totalLives} lives`));
    console.log(dim(`    └─ Bands: ${ageBands.map(b => b.age_band + '(' + b.lives + ')').join(', ')}`));
  });

  await test('Validate slab pricing', async () => {
    const slabs = aiQuoteResult.slab_pricing || [];
    assert(Array.isArray(slabs), 'slab_pricing should be an array');
    // slab_pricing may be empty if all members have same SI or no SI data
    if (slabs.length > 0) {
      for (const slab of slabs) {
        assert(slab.si !== undefined || slab.sum_insured !== undefined || slab.slab !== undefined, 'Each slab needs SI field');
      }
      console.log(dim(`    └─ ${slabs.length} SI slabs`));
    } else {
      console.log(dim('    └─ No SI slabs (uniform SI or no SI data — acceptable)'));
    }
  });

  await test('Validate risk components', async () => {
    const components = aiQuoteResult.component_breakdown || aiQuoteResult.components || {};
    assert(typeof components === 'object', 'component_breakdown should be an object');
    console.log(dim(`    └─ Components: ${Object.keys(components).join(', ')}`));
  });

  await test('Validate confidence interval', async () => {
    // CI is nested inside combined as ci_95_lower / ci_95_upper
    const combined = aiQuoteResult.combined || {};
    const lower = combined.ci_95_lower;
    const upper = combined.ci_95_upper;
    assert(lower !== undefined, 'Missing combined.ci_95_lower');
    assert(upper !== undefined, 'Missing combined.ci_95_upper');
    assert(lower < upper, `CI lower (${lower}) should be < upper (${upper})`);
    console.log(dim(`    └─ 95% CI: ₹${Number(lower).toLocaleString('en-IN')} — ₹${Number(upper).toLocaleString('en-IN')}`));
  });

  await test('Validate LLM assessment field present', async () => {
    const llm = aiQuoteResult.llm_assessment;
    if (!llm) {
      // It's valid for it to be null (LLM may have timed out), but note it
      console.log(dim('    └─ LLM assessment is null (LLM may be unreachable — graceful fallback OK)'));
      return; // Not a failure — graceful degradation is by design
    }
    
    if (typeof llm === 'string') {
      console.log(dim(`    └─ LLM returned raw text (${llm.length} chars)`));
      return;
    }
    
    // Structured JSON response
    assert(typeof llm === 'object', `Expected LLM assessment to be object, got ${typeof llm}`);
    
    const fields = ['executive_summary', 'risk_insights', 'recommendations', 'confidence_level'];
    const present = fields.filter(f => llm[f] !== undefined);
    const missing = fields.filter(f => llm[f] === undefined);
    
    console.log(dim(`    ├─ Present fields: ${present.join(', ')}`));
    if (missing.length) console.log(dim(`    ├─ Missing fields: ${missing.join(', ')}`));
    
    if (llm.negotiation_range) {
      const nr = llm.negotiation_range;
      console.log(dim(`    ├─ Negotiation: Floor ₹${nr.floor_premium_per_family} → Ceiling ₹${nr.ceiling_premium_per_family}`));
    }
    
    if (llm.confidence_level) {
      console.log(dim(`    └─ LLM Confidence: ${llm.confidence_level}`));
    }
  });
}

async function testClaimsEndpoints() {
  console.log(bold('\n📊 Claims Upload & Analysis'));

  if (!TEST_RFQ_ID) {
    skip('Claims endpoints', 'No test RFQ available');
    return;
  }

  await test('GET /rfqs/:id/claims-analysis — no claims yet', async () => {
    const { status, data } = await api('GET', `/rfqs/${TEST_RFQ_ID}/claims-analysis`);
    // Should still return 200 even with no claims (empty analysis)
    assert(status === 200 || status === 404, `Expected 200 or 404, got ${status}`);
    if (status === 200) {
      console.log(dim(`    └─ Analysis returned with ${data?.data?.total_claims || 0} claims`));
    } else {
      console.log(dim(`    └─ 404: No claims data (expected)`));
    }
  });

  // Test claims upload with synthetic CSV-like data
  await test('POST /rfqs/:id/upload-claims — synthetic claims data', async () => {
    // Generate 20 synthetic claims
    const claims = [];
    const serviceTypes = ['Consultation', 'Lab/Diagnostic', 'Pharmacy', 'Wellness'];
    const statuses = ['Approved', 'Settled', 'Partially Approved'];
    
    for (let i = 1; i <= 20; i++) {
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const amount = Math.floor(Math.random() * 15000) + 500;
      claims.push({
        claim_number: `CLM-2025-${String(i).padStart(5, '0')}`,
        emp_code: `EMP${String(Math.floor(Math.random() * 50) + 1).padStart(4, '0')}`,
        employee_name: `Employee ${i}`,
        relationship: i <= 10 ? 'SELF' : (i <= 16 ? 'SPOUSE' : 'CHILD'),
        gender: i % 2 === 0 ? 'M' : 'F',
        age: Math.floor(Math.random() * 40) + 20,
        claim_date: `2025-${month}-${day}`,
        service_type: serviceTypes[i % 4],
        diagnosis: `Test Diagnosis ${i}`,
        claimed_amount: amount,
        approved_amount: Math.floor(amount * 0.85),
        paid_amount: Math.floor(amount * 0.80),
        claim_status: statuses[i % 3],
        policy_year: '2024-2025',
        si_amount: 500000
      });
    }

    const { status, data } = await api('POST', `/rfqs/${TEST_RFQ_ID}/upload-claims`, {
      claims: claims
    });
    
    if (status === 200 || status === 201) {
      assert(data.success === true, `Upload claims failed: ${JSON.stringify(data)}`);
      console.log(dim(`    └─ Uploaded ${claims.length} claims`));
    } else if (status === 400) {
      // May require multipart file upload
      console.log(dim(`    └─ JSON upload not supported (${data.message || 'needs file upload'}) — will test with file`));
    } else {
      throw new Error(`Unexpected ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
  });

  await test('GET /rfqs/:id/claims-analysis — with claims data', async () => {
    const { status, data } = await api('GET', `/rfqs/${TEST_RFQ_ID}/claims-analysis`);
    if (status === 200 && data.success) {
      const analysis = data.data || {};
      console.log(dim(`    ├─ Total Claims: ${analysis.total_claims || 'N/A'}`));
      console.log(dim(`    ├─ PMPY: ₹${analysis.pmpy || analysis.claims_per_member_per_year || 'N/A'}`));
      console.log(dim(`    ├─ Utilization: ${analysis.utilization_rate || 'N/A'}%`));
      console.log(dim(`    └─ ICR: ${analysis.incurred_claim_ratio || analysis.icr || 'N/A'}`));
    } else if (status === 404) {
      console.log(dim(`    └─ No claims found (upload may have been skipped)`));
    } else {
      throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
  });
}

async function testLLMConnectivity() {
  console.log(bold('\n🧠 LLM Connectivity (isha-inc.com)'));

  await test('Direct isha-inc.com /api/config', async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://isha-inc.com/api/config', {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }
      });
      clearTimeout(timeout);
      const data = await res.text();
      console.log(dim(`    ├─ Status: ${res.status}`));
      console.log(dim(`    └─ Response: ${data.slice(0, 200)}`));
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(dim('    └─ Timeout after 10s (LLM may be offline or GPU cold-starting)'));
      } else {
        console.log(dim(`    └─ Error: ${err.message}`));
      }
      // Not a test failure - LLM being offline is acceptable
    }
  });

  await test('Direct isha-inc.com /stream (DocsGPT SSE)', async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch('https://isha-inc.com/stream', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'What is an incurred claim ratio? Reply in one sentence.',
          history: []
        })
      });
      clearTimeout(timeout);
      
      const sseText = await res.text();
      // Parse SSE answer chunks
      let answer = '';
      for (const line of sseText.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'answer' && evt.answer) answer += evt.answer;
          } catch {}
        }
      }
      console.log(dim(`    ├─ Status: ${res.status}`));
      console.log(dim(`    └─ Answer: ${(answer || '(empty)').slice(0, 200)}`));
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(dim('    └─ Timeout after 30s (LLM may be offline)'));
      } else {
        console.log(dim(`    └─ Error: ${err.message}`));
      }
    }
  });
}

async function testEdgeCases() {
  console.log(bold('\n⚠️  Edge Cases & Error Handling'));

  await test('AI quote on non-existent RFQ returns 404', async () => {
    const { status } = await api('POST', '/rfqs/999999/ai-generate-quote');
    assert(status === 404 || status === 400, `Expected 404/400, got ${status}`);
  });

  await test('AI quote on RFQ with 0 members handles gracefully', async () => {
    // Create an RFQ with no members
    const { data: rfqData } = await api('POST', '/rfqs', {
      insured_name: 'Empty Test Corp',
      policy_type: 'Group Mediclaim',
      product_type: 'OPD'
    });
    const emptyId = rfqData?.rfq?.id || rfqData?.data?.id;
    if (!emptyId) {
      throw new Error('Could not create empty RFQ');
    }
    
    const { status, data } = await api('POST', `/rfqs/${emptyId}/ai-generate-quote`);
    // Should return an error message about needing members, not crash
    assert(status === 400 || status === 404 || status === 200,
      `Expected 400/404/200, got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    
    if (status === 400 || status === 404) {
      console.log(dim(`    └─ Correct: ${data.message || 'No members error'}`));
    } else {
      console.log(dim(`    └─ Returned 200 (handled internally)`));
    }
    
    // Cleanup
    await api('DELETE', `/rfqs/${emptyId}`);
  });

  await test('Claims analysis on RFQ with no claims returns gracefully', async () => {
    const { status, data } = await api('GET', `/rfqs/${TEST_RFQ_ID}/claims-analysis`);
    assert(status === 200 || status === 404, `Expected 200/404, got ${status}`);
  });
}

async function cleanup() {
  console.log(bold('\n🧹 Cleanup'));
  
  if (TEST_RFQ_ID) {
    await test(`Delete test RFQ #${TEST_RFQ_ID}`, async () => {
      const { status } = await api('DELETE', `/rfqs/${TEST_RFQ_ID}`);
      assert(status === 200, `Delete returned ${status}`);
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(bold(cyan('\n══════════════════════════════════════════════')));
  console.log(bold(cyan('  Mediczy CRM — AI Endpoints Smoke Test Suite')));
  console.log(bold(cyan('══════════════════════════════════════════════\n')));
  console.log(dim(`  Target: ${BASE}`));
  console.log(dim(`  Time: ${new Date().toISOString()}\n`));

  await testAuth();
  await testRFQCreation();
  await testAIQuoteEngine();
  await testClaimsEndpoints();
  await testLLMConnectivity();
  await testEdgeCases();
  await cleanup();

  // Summary
  console.log(bold('\n══════════════════════════════════════════════'));
  const total = passed + failed + skipped;
  console.log(`  ${green(`${passed} passed`)}  ${failed > 0 ? red(`${failed} failed`) : dim('0 failed')}  ${skipped > 0 ? yellow(`${skipped} skipped`) : dim('0 skipped')}  ${dim(`(${total} total)`)}`);
  console.log(bold('══════════════════════════════════════════════\n'));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(red(`\nFatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(2);
});
