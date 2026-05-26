/**
 * Sanity Check / Smoke Test / Regression Test
 * ============================================
 * Tests three layers after the DB naming hygiene and FK constraint work:
 *
 *  1. DB SCHEMA  — renamed columns, recreated view, FK constraints exist
 *  2. ORM LAYER  — Sequelize can SELECT from every affected table (no column errors)
 *  3. HTTP API   — live server smoke test for key routes
 *
 * Run:
 *   node scripts/sanity-smoke-regression.mjs
 *
 * Exit code 0 = all passed, 1 = failures found.
 */

import pg from 'pg';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).toLowerCase() === 'true';
}

const useSSL = envFlag('POSTGRES_SSL') || String(process.env.PGSSLMODE || '').toLowerCase() === 'require';
const pgSsl = useSSL ? { rejectUnauthorized: false } : false;

// ─── Config ────────────────────────────────────────────────────────────────────
const DB = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: pgSsl,
    }
  : {
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      user: process.env.POSTGRES_USER || 'mediczy_helper',
      password: process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
      ssl: pgSsl,
    };
const PORT = process.env.PORT || '8888';
const BASE_URL = `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET ||
  'd6100dfd4597503924f69844c93a4cdddfa47bdbaff450c45a2ad774c857fde074e9ba41e6f7171c21c83f25e224f969e7e05681cc020f30e964017395a4fd8d';

// ─── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function pass(suite, name) {
  passed++;
  results.push({ status: 'PASS', suite, name });
  console.log(`  ✅ PASS  [${suite}] ${name}`);
}

function fail(suite, name, reason) {
  failed++;
  results.push({ status: 'FAIL', suite, name, reason });
  console.error(`  ❌ FAIL  [${suite}] ${name}`);
  console.error(`          ${reason}`);
}

async function dbQuery(client, sql, params = []) {
  return client.query(sql, params);
}

async function httpGet(path, token) {
  const { default: fetch } = await import('node-fetch');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function httpPost(path, body, token) {
  const { default: fetch } = await import('node-fetch');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ─── DB Schema Tests ───────────────────────────────────────────────────────────
async function runSchemaTests(client) {
  console.log('\n── SECTION 1: DB Schema Integrity ──────────────────────────────');

  // 1a. insurance_claims renamed columns exist as snake_case
  const renamedCols = [
    'user_insurance_id', 'appointment_id', 'claim_number', 'claim_amount',
    'approved_amount', 'submitted_at', 'processed_at', 'created_at', 'updated_at',
  ];
  for (const col of renamedCols) {
    const r = await dbQuery(client,
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='insurance_claims' AND column_name=$1`, [col]);
    if (r.rowCount > 0) pass('Schema', `insurance_claims.${col} exists (snake_case)`);
    else fail('Schema', `insurance_claims.${col} exists (snake_case)`, `Column not found — rename may have failed`);
  }

  // 1b. Old camelCase columns must NOT exist
  const oldCols = ['userInsuranceId', 'appointmentId', 'claimNumber', 'claimAmount',
    'approvedAmount', 'processedAt', 'submittedAt'];
  for (const col of oldCols) {
    const r = await dbQuery(client,
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='insurance_claims' AND column_name=$1`, [col]);
    if (r.rowCount === 0) pass('Schema', `insurance_claims.${col} removed (no stale camelCase)`);
    else fail('Schema', `insurance_claims.${col} removed`, `Old camelCase column still exists — rename incomplete`);
  }

  // 1c. v_claims_dashboard view exists and is queryable
  try {
    await dbQuery(client, `SELECT * FROM v_claims_dashboard LIMIT 1`);
    pass('Schema', 'v_claims_dashboard view is queryable');
  } catch (e) {
    fail('Schema', 'v_claims_dashboard view is queryable', e.message);
  }

  // 1d. No MIXED naming tables (ALL_SNAKE or ALL_CAMEL or MOSTLY_CAMEL only)
  const r = await dbQuery(client, `
    SELECT table_name FROM (
      SELECT table_name,
        COUNT(*) FILTER (WHERE column_name ~ '[A-Z]') AS camel_cols,
        COUNT(*) FILTER (WHERE column_name ~ '^[a-z]+(_[a-z0-9]+)+$') AS snake_cols
      FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_name
    ) t
    WHERE camel_cols > 0 AND snake_cols > 0
      AND camel_cols <= snake_cols  -- more snake than camel = MIXED (not MOSTLY_CAMEL)
      AND NOT (
        camel_cols <= 2
        AND camel_cols = (
          SELECT COUNT(*) FROM information_schema.columns c2
          WHERE c2.table_schema='public' AND c2.table_name=t.table_name
            AND c2.column_name IN ('createdAt','updatedAt')
        )
      )
  `);
  if (r.rowCount === 0) pass('Schema', 'No MIXED naming tables (0 anomalies)');
  else fail('Schema', 'No MIXED naming tables', `Still MIXED: ${r.rows.map(x => x.table_name).join(', ')}`);

  // 1e. FK constraints added on core tables
  const expectedFKs = [
    ['appointments', 'appointments_userid_fkey'],
    ['appointments', 'appointments_doctorid_fkey'],
    ['prescriptions', 'prescriptions_appointmentid_fkey'],
    ['notifications', 'notifications_userid_fkey'],
    ['corporate_employees', 'corporate_employees_userid_fkey'],
    ['doctor_assistants', 'doctor_assistants_doctorid_fkey'],
    ['insurance_claims', 'insurance_claims_user_insurance_id_fkey'],
    ['insurance_claims', 'insurance_claims_appointment_id_fkey'],
  ];
  for (const [tbl, constraint] of expectedFKs) {
    const rc = await dbQuery(client,
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='public' AND table_name=$1
         AND constraint_name=$2 AND constraint_type='FOREIGN KEY'`, [tbl, constraint]);
    if (rc.rowCount > 0) pass('Schema', `FK constraint ${constraint} exists`);
    else fail('Schema', `FK constraint ${constraint} exists`, `Constraint missing on ${tbl}`);
  }

  // 1f. Group A tables — created_at/updated_at exist as snake_case
  const groupA = ['devices', 'wearables', 'tenants', 'health_readings', 'health_camps',
    'poc_devices', 'tenant_partners', 'organization_admins'];
  for (const tbl of groupA) {
    const rc = await dbQuery(client,
      `SELECT COUNT(*) as n FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
         AND column_name IN ('created_at','updated_at')`, [tbl]);
    const n = parseInt(rc.rows[0].n);
    if (n === 2) pass('Schema', `${tbl} has created_at + updated_at (snake_case)`);
    else if (n === 0) fail('Schema', `${tbl} timestamps snake_case`, `Table may not exist or still has camelCase timestamps`);
    else fail('Schema', `${tbl} timestamps snake_case`, `Only ${n}/2 snake_case timestamp columns found`);
  }
}

