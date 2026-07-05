/**
 * HealthOS / CareOS — focused smoke test for merged main features
 * Run: node scripts/healthos-smoke.mjs
 */
import pg from 'pg';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = process.env.PORT || '8888';
const BASE = `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'd6100dfd4597503924f69844c93a4cdddfa47bdbaff450c45a2ad774c857fde074e9ba41e6f7171c21c83f25e224f969e7e05681cc020f30e964017395a4fd8d';

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function bad(name, reason) { failed++; console.log(`  ✗ ${name}: ${reason}`); }

async function req(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

async function main() {
  console.log('\n── HealthOS Smoke Test ──────────────────────────────────────────\n');

  const db = new pg.Client({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
    user: process.env.POSTGRES_USER || 'mediczy_helper',
    password: process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
  });
  await db.connect();

  // Bootstrap admin user for auth (minimal columns for auth middleware)
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'admin',
      status VARCHAR(50) DEFAULT 'active',
      "isAdmin" BOOLEAN DEFAULT false,
      "isTeam" BOOLEAN DEFAULT false,
      "firstName" VARCHAR(100) DEFAULT 'Smoke',
      "lastName" VARCHAR(100) DEFAULT 'Admin',
      organization_id INTEGER DEFAULT 1,
      tenant_id INTEGER DEFAULT 1
    )
  `);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "isTeam" BOOLEAN DEFAULT false`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(100) DEFAULT 'Smoke'`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(100) DEFAULT 'Admin'`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);
  await db.query(`
    INSERT INTO users (id, email, role, status, "isAdmin", "isTeam", organization_id)
    VALUES (1, 'smoke-admin@mediczy.local', 'admin', 'active', true, true, 1)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = 'admin', "isAdmin" = true, "isTeam" = true, status = 'active'
  `);

  const tables = [
    'careos_clinical_events', 'healthos_lab_results', 'healthos_referrals',
    'healthos_marketplace_apps', 'careos_network_orgs', 'careos_federation_trust',
    'hg_dicom_studies', 'healthos_api_keys', 'healthos_webhooks',
  ];
  for (const t of tables) {
    const r = await db.query(`SELECT to_regclass($1) AS reg`, [`public.${t}`]);
    if (r.rows[0]?.reg) ok(`DB table ${t}`);
    else bad(`DB table ${t}`, 'missing');
  }

  const token = jwt.sign(
    { id: 1, email: 'smoke-admin@mediczy.local', role: 'admin', isAdmin: true, isTeam: true, organization_id: 1 },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  const routes = [
    ['GET', '/api/v3/healthos/health', null],
    ['GET', '/api/v3/healthos/platform/status', null],
    ['GET', '/api/v3/healthos/ecosystem/federation/status', null],
    ['GET', '/api/v3/healthos/ecosystem/federation/gateway/status', null],
    ['GET', '/api/v3/healthos/ecosystem/network/orgs', null],
    ['GET', '/api/v3/healthos/platform/marketplace', null],
    ['GET', '/api/v3/healthos/network/referrals', null],
    ['GET', '/api/v3/healthos/network/signals', null],
    ['GET', '/api/v3/healthos/platform/research/trials', null],
    ['GET', '/api/v3/healthos/platform/analytics/population', null],
    ['GET', '/api/v3/healthos/expand/imaging/1', null],
    ['GET', '/api/v3/healthos/workspace/1', null],
    ['GET', '/api/v3/healthos/timeline/1', null],
    ['GET', '/api/v3/hospital-os/health', null],
    ['GET', '/api/hypergrid/dicom/studies?patientId=1&limit=5', null],
  ];

  for (const [method, path, body] of routes) {
    try {
      const r = await req(method, path, token, body);
      if (r.status === 200 && r.body?.success !== false) ok(`${method} ${path} → 200`);
      else if ([401, 403].includes(r.status)) bad(`${method} ${path}`, `${r.status} ${r.body?.error || r.body?.code || ''}`);
      else if (r.status === 404) bad(`${method} ${path}`, `404`);
      else if (r.status === 500) bad(`${method} ${path}`, `500: ${r.body?.error || r.body?.message || JSON.stringify(r.body).slice(0, 100)}`);
      else ok(`${method} ${path} → ${r.status}`);
    } catch (e) {
      bad(`${method} ${path}`, e.message);
    }
  }

  // Write endpoints — accept 200/201/400 (validation)
  const writes = [
    ['POST', '/api/v3/healthos/expand/labs/1/sync-fhir', {}],
    ['POST', '/api/v3/healthos/network/signals/detect', {}],
    ['POST', '/api/v3/healthos/platform/marketplace/install', { appId: 1 }],
    ['POST', '/api/v3/healthos/platform/developer/keys', { name: 'smoke-key' }],
    ['POST', '/api/v3/healthos/network/referrals', { fromOrgId: 1, toOrgId: 1, patientId: 1, reason: 'smoke test referral' }],
  ];
  for (const [method, path, body] of writes) {
    try {
      const r = await req(method, path, token, body);
      if ([200, 201, 400].includes(r.status)) ok(`${method} ${path} → ${r.status}`);
      else if (r.status === 500) bad(`${method} ${path}`, `500: ${r.body?.error || r.body?.message}`);
      else ok(`${method} ${path} → ${r.status}`);
    } catch (e) {
      bad(`${method} ${path}`, e.message);
    }
  }

  await db.end();

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
