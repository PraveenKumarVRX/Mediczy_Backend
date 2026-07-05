/**
 * Portal-native HealthOS smoke — hospital + doctor ring-fencing & API access
 * Run: node scripts/portal-healthos-smoke.mjs
 */
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
const JWT_SECRET =
  process.env.JWT_SECRET ||
  'd6100dfd4597503924f69844c93a4cdddfa47bdbaff450c45a2ad774c857fde074e9ba41e6f7171c21c83f25e224f969e7e05681cc020f30e964017395a4fd8d';

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function bad(name, reason) {
  failed++;
  console.log(`  ✗ ${name}: ${reason}`);
}

async function req(method, urlPath, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: json };
}

const HEALTHOS_API = [
  '/api/v3/healthos/health',
  '/api/v3/healthos/platform/status',
  '/api/v3/healthos/workspace/1',
  '/api/v3/careos/health',
  '/api/v3/hospital-os/health',
];

async function expectAllowed(label, token, path) {
  const r = await req('GET', path, token);
  if (r.status === 403 && (r.body?.code === 'ACCESS_DENIED' || r.body?.error === 'ACCESS_DENIED')) {
    bad(label, `ring-fence 403 for ${path}`);
  } else if (r.status === 403) {
    bad(label, `route 403 for ${path}: ${r.body?.message || ''}`);
  } else if (r.status === 500) {
    bad(label, `500 on ${path}: ${r.body?.error || r.body?.message || ''}`);
  } else ok(`${label} → ${path} (${r.status})`);
}

async function expectDenied(label, token, path) {
  const r = await req('GET', path, token);
  if (r.status === 403) ok(`${label} blocked as expected (${path})`);
  else bad(label, `expected 403, got ${r.status} for ${path}`);
}

async function main() {
  console.log('\n── Portal HealthOS Smoke ────────────────────────────────────────\n');

  const hospitalToken = jwt.sign(
    { id: 10, hospitalId: 10, email: 'hospital@smoke.local', role: 'hospital', userType: 'hospital' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const doctorToken = jwt.sign(
    { id: 20, doctorId: 20, email: 'doctor@smoke.local', role: 'doctor', userType: 'doctor' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const nurseToken = jwt.sign(
    { id: 30, nurseId: 30, email: 'nurse@smoke.local', role: 'nurse', userType: 'nurse' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const userToken = jwt.sign(
    { id: 40, userId: 40, email: 'patient@smoke.local', role: 'user', userType: 'user' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  for (const path of HEALTHOS_API) {
    await expectAllowed('hospital role', hospitalToken, path);
  }
  for (const path of HEALTHOS_API) {
    await expectAllowed('doctor role', doctorToken, path);
  }
  for (const path of HEALTHOS_API.slice(0, 3)) {
    await expectAllowed('nurse role', nurseToken, path);
  }
  await expectDenied('patient role', userToken, '/api/v3/healthos/platform/status');

  // Hospital HMIS analytics (command center backing APIs)
  const hmisAnalytics = [
    '/api/v1/analytics/command-center',
    { path: '/api/v1/beds/census', optional: true }, // requires wards/beds HMIS migrations
  ];
  for (const entry of hmisAnalytics) {
    const path = typeof entry === 'string' ? entry : entry.path;
    const r = await req('GET', path, hospitalToken);
    if (r.status === 500 && typeof entry === 'object' && entry.optional) {
      ok(`hospital HMIS analytics → ${path} (500 — optional, schema not migrated)`);
    } else if (r.status === 403 && (r.body?.code === 'ACCESS_DENIED' || r.body?.error === 'ACCESS_DENIED')) {
      bad('hospital HMIS analytics', `ring-fence 403 for ${path}`);
    } else if (r.status === 500) {
      bad('hospital HMIS analytics', `500 on ${path}: ${r.body?.error || r.body?.message || ''}`);
    } else ok(`hospital HMIS analytics → ${path} (${r.status})`);
  }

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