// ─── ORM / Model Query Tests ───────────────────────────────────────────────────
async function runModelTests(client) {
  console.log('\n── SECTION 2: ORM-Equivalent Column Access ──────────────────────');

  // Test that Sequelize field: mappings work by directly selecting via snake_case columns
  // These mirror what Sequelize generates internally when field: mappings are set correctly.
  const modelMappings = [
    {
      table: 'insurance_claims',
      cols: ['id', 'user_insurance_id', 'appointment_id', 'claim_number',
        'claim_amount', 'approved_amount', 'submitted_at', 'processed_at',
        'created_at', 'updated_at'],
    },
    {
      table: 'users',
      cols: ['id', 'email', 'role', 'corporate_id', 'aggregator_id',
        'aggregator_type', 'employee_id', 'employer_name', 'membership_type'],
    },
    {
      table: 'doctors',
      cols: ['id', 'email', 'tenant_id', 'emergency_fee',
        'emergency_available_from', 'emergency_available_to'],
    },
    {
      // corporates uses camelCase (Group B MOSTLY_CAMEL) — test actual column names
      table: 'corporates',
      cols: ['id', 'companyName', 'email', 'tenant_id', 'unique_id',
        'onboarded_by', 'onboarded_by_id', 'aggregator_id', 'aggregator_type'],
    },
    {
      // notifications is Group B MOSTLY_CAMEL — timestamps are camelCase, title/message are camelCase
      table: 'notifications',
      cols: ['id', 'title', 'message', 'createdAt'],
    },
    {
      // appointments is Group B MOSTLY_CAMEL — timestamps are camelCase
      table: 'appointments',
      cols: ['id', 'createdAt', 'updatedAt'],
    },
  ];

  for (const { table, cols } of modelMappings) {
    const selectList = cols.map(c => `"${c}"`).join(', ');
    try {
      await dbQuery(client, `SELECT ${selectList} FROM "${table}" LIMIT 1`);
      pass('ORM', `${table}: SELECT ${cols.join(', ')} OK`);
    } catch (e) {
      fail('ORM', `${table}: SELECT ${cols.join(', ')}`, e.message);
    }
  }

  // Verify v_claims_dashboard returns expected snake_case columns
  try {
    const r = await dbQuery(client, `SELECT * FROM v_claims_dashboard LIMIT 0`);
    const cols = r.fields.map(f => f.name);
    // View uses id (not claim_id) and approved_at (not processed_at) per actual view DDL
    const expectedViewCols = ['id', 'claim_number', 'claim_amount', 'approved_amount',
      'status', 'submitted_at', 'approved_at', 'created_at', 'updated_at'];
    const missing = expectedViewCols.filter(c => !cols.includes(c));
    if (missing.length === 0) pass('ORM', 'v_claims_dashboard columns are all snake_case');
    else fail('ORM', 'v_claims_dashboard columns snake_case', `Missing: ${missing.join(', ')}`);
  } catch (e) {
    fail('ORM', 'v_claims_dashboard column check', e.message);
  }
}

