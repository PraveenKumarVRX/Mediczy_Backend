/**
 * Smoke Test — Lab Flow & Activity Monitor APIs
 * Run: node server/scripts/smoke-test-lab-activity-api.mjs
 */

import jwt from 'jsonwebtoken';
import pg from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') });

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).toLowerCase() === 'true';
}

const useSSL = envFlag('POSTGRES_SSL') || String(process.env.PGSSLMODE || '').toLowerCase() === 'require';
const pgSsl = useSSL ? { rejectUnauthorized: false } : false;

const BASE = 'http://localhost:8888/v1';
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: pgSsl })
  : new pg.Pool({
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      user: process.env.POSTGRES_USER || 'mediczy_helper',
      password: process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
      ssl: pgSsl,
    });

let tenantId, userId, token;
let passed = 0, failed = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function req(method, path, body, authToken = token) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, body: json };
}

// ── Setup: create test tenant & user, mint JWT ────────────────────────────────

async function setup() {
  // Get first active tenant
  let r = await pool.query("SELECT id FROM tenants WHERE status='active' LIMIT 1");
  if (r.rows.length === 0) r = await pool.query("SELECT id FROM tenants LIMIT 1");
  tenantId = r.rows[0].id;

  // Get or create a test api_user
  const uid = 'smoke-test-user-001';
  const existing = await pool.query(
    "SELECT user_id FROM api_users WHERE user_id=$1 AND tenant_id=$2", [uid, tenantId]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO api_users (user_id, tenant_id, external_user_id, email, first_name, last_name, status, email_verified)
       VALUES ($1, $2, $3, 'smoketest@mediczy.com', 'Smoke', 'Tester', 'active', true)
       ON CONFLICT DO NOTHING`,
      [uid, tenantId, `ext-${uid}`]
    );
  }
  userId = uid;

  // Mint a valid JWT directly (no ABHA round-trip needed for local test)
  const secret = process.env.JWT_SECRET || 'mediczy-platform-secret-key-change-in-production';
  token = jwt.sign(
    {
      user_id: userId,
      tenant_id: tenantId,
      email: 'smoketest@mediczy.com',
      scopes: ['activity.read', 'activity.write', 'labs.read', 'labs.write'],
      role: 'patient'
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'mediczy-api', subject: userId }
  );

  console.log(`\n  Tenant: ${tenantId}  User: ${userId}\n`);
}

// ── Lab API Tests ─────────────────────────────────────────────────────────────

async function testLabAPIs() {
  console.log('\n─── Lab Flow API ───────────────────────────────────────');

  await test('GET /labs/categories returns 200', async () => {
    const { status } = await req('GET', `/${tenantId}/labs/categories`);
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await test('GET /labs/tests returns paginated list', async () => {
    const { status, body } = await req('GET', `/${tenantId}/labs/tests?page=1&limit=5`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(typeof body.pagination !== 'undefined', 'Missing pagination');
    assert(Array.isArray(body.data), 'data must be array');
  });

  await test('GET /labs/tests?search=blood returns filtered list', async () => {
    const { status, body } = await req('GET', `/${tenantId}/labs/tests?search=blood`);
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await test('GET /labs/partners returns 200', async () => {
    const { status } = await req('GET', `/${tenantId}/labs/partners`);
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await test('GET /labs/slots returns time slots', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await req('GET', `/${tenantId}/labs/slots?date=${today}&collection_type=home-collection`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body.slots), 'slots must be an array');
    assert(body.slots.length > 0, 'At least 1 slot expected');
  });

  let bookingId;
  await test('POST /labs/bookings creates a booking', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await req('POST', `/${tenantId}/labs/bookings`, {
      user_id: userId,
      tests: [{ test_id: 'test-001', name: 'CBC', price: 299 }],
      collection_type: 'home-collection',
      collection_date: today,
      collection_time_slot: '07:00 AM – 09:00 AM',
      collection_address: { street: '12 MG Road', city: 'Bengaluru', pincode: '560001' },
      patient_name: 'Smoke Tester',
      patient_age: 30,
      patient_gender: 'male',
      total_amount: 299
    });
    assert(status === 201, `Expected 201, got ${status} — ${JSON.stringify(body)}`);
    assert(body.booking_id, 'booking_id missing');
    bookingId = body.booking_id;
  });

  await test('GET /labs/bookings lists user bookings', async () => {
    const { status, body } = await req('GET', `/${tenantId}/labs/bookings?userId=${userId}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(typeof body.pagination !== 'undefined', 'Missing pagination');
  });

  if (bookingId) {
    await test('GET /labs/bookings/:id returns booking detail', async () => {
      const { status, body } = await req('GET', `/${tenantId}/labs/bookings/${bookingId}`);
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.booking_id === bookingId, 'booking_id mismatch');
    });

    await test('PUT /labs/bookings/:id/status updates to confirmed', async () => {
      const { status, body } = await req('PUT', `/${tenantId}/labs/bookings/${bookingId}/status`, {
        status: 'confirmed'
      });
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.status === 'confirmed', `Expected confirmed, got ${body.status}`);
    });

    await test('POST /labs/bookings/:id/payment initiates payment', async () => {
      const { status, body } = await req('POST', `/${tenantId}/labs/bookings/${bookingId}/payment`, {});
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.payment_status !== undefined, 'payment_status missing');
    });

    await test('POST /labs/bookings/:id/report uploads report URL', async () => {
      const { status, body } = await req('POST', `/${tenantId}/labs/bookings/${bookingId}/report`, {
        report_url: 'https://reports.mediczy.com/test-report-001.pdf'
      });
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.report_url !== null, 'report_url should be set');
    });

    await test('GET /labs/bookings/:id/report returns report detail', async () => {
      const { status, body } = await req('GET', `/${tenantId}/labs/bookings/${bookingId}/report`);
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.report_url, 'report_url missing');
    });

    // Create fresh booking for cancel test
    let cancelBookingId;
    const today = new Date().toISOString().split('T')[0];
    const cb = await req('POST', `/${tenantId}/labs/bookings`, {
      user_id: userId,
      tests: [{ test_id: 'test-002', name: 'Lipid Panel', price: 599 }],
      collection_type: 'lab-visit',
      patient_name: 'Smoke Tester',
      patient_age: 30,
      patient_gender: 'male',
      total_amount: 599
    });
    if (cb.status === 201) cancelBookingId = cb.body.booking_id;

    await test('POST /labs/bookings/:id/cancel cancels booking', async () => {
      assert(cancelBookingId, 'No cancel booking created');
      const { status, body } = await req('POST', `/${tenantId}/labs/bookings/${cancelBookingId}/cancel`, {
        reason: 'Patient request'
      });
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.status === 'cancelled', `Expected cancelled, got ${body.status}`);
    });
  }
}

