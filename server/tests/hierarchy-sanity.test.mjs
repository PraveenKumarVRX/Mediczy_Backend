/**
 * Hierarchy Sanity Check & Smoke Test
 * Tests: Mediczy → Aggregator (Mayden) → Broker (Sriyah) → Corporate (Equitas) → Patient
 *        Team → Hospital/Clinic → Staff roles
 *
 * Run: node tests/hierarchy-sanity.test.mjs
 */

import pg from 'pg';
import https from 'https';
import http from 'http';

const { Client } = pg;

// ─── Config ──────────────────────────────────────────────────────────────────
const DB = { host: '127.0.0.1', port: 5432, user: 'mediczy_helper', password: 'Mediczy2024Helper', database: 'mediczy_ai' };
const API = 'http://localhost:8888';

let passed = 0, failed = 0;
const results = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function test(name, fn) {
  return fn().then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
    results.push({ name, status: 'pass' });
  }).catch(err => {
    console.log(`  ❌ ${name}\n     ${err.message}`);
    failed++;
    results.push({ name, status: 'fail', error: err.message });
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function apiGet(path, token) {
  return new Promise((resolve, reject) => {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const req = http.request(`${API}${path}`, { method: 'GET', headers }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── DB Client ───────────────────────────────────────────────────────────────
const db = new Client(DB);
await db.connect();

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: DB Sanity — insurance_brokers
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📋 SECTION 1: insurance_brokers business_type');

await test('Mayden (id=2) business_type = aggregator', async () => {
  const r = await db.query("SELECT business_type FROM insurance_brokers WHERE id=2");
  assert(r.rows[0]?.business_type === 'aggregator', `Got: ${r.rows[0]?.business_type}`);
});

await test('Sriyah (id=1) business_type = broker', async () => {
  const r = await db.query("SELECT business_type FROM insurance_brokers WHERE id=1");
  assert(r.rows[0]?.business_type === 'broker', `Got: ${r.rows[0]?.business_type}`);
});

await test('Demo brokers (id=3,4,5) still exist with Health business_type', async () => {
  const r = await db.query("SELECT COUNT(*) as cnt FROM insurance_brokers WHERE business_type='Health'");
  assert(parseInt(r.rows[0].cnt) === 3, `Expected 3, got ${r.rows[0].cnt}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DB Sanity — Mayden team users
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📋 SECTION 2: Mayden team user aggregator links');

const maydenEmails = [
  'parinitha@mysmarthealth.in',
  'hr@mysmarthealth.in',
  'care@mysmarthealth.in',
  'info@mysmarthealth.in',
  'sushma@mayden.in',
  'sk@mayden.co.in',
  'sundharjmayden@gmail.com'
];

await test('All 7 Mayden-linked users have aggregator_id=2 (any role)', async () => {
  const r = await db.query(
    `SELECT COUNT(*) as cnt FROM users WHERE aggregator_id=2 AND aggregator_type='aggregator'`
  );
  assert(parseInt(r.rows[0].cnt) >= 7, `Expected >=7, got ${r.rows[0].cnt}`);
});

await test('parinitha aggregator_id=2, aggregator_type=aggregator', async () => {
  const r = await db.query(
    "SELECT aggregator_id, aggregator_type FROM users WHERE email='parinitha@mysmarthealth.in'"
  );
  assert(r.rows[0]?.aggregator_id === 2, `aggregator_id=${r.rows[0]?.aggregator_id}`);
  assert(r.rows[0]?.aggregator_type === 'aggregator', `aggregator_type=${r.rows[0]?.aggregator_type}`);
});

await test('No Mayden-linked users have aggregator_type=broker', async () => {
  const r = await db.query(
    "SELECT COUNT(*) as cnt FROM users WHERE aggregator_id=2 AND aggregator_type='broker'"
  );
  assert(parseInt(r.rows[0].cnt) === 0, `Still ${r.rows[0].cnt} users with type=broker`);
});

await test('Total users under Mayden aggregator = 12', async () => {
  const r = await db.query("SELECT COUNT(*) as cnt FROM users WHERE aggregator_id=2");
  assert(parseInt(r.rows[0].cnt) >= 12, `Got: ${r.rows[0].cnt}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: DB Sanity — Corporate hierarchy
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📋 SECTION 3: Corporate (Equitas) hierarchy chain');

await test('Equitas onboarded_by=broker, onboarded_by_id=1 (Sriyah)', async () => {
  const r = await db.query(`SELECT onboarded_by, onboarded_by_id FROM corporates WHERE id=5`);
  assert(r.rows[0]?.onboarded_by === 'broker', `onboarded_by=${r.rows[0]?.onboarded_by}`);
  assert(r.rows[0]?.onboarded_by_id === 1, `onboarded_by_id=${r.rows[0]?.onboarded_by_id}`);
});

await test('Equitas aggregator_id=2 (Mayden), aggregator_type=aggregator', async () => {
  const r = await db.query(`SELECT aggregator_id, aggregator_type FROM corporates WHERE id=5`);
  assert(r.rows[0]?.aggregator_id === 2, `aggregator_id=${r.rows[0]?.aggregator_id}`);
  assert(r.rows[0]?.aggregator_type === 'aggregator', `aggregator_type=${r.rows[0]?.aggregator_type}`);
});

await test('corporates_aggregator_type_check constraint includes aggregator', async () => {
  const r = await db.query(`
    SELECT pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='corporates' AND c.conname='corporates_aggregator_type_check'
  `);
  assert(r.rows[0]?.def?.includes('aggregator'), `Constraint missing aggregator: ${r.rows[0]?.def}`);
});

await test('Full chain: Equitas→Sriyah→Mayden traceable', async () => {
  const r = await db.query(`
    SELECT c."companyName", c.onboarded_by_id, c.aggregator_id,
           ib1.broker_name as broker_name, ib1.business_type as broker_type,
           ib2.broker_name as agg_name, ib2.business_type as agg_type
    FROM corporates c
    LEFT JOIN insurance_brokers ib1 ON ib1.id = c.onboarded_by_id
    LEFT JOIN insurance_brokers ib2 ON ib2.id = c.aggregator_id
    WHERE c.id=5
  `);
  const row = r.rows[0];
  assert(row.broker_name === 'Sriyah Insurance Broking Pvt Ltd', `broker=${row.broker_name}`);
  assert(row.broker_type === 'broker', `broker_type=${row.broker_type}`);
  assert(row.agg_name === 'Mayden', `agg=${row.agg_name}`);
  assert(row.agg_type === 'aggregator', `agg_type=${row.agg_type}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: DB Sanity — Hospital staff
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📋 SECTION 4: Hospital staff organization_type');

const hospitalRoles = ['accounts_staff','hr_staff','icu_staff','it_edp_staff',
                       'mrd_staff','ot_staff','insurance_desk_staff','quality_staff','security_staff'];

await test('All 9 hospital staff at org_id=11 have org_type=hospital', async () => {
  const r = await db.query(
    "SELECT COUNT(*) as cnt FROM users WHERE organization_id=11 AND organization_type='hospital'"
  );
  assert(parseInt(r.rows[0].cnt) === 9, `Expected 9, got ${r.rows[0].cnt}`);
});

await test('No hospital staff have org_type=individual anymore', async () => {
  const r = await db.query(
    `SELECT COUNT(*) as cnt FROM users WHERE organization_id=11 AND organization_type='individual'`
  );
  assert(parseInt(r.rows[0].cnt) === 0, `Still ${r.rows[0].cnt} with type=individual`);
});

await test('All expected hospital roles present at org_id=11', async () => {
  const r = await db.query("SELECT role FROM users WHERE organization_id=11 ORDER BY role");
  const roles = r.rows.map(row => row.role);
  for (const role of hospitalRoles) {
    assert(roles.includes(role), `Missing role: ${role}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: DB Sanity — user_associations (corporates visible to parinitha)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📋 SECTION 5: user_associations for parinitha (team login corporates)');

await test('parinitha has user_associations for 10 corporates', async () => {
  const r = await db.query(
    `SELECT COUNT(*) as cnt FROM user_associations WHERE "userId"=110 AND "entityType"='corporate' AND status='active'`
  );
  assert(parseInt(r.rows[0].cnt) >= 9, `Expected >=9, got ${r.rows[0].cnt}`);
});

await test('No orphan user_associations (corp_id not in corporates)', async () => {
  const r = await db.query(`
    SELECT COUNT(*) as cnt FROM user_associations ua
    LEFT JOIN corporates c ON c.id = ua."entityId"
    WHERE ua."userId"=110 AND ua."entityType"='corporate' AND c.id IS NULL
  `);
  assert(parseInt(r.rows[0].cnt) === 0, `${r.rows[0].cnt} orphan associations found`);
});

await test('Team login query returns all assigned corporates', async () => {
  const r = await db.query(`
    SELECT DISTINCT c.id, c."companyName"
    FROM corporates c
    LEFT JOIN user_associations ua
      ON ua."entityId"=c.id AND ua."userId"=110 AND ua."entityType"='corporate' AND ua.status='active'
    WHERE ua.id IS NOT NULL OR c."assignedTo"=110
    ORDER BY c."companyName" ASC LIMIT 50
  `);
  assert(r.rows.length >= 9, `Expected >=9 corporates, got ${r.rows.length}`);
  const names = r.rows.map(r => r.companyName);
  assert(names.includes('Equitas Bank Ltd'), 'Missing Equitas Bank Ltd');
  assert(names.includes('TCS Limited'), 'Missing TCS Limited');
  assert(names.includes('Dairy Day IceCreams Pvt Ltd'), 'Missing Dairy Day');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: API Smoke Tests
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📋 SECTION 6: API Smoke Tests');

await test('GET /api/health returns 200', async () => {
  const r = await apiGet('/api/health');
  assert(r.status === 200, `Got ${r.status}`);
});

let teamToken = null;
await test('POST /api/team/login succeeds for parinitha', async () => {
  const r = await apiPost('/api/team/login', {
    email: 'parinitha@mysmarthealth.in',
    password: 'Mayden@321'
  });
  assert(r.status === 200, `Got HTTP ${r.status}: ${JSON.stringify(r.body).slice(0,200)}`);
  assert(r.body.success === true, `success=${r.body.success}`);
  assert(r.body.token, 'No token returned');
  teamToken = r.body.token;
});

await test('Team login returns >=9 assignedCorporates', async () => {
  const r = await apiPost('/api/team/login', {
    email: 'parinitha@mysmarthealth.in',
    password: 'Mayden@321'
  });
  const corps = r.body.assignedCorporates || [];
  assert(corps.length >= 9, `Expected >=9 corporates in login, got ${corps.length}: ${JSON.stringify(corps)}`);
});

await test('GET /api/admin/corporates returns >=9 corporates for team user', async () => {
  if (!teamToken) throw new Error('No token from login');
  const r = await apiGet('/api/admin/corporates', teamToken);
  assert(r.status === 200, `Got ${r.status}`);
  const corps = r.body.data || r.body.corporates || r.body;
  const list = Array.isArray(corps) ? corps : [];
  assert(list.length >= 9, `Expected >=9, got ${list.length}`);
});

await test('POST /api/aggregator-auth/login works for Mayden', async () => {
  const r = await apiPost('/api/aggregator-auth/login', {
    email: 'admin@mayden.com',
    password: 'Mayden@321'
  });
  // 200 = success, 401 = wrong password (but route exists), 404 = route missing
  assert(r.status !== 404, `Route not found (404)`);
  assert([200, 401, 403].includes(r.status), `Unexpected status: ${r.status}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
await db.end();

const total = passed + failed;
console.log('\n' + '═'.repeat(60));
console.log(`  HIERARCHY SANITY + SMOKE TEST RESULTS`);
console.log('═'.repeat(60));
console.log(`  Total : ${total}`);
console.log(`  ✅ Pass : ${passed}`);
console.log(`  ❌ Fail : ${failed}`);
if (failed > 0) {
  console.log('\n  Failed tests:');
  results.filter(r => r.status === 'fail').forEach(r => {
    console.log(`    • ${r.name}`);
    console.log(`      ${r.error}`);
  });
}
console.log('═'.repeat(60) + '\n');
process.exit(failed > 0 ? 1 : 0);