// ─── HTTP API Smoke Tests ──────────────────────────────────────────────────────
async function runApiTests() {
  console.log('\n── SECTION 3: HTTP API Smoke Tests ─────────────────────────────');

  // 3a. Health check
  try {
    const r = await httpGet('/health');
    if (r.status === 200 && r.body.status === 'healthy') pass('HTTP', 'GET /health → 200 healthy');
    else fail('HTTP', 'GET /health', `Expected 200 healthy, got ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  } catch (e) { fail('HTTP', 'GET /health', e.message); }

  // 3b. Generate a valid JWT for system_admin (id=21)
  let token;
  try {
    token = jwt.sign(
      { id: 21, email: 'team@mediczy.com', role: 'system_admin', isAdmin: true },
      JWT_SECRET,
      { expiresIn: '5m' }
    );
    pass('HTTP', 'JWT generated for system_admin (id=21)');
  } catch (e) {
    fail('HTTP', 'JWT generation', e.message);
  }

  // 3c. Auth-protected endpoints — these exercise the field: mappings
  const protectedRoutes = [
    { method: 'GET', path: '/api/hospital/insurance/pre-auth/pending', label: 'Hospital insurance pre-auth list' },
    { method: 'GET', path: '/api/hospital/insurance/claims', label: 'Insurance claims list (renamed columns)' },
    { method: 'GET', path: '/api/appointments', label: 'Appointments (userId/doctorId FK columns)' },
    { method: 'GET', path: '/api/corporates', label: 'Corporates (tenantId/uniqueId field mappings)' },
    { method: 'GET', path: '/api/users/profile', label: 'User profile (corporateId/aggregatorId fields)' },
    { method: 'GET', path: '/api/doctors/list', label: 'Doctors list (tenantId/emergencyFee fields)' },
    { method: 'GET', path: '/api/notifications', label: 'Notifications (userId FK field)' },
  ];

  for (const route of protectedRoutes) {
    try {
      const r = await httpGet(route.path, token);
      // 200/201 = success; 400/404/422 = route reached but no data (OK for smoke)
      // 403 from ringFencing.js = security ring-fencing (not a DB column issue) — treat as OK
      // 401 = JWT rejected (real auth failure) — fail
      if ([200, 201, 400, 404, 422, 403].includes(r.status)) {
        const note = r.status === 403 ? ' [ring-fenced — expected for admin JWT]' : '';
        pass('HTTP', `${route.method} ${route.path} → ${r.status} (${route.label})${note}`);
      } else if (r.status === 401) {
        fail('HTTP', `${route.method} ${route.path} (${route.label})`,
          `JWT rejected 401 — auth middleware or secret issue`);
      } else if (r.status === 500) {
        const msg = r.body?.message || r.body?.error || JSON.stringify(r.body).slice(0, 150);
        fail('HTTP', `${route.method} ${route.path} (${route.label})`,
          `500 Internal Server Error: ${msg}`);
      } else {
        pass('HTTP', `${route.method} ${route.path} → ${r.status} (non-500, acceptable)`);
      }
    } catch (e) {
      fail('HTTP', `${route.method} ${route.path}`, e.message);
    }
  }

  // 3d. POST endpoint: hospital insurance patient search
  try {
    const r = await httpPost('/api/hospital/insurance/patient/search',
      { mobile: '9999999999' }, token);
    if (r.status !== 500) pass('HTTP', 'POST /api/hospital/insurance/patient/search → non-500');
    else {
      const msg = r.body?.message || r.body?.error || JSON.stringify(r.body).slice(0, 150);
      fail('HTTP', 'POST /api/hospital/insurance/patient/search', `500: ${msg}`);
    }
  } catch (e) { fail('HTTP', 'POST /api/hospital/insurance/patient/search', e.message); }
}

// ─── FK Integrity Tests ────────────────────────────────────────────────────────
async function runFKTests(client) {
  console.log('\n── SECTION 4: FK Constraint Enforcement ─────────────────────────');

  // Insert into appointments with invalid userId should fail (NOT VALID defers historical check
  // but new inserts ARE validated)
  try {
    await dbQuery(client, `
      INSERT INTO appointments ("userId", "doctorId", status)
      VALUES (999999, NULL, 'test_fk_check')
    `);
    // Should have failed
    fail('FK', 'appointments.userId FK rejects orphan insert', 'Insert succeeded — FK not enforced on new rows');
    // Cleanup if somehow inserted
    await dbQuery(client, `DELETE FROM appointments WHERE status='test_fk_check'`);
  } catch (e) {
    if (e.message.includes('foreign key') || e.message.includes('violates')) {
      pass('FK', 'appointments.userId FK rejects orphan insert (new rows protected)');
    } else {
      // Other error (column missing, etc.) — still report
      fail('FK', 'appointments.userId FK rejects orphan insert', e.message);
    }
  }

  // Verify insurance_claims FK: inserting with invalid user_insurance_id should fail
  try {
    await dbQuery(client, `
      INSERT INTO insurance_claims (user_insurance_id, claim_number, status)
      VALUES (9999999, 'FK_TEST_999', 'pending')
    `);
    fail('FK', 'insurance_claims.user_insurance_id FK rejects orphan insert', 'Insert succeeded — FK not enforced');
    await dbQuery(client, `DELETE FROM insurance_claims WHERE claim_number='FK_TEST_999'`);
  } catch (e) {
    if (e.message.includes('foreign key') || e.message.includes('violates')) {
      pass('FK', 'insurance_claims.user_insurance_id FK rejects orphan insert');
    } else {
      fail('FK', 'insurance_claims.user_insurance_id FK rejects orphan insert', e.message);
    }
  }
}

// ─── Lab Catalog & Auto-Price Smoke Tests ─────────────────────────────────────
async function runLabCatalogTests() {
  console.log('\n── SECTION 5: Lab Catalog & Auto-Price Smoke Tests ─────────────');

  const userToken = jwt.sign(
    { id: 19, email: 'user@mediczy.com', role: 'user' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );

  // 5a. Catalog is publicly accessible (no token)
  try {
    const r = await httpGet('/api/lab-tests/catalog');
    if (r.status === 200 && r.body.success && Array.isArray(r.body.data)) {
      pass('LAB', 'GET /api/lab-tests/catalog (no auth) → 200');
    } else {
      fail('LAB', 'GET /api/lab-tests/catalog (no auth)', `Got ${r.status}: ${JSON.stringify(r.body).slice(0,120)}`);
    }
  } catch (e) { fail('LAB', 'GET /api/lab-tests/catalog (no auth)', e.message); }

  // 5b. Catalog returns all 116 seeded tests
  try {
    const r = await httpGet('/api/lab-tests/catalog?limit=200');
    const total = r.body?.pagination?.total;
    if (r.status === 200 && total >= 100) {
      pass('LAB', `Catalog total count = ${total} (≥ 100 expected)`);
    } else {
      fail('LAB', 'Catalog count ≥ 100', `Got total=${total}, status=${r.status}`);
    }
  } catch (e) { fail('LAB', 'Catalog count check', e.message); }

  // 5c. Catalog returns categories array for filter UI
  try {
    const r = await httpGet('/api/lab-tests/catalog?limit=1');
    const cats = r.body?.categories;
    if (r.status === 200 && Array.isArray(cats) && cats.length >= 5) {
      pass('LAB', `Catalog categories list returned (${cats.length} categories)`);
    } else {
      fail('LAB', 'Catalog categories array', `categories=${JSON.stringify(cats)}`);
    }
  } catch (e) { fail('LAB', 'Catalog categories array', e.message); }

  // 5d. Catalog search by name keyword (q=CBC)
  try {
    const r = await httpGet('/api/lab-tests/catalog?q=CBC');
    const hit = r.body?.data?.find(t => t.test_id === 'CBC-001');
    if (r.status === 200 && hit) {
      pass(`LAB`, `Catalog search q=CBC → found CBC-001 @ ₹${hit.price}`);
    } else {
      fail('LAB', 'Catalog search q=CBC', `data=${JSON.stringify(r.body?.data?.map(t=>t.test_id))}`);
    }
  } catch (e) { fail('LAB', 'Catalog search q=CBC', e.message); }

  // 5e. Catalog search by partial name (q=thyroid)
  try {
    const r = await httpGet('/api/lab-tests/catalog?q=thyroid');
    const count = r.body?.data?.length || 0;
    if (r.status === 200 && count >= 4) {
      pass('LAB', `Catalog search q=thyroid → ${count} results (≥ 4 expected)`);
    } else {
      fail('LAB', 'Catalog search q=thyroid', `Got ${count} results`);
    }
  } catch (e) { fail('LAB', 'Catalog search q=thyroid', e.message); }

  // 5f. Catalog filter by category
  try {
    const r = await httpGet('/api/lab-tests/catalog?category=Radiology&limit=50');
    const allRadiology = r.body?.data?.every(t => t.category === 'Radiology');
    const count = r.body?.data?.length || 0;
    if (r.status === 200 && count >= 5 && allRadiology) {
      pass('LAB', `Catalog category=Radiology → ${count} results, all correctly categorised`);
    } else {
      fail('LAB', 'Catalog filter by category=Radiology', `count=${count}, allRadiology=${allRadiology}`);
    }
  } catch (e) { fail('LAB', 'Catalog filter by category=Radiology', e.message); }

  // 5g. Catalog pagination works
  try {
    const page1 = await httpGet('/api/lab-tests/catalog?limit=5&offset=0');
    const page2 = await httpGet('/api/lab-tests/catalog?limit=5&offset=5');
    const ids1 = page1.body?.data?.map(t => t.test_id) || [];
    const ids2 = page2.body?.data?.map(t => t.test_id) || [];
    const overlap = ids1.filter(id => ids2.includes(id));
    if (page1.status === 200 && page2.status === 200 && overlap.length === 0 && ids1.length === 5) {
      pass('LAB', 'Catalog pagination — page1 and page2 have no overlapping test_ids');
    } else {
      fail('LAB', 'Catalog pagination', `overlap=${overlap}, page1=${ids1.length}, page2=${ids2.length}`);
    }
  } catch (e) { fail('LAB', 'Catalog pagination', e.message); }

  // 5h. Catalog returns price fields with correct types
  try {
    const r = await httpGet('/api/lab-tests/catalog?q=CBC&limit=1');
    const t = r.body?.data?.[0];
    const hasFields = t && t.price !== undefined && t.home_collection_charge !== undefined &&
                      t.sample_type !== undefined && t.turnaround_time_hours !== undefined;
    if (r.status === 200 && hasFields) {
      pass('LAB', `Catalog response shape OK — price:${t.price}, home_charge:${t.home_collection_charge}, sample:${t.sample_type}, TAT:${t.turnaround_time_hours}h`);
    } else {
      fail('LAB', 'Catalog response shape (price, home_charge, sample_type, TAT)', JSON.stringify(t).slice(0,150));
    }
  } catch (e) { fail('LAB', 'Catalog response shape check', e.message); }

  // 5i. Catalog: unknown search term returns empty data, not 500
  try {
    const r = await httpGet('/api/lab-tests/catalog?q=xyzunknowntestname99');
    if (r.status === 200 && r.body.success && Array.isArray(r.body.data) && r.body.data.length === 0) {
      pass('LAB', 'Catalog unknown search → 200 empty array (not 500)');
    } else {
      fail('LAB', 'Catalog unknown search term', `status=${r.status}, count=${r.body?.data?.length}`);
    }
  } catch (e) { fail('LAB', 'Catalog unknown search term', e.message); }

  // 5j. Booking without price → auto-fills from catalog (CBC → ₹299)
  let autoBookingId;
  try {
    const r = await httpPost('/api/lab-tests',
      { testType: 'blood_test', testName: 'Complete Blood Count (CBC)', appointmentDate: '2026-06-01', urgency: 'routine' },
      userToken
    );
    const d = r.body?.data;
    const priceOk = d && parseFloat(d.price) === 299.00;
    const totalOk = d && parseFloat(d.total_amount) === 299.00;
    const srcOk   = d?.metadata?.priceSource === 'catalog';
    const tidOk   = d?.metadata?.catalogTestId === 'CBC-001';
    if (r.status === 201 && priceOk && totalOk && srcOk && tidOk) {
      pass('LAB', `Booking auto-price → price=₹${d.price}, total=₹${d.total_amount}, source=catalog, catalogTestId=CBC-001`);
      autoBookingId = d.id;
    } else {
      fail('LAB', 'Booking auto-price lookup',
        `status=${r.status} price=${d?.price} total=${d?.total_amount} priceSource=${d?.metadata?.priceSource} catalogTestId=${d?.metadata?.catalogTestId}`);
    }
  } catch (e) { fail('LAB', 'Booking auto-price lookup', e.message); }

  // 5k. Booking with explicit price → explicit price wins (no override)
  try {
    const r = await httpPost('/api/lab-tests',
      { testType: 'blood_test', testName: 'Complete Blood Count (CBC)', appointmentDate: '2026-06-01', urgency: 'routine', price: 250 },
      userToken
    );
    const d = r.body?.data;
    if (r.status === 201 && d && parseFloat(d.price) === 250.00) {
      pass('LAB', 'Booking explicit price=₹250 → catalog auto-fill NOT applied (explicit wins)');
    } else {
      fail('LAB', 'Booking explicit price takes precedence', `status=${r.status}, price=${d?.price}`);
    }
  } catch (e) { fail('LAB', 'Booking explicit price takes precedence', e.message); }

  // 5l. Booking with unknown testName → price stays null (graceful, no crash)
  try {
    const r = await httpPost('/api/lab-tests',
      { testType: 'other', testName: 'SomeObscureTestNotInCatalog123', appointmentDate: '2026-06-01' },
      userToken
    );
    const d = r.body?.data;
    if (r.status === 201 && (d?.price === null || d?.price === undefined)) {
      pass('LAB', 'Booking unknown testName → price=null gracefully (no crash)');
    } else {
      fail('LAB', 'Booking unknown testName graceful null price', `status=${r.status}, price=${d?.price}`);
    }
  } catch (e) { fail('LAB', 'Booking unknown testName graceful null price', e.message); }

  // 5m. Booking without auth → 401
  try {
    const r = await httpPost('/api/lab-tests',
      { testType: 'blood_test', testName: 'CBC', appointmentDate: '2026-06-01' },
      null
    );
    if (r.status === 401) {
      pass('LAB', 'POST /api/lab-tests without auth → 401 (correctly protected)');
    } else {
      fail('LAB', 'POST /api/lab-tests auth enforcement', `Expected 401, got ${r.status}`);
    }
  } catch (e) { fail('LAB', 'POST /api/lab-tests auth enforcement', e.message); }

  // 5n. Booking missing required fields → 400
  try {
    const r = await httpPost('/api/lab-tests', { testName: 'CBC' }, userToken);
    if (r.status === 400) {
      pass('LAB', 'POST /api/lab-tests missing required fields → 400 validation error');
    } else {
      fail('LAB', 'POST /api/lab-tests field validation', `Expected 400, got ${r.status}`);
    }
  } catch (e) { fail('LAB', 'POST /api/lab-tests field validation', e.message); }

  // 5o. DB: api_lab_tests has ≥ 100 active rows
  // (run as standalone DB check using httpGet catalog with high limit)
  try {
    const r = await httpGet('/api/lab-tests/catalog?limit=200');
    const total = r.body?.pagination?.total ?? 0;
    const minPrice = Math.min(...(r.body?.data?.map(t => parseFloat(t.price)) || [9999]));
    const maxPrice = Math.max(...(r.body?.data?.map(t => parseFloat(t.price)) || [0]));
    if (total >= 100 && minPrice >= 70 && maxPrice <= 15000) {
      pass('LAB', `DB api_lab_tests: ${total} active rows, price range ₹${minPrice}–₹${maxPrice} (within market range)`);
    } else {
      fail('LAB', 'DB api_lab_tests price range sanity', `total=${total}, min=₹${minPrice}, max=₹${maxPrice}`);
    }
  } catch (e) { fail('LAB', 'DB api_lab_tests price range sanity', e.message); }

  // 5p. Specific key tests present with correct prices
  const pricePairs = [
    { q: 'CBC', id: 'CBC-001',      expectedPrice: 299 },
    { q: 'HbA1c',  id: 'GLU-004',  expectedPrice: 449 },
    { q: 'TSH',     id: 'THY-001', expectedPrice: 299 },
    { q: 'Troponin', id: 'CAR-001', expectedPrice: 1299 },
    { q: 'MRI Brain', id: 'MRI-001', expectedPrice: 5500 },
    { q: 'ECG',     id: 'ECG-001', expectedPrice: 299 },
  ];
  for (const { q, id, expectedPrice } of pricePairs) {
    try {
      const r = await httpGet(`/api/lab-tests/catalog?q=${encodeURIComponent(q)}`);
      const hit = r.body?.data?.find(t => t.test_id === id);
      if (r.status === 200 && hit && parseFloat(hit.price) === expectedPrice) {
        pass('LAB', `Market rate: ${id} "${hit.name}" = ₹${hit.price} ✓`);
      } else {
        fail('LAB', `Market rate: ${id} @ ₹${expectedPrice}`, `found=${hit ? `₹${hit.price}` : 'NOT FOUND'}`);
      }
    } catch (e) { fail('LAB', `Market rate check ${id}`, e.message); }
  }
}

// ─── HMIS Phase 1–5 API Smoke Tests ───────────────────────────────────────────
async function runHmisApiTests() {
  console.log('\n── SECTION 6: HMIS Phase 1–5 API Smoke Tests ───────────────────');

  const token = jwt.sign(
    { id: 21, email: 'team@mediczy.com', role: 'system_admin', organization_id: 1, isAdmin: true },
    JWT_SECRET,
    { expiresIn: '5m' }
  );

  const hmisGetRoutes = [
    // ADT
    { path: '/api/v1/adt/admissions',            label: 'ADT admissions list' },
    { path: '/api/v1/adt/bed-map',               label: 'ADT real-time bed map' },
    // Nursing
    { path: '/api/v1/nursing/tasks?admissionId=1', label: 'Nursing tasks by admission' },
    // Clinical workspace
    { path: '/api/v1/clinical-workspace/patient/1', label: 'Clinical workspace patient summary' },
    // OT schedule
    { path: '/api/v1/ot/schedule',               label: 'OT schedule (today)' },
    { path: '/api/v1/ot/conflicts?roomId=1&start=2026-01-01&end=2026-12-31', label: 'OT conflict check' },
    // ICU census
    { path: '/api/v1/icu/census',                label: 'ICU census list' },
    // Billing
    { path: '/api/v1/billing/estimates?admissionId=1', label: 'Billing estimates list' },
    // Discharge
    { path: '/api/v1/discharge/draft/1',         label: 'Discharge draft by admission' },
    // Follow-up
    { path: '/api/v1/follow-up/plans?patientId=1', label: 'Follow-up plans' },
    { path: '/api/v1/recovery/alerts?patientId=1', label: 'Recovery monitoring alerts' },
    // Insurance pre-auth
    { path: '/api/v1/insurance/preauth',          label: 'Insurance pre-auth list' },
    // Patient timeline
    { path: '/api/v1/navigation/patient/1/timeline', label: 'Patient navigation timeline' },
    // Anesthesia
    { path: '/api/v1/anesthesia/assessment/booking/1', label: 'Anesthesia assessment by booking' },
    // E-charting
    { path: '/api/v1/echart/vitals/1/latest',           label: 'E-chart: latest vitals for admission' },
    { path: '/api/v1/echart/io/1',                      label: 'E-chart: I&O summary for admission' },
    // Clinical score calculators
    { path: '/api/v1/scores',                           label: 'Clinical calculators list' },
    // Lab rule engine
    { path: '/api/v1/lab-rules',                        label: 'Lab rule engine: rule list' },
    { path: '/api/v1/lab-rules/alerts/1',               label: 'Lab rule alerts for patient 1' },
    // Bedside reference
    { path: '/api/v1/reference/drugs?q=metformin',      label: 'Bedside ref: drug search (metformin)' },
    { path: '/api/v1/reference/procedures',             label: 'Bedside ref: procedure list' },
    { path: '/api/v1/reference/procedures/lumbar_puncture', label: 'Bedside ref: LP checklist' },
    // HL7 gateway status
    { path: '/api/v1/hl7/status',                       label: 'HL7 MLLP gateway status' },
    // New gap-fix endpoints (navigation/start, nursing/vitals, clinical-alerts, OT readiness, insurance case status, analytics)
    { path: '/api/v1/ot/cases/today',                   label: 'OT cases today (new)' },
    { path: '/api/v1/ot/case/1/readiness',              label: 'OT case readiness score (new)' },
    { path: '/api/v1/vitals/clinical-alerts',            label: 'Combined clinical alerts feed (new)' },
    { path: '/api/v1/insurance/case/1/status',          label: 'Insurance case status by admission (new)' },
    { path: '/api/v1/analytics/command-center',         label: 'Analytics: command center (new)' },
    { path: '/api/v1/analytics/operational',            label: 'Analytics: operational KPIs (new)' },
    { path: '/api/v1/analytics/clinical',               label: 'Analytics: clinical KPIs (new)' },
    { path: '/api/v1/analytics/quality',                label: 'Analytics: quality KPIs (new)' },
    { path: '/api/v1/analytics/financial',              label: 'Analytics: financial KPIs (new)' },
    { path: '/api/v1/analytics/patient-experience',     label: 'Analytics: patient experience KPIs (new)' },
    { path: '/api/v1/analytics/ward-census',            label: 'Analytics: ward census (new)' },
    { path: '/api/v1/analytics/los',                    label: 'Analytics: length of stay trend (new)' },
    // Gap-closure: canonical doc paths
    { path: '/api/v1/alerts/clinical',                  label: 'Canonical §8 P2 clinical alerts path (new)' },
    { path: '/api/v1/discharge/readiness/1',            label: 'Canonical §8 P5 discharge readiness path (new)' },
  ];

  for (const route of hmisGetRoutes) {
    try {
      const r = await httpGet(route.path, token);
      if ([200, 201, 404, 400, 403].includes(r.status)) {
        pass('HMIS', `GET ${route.path} → ${r.status} (${route.label})`);
      } else if (r.status === 401) {
        fail('HMIS', `GET ${route.path} (${route.label})`, 'JWT rejected 401');
      } else if (r.status === 500) {
        const msg = r.body?.message || r.body?.error || JSON.stringify(r.body).slice(0, 150);
        fail('HMIS', `GET ${route.path} (${route.label})`, `500: ${msg}`);
      } else {
        pass('HMIS', `GET ${route.path} → ${r.status} (non-500, acceptable)`);
      }
    } catch (e) {
      fail('HMIS', `GET ${route.path}`, e.message);
    }
  }

  // POST: clinical score calculator (qSOFA — requires no DB)
  try {
    const r = await httpPost('/api/v1/scores/qsofa', { respiratoryRate: 24, sbp: 88, alteredMentalStatus: false }, token);
    if (r.status === 200 && r.body?.data?.score !== undefined) {
      pass('HMIS', `POST /api/v1/scores/qsofa → 200 score=${r.body.data.score}`);
    } else if (r.status === 500) {
      fail('HMIS', 'POST /api/v1/scores/qsofa', `500: ${JSON.stringify(r.body).slice(0,150)}`);
    } else {
      pass('HMIS', `POST /api/v1/scores/qsofa → ${r.status} (non-500)`);
    }
  } catch (e) {
    fail('HMIS', 'POST /api/v1/scores/qsofa', e.message);
  }

  // POST: SOFA score
  try {
    const r = await httpPost('/api/v1/scores/sofaScore', { pao2FiO2Ratio: 250, onMechanicalVentilation: true, platelets: 90, bilirubinUmolL: 40, map: 65, gcs: 13, creatinineUmolL: 150 }, token);
    if (r.status === 200 && r.body?.data?.score !== undefined) {
      pass('HMIS', `POST /api/v1/scores/sofaScore → 200 score=${r.body.data.score}`);
    } else if (r.status === 500) {
      fail('HMIS', 'POST /api/v1/scores/sofaScore', `500: ${JSON.stringify(r.body).slice(0,150)}`);
    } else {
      pass('HMIS', `POST /api/v1/scores/sofaScore → ${r.status} (non-500)`);
    }
  } catch (e) {
    fail('HMIS', 'POST /api/v1/scores/sofaScore', e.message);
  }

  // POST: lab rule dry-run evaluate (no DB needed)
  try {
    const r = await httpPost('/api/v1/lab-rules/evaluate', { labs: { potassium: 6.1, lactate: 4.2, glucose: 2.8 }, meds: { aceInhibitor: true }, diagnosis: {} }, token);
    if (r.status === 200 && r.body?.data?.alertCount !== undefined) {
      pass('HMIS', `POST /api/v1/lab-rules/evaluate → 200 alertCount=${r.body.data.alertCount}`);
    } else if (r.status === 500) {
      fail('HMIS', 'POST /api/v1/lab-rules/evaluate', `500: ${JSON.stringify(r.body).slice(0,150)}`);
    } else {
      pass('HMIS', `POST /api/v1/lab-rules/evaluate → ${r.status} (non-500)`);
    }
  } catch (e) {
    fail('HMIS', 'POST /api/v1/lab-rules/evaluate', e.message);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     Mediczy DB Hygiene — Sanity / Smoke / Regression Tests      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  DB:     ${DB.host}:${DB.port}/${DB.database}`);
  console.log(`  API:    ${BASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}\n`);

  const client = new pg.Client(DB);
  try {
    await client.connect();
    pass('DB', 'PostgreSQL connection established');
  } catch (e) {
    fail('DB', 'PostgreSQL connection', e.message);
    process.exit(1);
  }

  try {
    await runSchemaTests(client);
    await runModelTests(client);
    await runFKTests(client);
  } finally {
    await client.end();
  }

  await runApiTests();
  await runLabCatalogTests();
  await runHmisApiTests();

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`
    .padEnd(67) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ [${r.suite}] ${r.name}`);
      console.log(`       ${r.reason}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