// ── Activity Monitor Tests ────────────────────────────────────────────────────

async function testActivityAPIs() {
  console.log('\n─── Activity Monitor API ───────────────────────────────');

  const today = new Date().toISOString().split('T')[0];
  let activityId;

  // ---- Log single entries for all 5 metrics ----
  const metrics = [
    { metric_type: 'heart_rate', value: 72, source: 'wearable', metadata: { context: 'resting' } },
    { metric_type: 'bmi',        value: 22.5, source: 'manual' },
    { metric_type: 'calories',   value: 450, source: 'fitbit' },
    { metric_type: 'distance',   value: 3.2, source: 'google_fit' },
    { metric_type: 'sleep',      value: 7.5, source: 'apple_health', metadata: { stages: { deep: 1.5, rem: 2.0, light: 4.0 } } }
  ];

  for (const m of metrics) {
    await test(`POST /activity/log — ${m.metric_type}`, async () => {
      const { status, body } = await req('POST', `/${tenantId}/activity/log`, {
        user_id: userId,
        ...m,
        recorded_at: new Date().toISOString()
      });
      assert(status === 201, `Expected 201, got ${status} — ${JSON.stringify(body)}`);
      assert(body.activity_id, 'activity_id missing');
      if (m.metric_type === 'heart_rate') activityId = body.activity_id;
    });
  }

  // ---- Batch log ----
  await test('POST /activity/log/batch logs 3 entries', async () => {
    const { status, body } = await req('POST', `/${tenantId}/activity/log/batch`, {
      user_id: userId,
      entries: [
        { metric_type: 'heart_rate', value: 85, source: 'wearable', recorded_at: new Date().toISOString() },
        { metric_type: 'calories', value: 200, source: 'manual', recorded_at: new Date().toISOString() },
        { metric_type: 'distance', value: 1.1, source: 'manual', recorded_at: new Date().toISOString() }
      ]
    });
    assert(status === 201, `Expected 201, got ${status} — ${JSON.stringify(body)}`);
    assert(body.logged === 3, `Expected 3 logged, got ${body.logged}`);
  });

  // ---- Per-metric GET (daily) ----
  const metricEndpoints = ['heart-rate', 'bmi', 'calories', 'distance', 'sleep'];
  for (const ep of metricEndpoints) {
    await test(`GET /activity/${ep}?period=daily`, async () => {
      const { status, body } = await req('GET', `/${tenantId}/activity/${ep}?user_id=${userId}&period=daily`);
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.summary !== undefined, 'summary missing');
      assert(Array.isArray(body.data_points), 'data_points must be array');
      assert(body.summary.count > 0, `Expected at least 1 data point for ${ep}`);
    });
  }

  // ---- Weekly summary ----
  await test('GET /activity/heart-rate?period=weekly', async () => {
    const { status, body } = await req('GET', `/${tenantId}/activity/heart-rate?user_id=${userId}&period=weekly`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.period === 'weekly', 'period should be weekly');
    assert(body.summary.daily_breakdown !== undefined, 'daily_breakdown missing for weekly');
  });

  // ---- Monthly summary ----
  await test('GET /activity/calories?period=monthly', async () => {
    const { status, body } = await req('GET', `/${tenantId}/activity/calories?user_id=${userId}&period=monthly`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.period === 'monthly', 'period should be monthly');
  });

  // ---- Dashboard summary (all 5 metrics) ----
  await test('GET /activity/summary returns all 5 metrics', async () => {
    const { status, body } = await req('GET', `/${tenantId}/activity/summary?user_id=${userId}&period=daily`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.metrics !== undefined, 'metrics missing');
    const keys = Object.keys(body.metrics);
    assert(keys.includes('heart_rate'), 'heart_rate missing from dashboard');
    assert(keys.includes('sleep'), 'sleep missing from dashboard');
    assert(keys.length === 5, `Expected 5 metric keys, got ${keys.length}`);
  });

  // ---- Explicit date range ----
  await test('GET /activity/distance?start_date&end_date', async () => {
    const { status, body } = await req('GET',
      `/${tenantId}/activity/distance?user_id=${userId}&start_date=${today}&end_date=${today}`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.start_date === today && body.end_date === today, 'Date range mismatch');
  });

  // ---- Update entry ----
  if (activityId) {
    await test(`PUT /activity/:id updates heart_rate value`, async () => {
      const { status, body } = await req('PUT', `/${tenantId}/activity/${activityId}`, {
        user_id: userId,
        value: 68,
        notes: 'Updated during smoke test'
      });
      assert(status === 200, `Expected 200, got ${status}`);
      assert(parseFloat(body.value) === 68, `Expected 68, got ${body.value}`);
    });

    await test(`DELETE /activity/:id soft-deletes entry`, async () => {
      const { status, body } = await req('DELETE',
        `/${tenantId}/activity/${activityId}?user_id=${userId}`
      );
      assert(status === 200, `Expected 200, got ${status}`);
      assert(body.deleted === true, 'deleted should be true');
    });
  }

  // ---- Validation errors ----
  await test('POST /activity/log rejects invalid metric_type', async () => {
    const { status } = await req('POST', `/${tenantId}/activity/log`, {
      user_id: userId,
      metric_type: 'invalid_metric',
      value: 100
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('GET /activity/summary rejects missing user_id', async () => {
    const { status } = await req('GET', `/${tenantId}/activity/summary`);
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('GET /activity/heart-rate rejects invalid period', async () => {
    const { status } = await req('GET', `/${tenantId}/activity/heart-rate?user_id=${userId}&period=yearly`);
    assert(status === 400, `Expected 400, got ${status}`);
  });
}

// ── Auth tests ────────────────────────────────────────────────────────────────

async function testAuthGuards() {
  console.log('\n─── Auth Guard Tests ───────────────────────────────────');

  await test('GET /activity/summary without token returns 401', async () => {
    const { status } = await req('GET', `/${tenantId}/activity/summary?user_id=${userId}`, null, null);
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('GET /labs/tests without token returns 401', async () => {
    const { status } = await req('GET', `/${tenantId}/labs/tests`, null, null);
    assert(status === 401, `Expected 401, got ${status}`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  Lab Flow & Activity Monitor API — Smoke Test           ║');
console.log('╚══════════════════════════════════════════════════════════╝');

try {
  await setup();
  await testLabAPIs();
  await testActivityAPIs();
  await testAuthGuards();
} finally {
  await pool.end();
}

const total = passed + failed;
console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
if (failed === 0) {
  console.log(`  STATUS: ALL TESTS PASSED ✅`);
} else {
  console.log(`  STATUS: ${failed} TEST(S) FAILED ❌`);
}
console.log(`══════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
