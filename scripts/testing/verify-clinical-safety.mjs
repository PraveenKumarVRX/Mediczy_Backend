#!/usr/bin/env node
/**
 * End-to-end verification of WP-1.1 (structured allergies, problem list, reconciliation) and WP-1.2 (prescription
 * safety: allergy/interaction/duplicate/pregnancy checks, shadow/enforce modes, override + audit log) through the
 * REAL middleware chain and the REAL /api/clinical-safety and /api/v1/emar/orders endpoints.
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION. Only run as OS user `postgres`
 * against the LOCAL unix-socket database (same recipe as verify-parking.mjs / verify-emar-allergy.mjs):
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-clinical-safety.mjs
 *
 * Runs server/migrations/clinical-safety-foundation.migration.js (additive) on the local DB, uses organizations
 * 997001 (A) / 997002 (B), and deletes everything it created.
 */
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER = path.join(ROOT, 'server');
const realWrite = process.stdout.write.bind(process.stdout);
const out = (s = '') => realWrite(String(s) + '\n');
process.stdout.write = () => true;
process.stderr.write = () => true;

const SCRUB = /^(TWILIO|SMTP|EMAIL|MAIL|SENDGRID|SES_|REDIS|KAFKA|S3_|AWS_|MINIO|OPENAI|GROQ|ANTHROPIC|GEMINI|GOOGLE|FIREBASE|RAZORPAY|ABDM|SMS|WHATSAPP|FACEBOOK|FB_|INSTAGRAM|SIB_|ISHA|ELEVEN|DEEPGRAM|SENTRY|OTEL|STRIPE|PAYU|CASHFREE|MSG91|FCM|APNS|LIVEKIT|MONGO|SUPABASE|R2_|CLOUDFLARE|CDN|SLACK|TELEGRAM|PUSHER|PGI)/i;
const KEEP = /^(POSTGRES_|JWT_|NODE_ENV|PATH|HOME|USER|LANG|PWD|TZ)/;
for (const k of Object.keys(process.env)) if (SCRUB.test(k) && !KEEP.test(k)) delete process.env[k];
delete process.env.ALLOW_DEV_TOKENS;

const fatal = (m) => { out(`ABORT: ${m}`); process.exit(2); };
if (os.userInfo().username !== 'postgres') fatal('must run as OS user postgres (see header)');
if (process.env.NODE_ENV === 'production') fatal('NODE_ENV=production');
if (process.env.DISALLOW_REMOTE_DB !== 'true' || process.env.POSTGRES_FORCE_LOCAL !== 'true') fatal('DISALLOW_REMOTE_DB/POSTGRES_FORCE_LOCAL must be true');
if (!String(process.env.POSTGRES_HOST || '').startsWith('/')) fatal('POSTGRES_HOST must be a unix socket path');
if (process.env.JWT_SECRET !== 'smoke-test-secret') fatal('JWT_SECRET must be smoke-test-secret');

let ALLOWED_PORT = null;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let a0 = args[0]; if (Array.isArray(a0)) a0 = a0[0];
  let host; let isPath = false; let port;
  if (a0 && typeof a0 === 'object') { host = a0.host; port = a0.port; isPath = !!a0.path && !a0.port; if (a0.port && !host) host = 'localhost'; }
  else if (typeof a0 === 'string') { isPath = true; }
  else if (typeof a0 === 'number') { port = a0; host = typeof args[1] === 'string' ? args[1] : 'localhost'; }
  if (!isPath && host && !(LOOPBACK.has(String(host)) && ALLOWED_PORT !== null && Number(port) === ALLOWED_PORT)) {
    process.nextTick(() => this.destroy(new Error(`VERIFY: external network blocked (${host})`)));
    return this;
  }
  return origConnect.apply(this, args);
};

const pool = (await import(pathToFileURL(path.join(SERVER, 'db/pgPool.js')).href)).default;
{
  const r = (await pool.query(`SELECT inet_server_addr() AS addr, current_database() AS db`)).rows[0];
  if (r.addr !== null) fatal(`DB connection is TCP (${r.addr})`);
  if (r.db !== 'mediczy_ai') fatal(`unexpected database ${r.db}`);
}
const require = createRequire(path.join(SERVER, 'package.json'));
const jwt = require('jsonwebtoken');

const A = 997001; const B = 997002;
const tok = (org, role = 'hospital_admin', extra = {}) => jwt.sign({ id: org, email: `csv${org}${role}@verify.invalid`, role, userType: 'hospital', hospital_id: org, tenant_id: org, organization_id: org, ...extra }, process.env.JWT_SECRET, { expiresIn: '1h' });
const T = { adminA: tok(A), adminB: tok(B) };

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 300) });
let BASE = '';
async function call(method, url, token, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}

let patientA = null; let patientB = null; let admissionA = null;
const cleanup = async () => {
  const q = (s, p) => pool.query(s, p).catch(() => {});
  await q(`DELETE FROM prescription_safety_log WHERE organization_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM clinical_safety_settings WHERE organization_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM med_reconciliation_item WHERE organization_id = ANY($1::int[])`, [[A, B]]);
  await q(`DELETE FROM med_reconciliation WHERE organization_id = ANY($1::int[])`, [[A, B]]);
  if (admissionA) { await q(`DELETE FROM medication_orders WHERE admission_id = $1`, [admissionA]); await q(`DELETE FROM ip_admissions WHERE id = $1`, [admissionA]); }
  await q(`DELETE FROM ip_admissions WHERE organization_id = ANY($1::int[])`, [[A, B]]);
  if (patientA) { await q(`DELETE FROM patient_allergies WHERE user_id = $1`, [patientA]); await q(`DELETE FROM patient_conditions WHERE user_id = $1`, [patientA]); await q(`DELETE FROM users WHERE id = $1`, [patientA]); }
  if (patientB) { await q(`DELETE FROM users WHERE id = $1`, [patientB]); }
};

let server; let crashed = null;
try {
  // Mirrors server/db/migrations/025-normalise-array-fields.sql so this fixture works on a database that has not run
  // that (pre-existing, unrelated) migration yet.
  await pool.query(`CREATE TABLE IF NOT EXISTS patient_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER, diagnosed_by INTEGER REFERENCES users(id), condition_name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(20), snomed_code VARCHAR(50),
    condition_type VARCHAR(50) DEFAULT 'chronic' CHECK (condition_type IN ('chronic','acute','episodic','genetic','unknown')),
    severity VARCHAR(20), onset_date DATE, diagnosed_date DATE, notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESOLVED','REMISSION','MONITORING','UNKNOWN')),
    resolved_date DATE, source VARCHAR(50) DEFAULT 'patient_reported',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
  // Same source migration, used by checkPrescriptionSafety's current-medications lookup.
  await pool.query(`CREATE TABLE IF NOT EXISTS patient_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER, prescribed_by INTEGER, drug_name VARCHAR(200) NOT NULL, drug_code VARCHAR(50),
    generic_name VARCHAR(200), brand_name VARCHAR(200), drug_class VARCHAR(100), dose VARCHAR(100), frequency VARCHAR(100),
    route VARCHAR(50), status VARCHAR(20) DEFAULT 'ACTIVE', start_date DATE, end_date DATE, reason_stopped TEXT,
    source VARCHAR(50), prescription_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});

  const migration = await import(pathToFileURL(path.join(SERVER, 'migrations/clinical-safety-foundation.migration.js')).href);
  await migration.up();

  await cleanup();
  const mkUser = async (email, org) => (await pool.query(
    `INSERT INTO users ("firstName","lastName",email,password,"phoneNumber",organization_id) VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    ['Verify', 'Patient', email, `9${Date.now()}`.slice(0, 10), org]
  )).rows[0].id;
  patientA = await mkUser(`csv-patient-a-${Date.now()}@verify.invalid`, A);
  patientB = await mkUser(`csv-patient-b-${Date.now()}@verify.invalid`, B);
  admissionA = (await pool.query(`INSERT INTO ip_admissions (organization_id, patient_id, admission_datetime) VALUES ($1,$2,NOW()) RETURNING id`, [A, patientA])).rows[0].id;

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── settings default to shadow ──
  let r = await call('GET', '/api/clinical-safety/settings', T.adminA);
  check('settings default to shadow mode', r.status === 200 && r.json?.mode === 'shadow', r.text);

  // ── tenant isolation: org B cannot read org A's patient ──
  r = await call('GET', `/api/clinical-safety/patients/${patientA}/allergies`, T.adminB);
  check('org B is denied access to org A\'s patient (403)', r.status === 403, r.text);

  // ── allergies: unknown -> recorded -> known ──
  r = await call('GET', `/api/clinical-safety/patients/${patientA}/allergies`, T.adminA);
  check('a patient with no rows reads as unknown', r.status === 200 && r.json?.status === 'unknown' && r.json.allergies.length === 0, r.text);

  r = await call('POST', `/api/clinical-safety/patients/${patientA}/allergies`, T.adminA, { allergenName: 'Amoxicillin', allergenType: 'drug', severity: 'SEVERE', reaction: 'anaphylaxis' });
  check('recording an allergy succeeds', r.status === 201 && r.json?.data?.allergen_name === 'Amoxicillin', r.text);
  r = await call('GET', `/api/clinical-safety/patients/${patientA}/allergies`, T.adminA);
  check('status is now known', r.status === 200 && r.json?.status === 'known' && r.json.allergies.length === 1, r.text);
  r = await call('POST', `/api/clinical-safety/patients/${patientA}/no-known-allergy`, T.adminA);
  check('no-known-allergy is refused while an active allergy exists', r.status === 409, r.text);

  // ── problem list ──
  r = await call('POST', `/api/clinical-safety/patients/${patientA}/problems`, T.adminA, { conditionName: 'Chronic kidney disease', conditionType: 'chronic' });
  check('adding a problem succeeds', r.status === 201, r.text);
  const problemId = r.json?.data?.id;
  r = await call('GET', `/api/clinical-safety/patients/${patientA}/problems`, T.adminA);
  check('problem list shows it', r.status === 200 && r.json.data.some((p) => p.id === problemId), r.text);
  r = await call('PATCH', `/api/clinical-safety/patients/${patientA}/problems/${problemId}`, T.adminA, { status: 'RESOLVED' });
  check('resolving a problem succeeds', r.status === 200 && r.json?.data?.status === 'RESOLVED', r.text);

  // ── dry-run safety check: allergy match + drug-condition (CKD is still on the chart until resolved above ran) ──
  r = await call('POST', '/api/clinical-safety/check', T.adminA, { patientId: patientA, medications: [{ name: 'Amoxicillin', dosage: '500 mg' }] });
  check('dry run flags the recorded amoxicillin allergy as a blocker', r.status === 200 && r.json.blockers.some((b) => b.code === 'ALLERGY_MATCH'), r.text);
  r = await call('POST', '/api/clinical-safety/check', T.adminA, { patientId: patientA, medications: [{ name: 'Paracetamol', dosage: '650 mg' }] });
  check('an unrelated drug is clean', r.status === 200 && r.json.blockers.length === 0 && r.json.warnings.length === 0, r.text);

  // ── shadow mode: the real order-creation endpoint logs but never blocks ──
  r = await call('POST', '/api/v1/emar/orders', T.adminA, { patientId: patientA, admissionId: admissionA, drugName: 'Amoxicillin', dose: '500', doseUnit: 'mg', route: 'oral', frequency: 'TDS', frequencyHours: 8 });
  check('shadow mode: an order matching a documented allergy is still created (201)', r.status === 201, r.text);
  const orderIdShadow = r.json?.data?.id;
  // Discontinue it so the enforce-mode checks below stay scoped to the allergy blocker (an active duplicate order for
  // the same drug would correctly add its own DUPLICATE_THERAPY blocker, which is a separate behaviour already covered
  // by the unit suite).
  if (orderIdShadow) await pool.query(`UPDATE medication_orders SET order_status = 'discontinued' WHERE id = $1`, [orderIdShadow]);
  const logShadow = (await pool.query(`SELECT * FROM prescription_safety_log WHERE organization_id = $1 AND source = 'emar.order' ORDER BY id DESC LIMIT 1`, [A])).rows[0];
  check('the evaluation was logged even though nothing was blocked', logShadow && logShadow.mode === 'shadow' && logShadow.outcome === 'blocked' && logShadow.blockers.some((b) => b.code === 'ALLERGY_MATCH'), JSON.stringify(logShadow));

  // ── switch to enforce mode ──
  r = await call('PUT', '/api/clinical-safety/settings', T.adminB, { mode: 'enforce' });
  check('org B\'s admin cannot see org A\'s mode change', (await call('GET', '/api/clinical-safety/settings', T.adminA)).json?.mode === 'shadow', r.text);
  r = await call('PUT', '/api/clinical-safety/settings', T.adminA, { mode: 'enforce' });
  check('a hospital admin can switch the org to enforce mode', r.status === 200 && r.json?.mode === 'enforce', r.text);

  r = await call('POST', '/api/v1/emar/orders', T.adminA, { patientId: patientA, admissionId: admissionA, drugName: 'Amoxicillin', dose: '500', doseUnit: 'mg', route: 'oral', frequency: 'TDS', frequencyHours: 8 });
  check('enforce mode: the same order is now blocked (409 SAFETY_BLOCK)', r.status === 409 && r.json?.code === 'SAFETY_BLOCK' && r.json.blockers.some((b) => b.code === 'ALLERGY_MATCH'), r.text);
  r = await call('POST', '/api/v1/emar/orders', T.adminA, { patientId: patientA, admissionId: admissionA, drugName: 'Amoxicillin', dose: '500', doseUnit: 'mg', route: 'oral', frequency: 'TDS', frequencyHours: 8, safetyOverride: { reason: 'x' } });
  check('a short override reason does not bypass the blocker', r.status === 409, r.text);
  r = await call('POST', '/api/v1/emar/orders', T.adminA, { patientId: patientA, admissionId: admissionA, drugName: 'Amoxicillin', dose: '500', doseUnit: 'mg', route: 'oral', frequency: 'TDS', frequencyHours: 8, safetyOverride: { reason: 'Consultant reviewed, monitoring closely', acknowledgedCodes: ['ALLERGY_MATCH'] } });
  check('a full override with the blocker acknowledged proceeds (201)', r.status === 201, r.text);
  const orderIdEnforced = r.json?.data?.id;
  const logOverride = (await pool.query(`SELECT * FROM prescription_safety_log WHERE organization_id = $1 AND source = 'emar.order' AND outcome = 'overridden' ORDER BY id DESC LIMIT 1`, [A])).rows[0];
  check('the override is audited with its reason', logOverride?.override_reason?.includes('Consultant reviewed'), JSON.stringify(logOverride));

  // an unrelated drug for the same patient is unaffected in enforce mode
  r = await call('POST', '/api/v1/emar/orders', T.adminA, { patientId: patientA, admissionId: admissionA, drugName: 'Paracetamol', dose: '500', doseUnit: 'mg', route: 'oral', frequency: 'TDS', frequencyHours: 8 });
  check('enforce mode: an unrelated drug is created without a block', r.status === 201, r.text);

  // ── dashboard ──
  r = await call('GET', '/api/clinical-safety/dashboard', T.adminA);
  check('dashboard reports the blocked/overridden events', r.status === 200 && r.json.data.blocked >= 1 && r.json.data.overridden >= 1, r.text);

  // ── reconciliation: cannot sign with undecided items, then can once decided ──
  r = await call('POST', '/api/clinical-safety/reconciliations', T.adminA, { patientId: patientA, admissionId: admissionA, type: 'admit', items: [{ homeMedicine: 'Atorvastatin 20mg', dose: '20mg', frequency: 'OD' }] });
  check('starting a reconciliation succeeds', r.status === 201 && r.json.data.items.length === 1, r.text);
  const recId = r.json?.data?.id; const itemId = r.json?.data?.items?.[0]?.id;
  r = await call('POST', `/api/clinical-safety/reconciliations/${recId}/sign`, T.adminA);
  check('signing is refused while an item is undecided', r.status === 409 && r.json?.code === 'UNDECIDED_ITEMS', r.text);
  r = await call('PATCH', `/api/clinical-safety/reconciliations/${recId}/items/${itemId}`, T.adminA, { action: 'continue' });
  check('deciding the item succeeds', r.status === 200 && r.json?.data?.action === 'continue', r.text);
  r = await call('POST', `/api/clinical-safety/reconciliations/${recId}/sign`, T.adminA);
  check('signing now succeeds', r.status === 200 && r.json?.data?.status === 'signed', r.text);
  r = await call('POST', `/api/clinical-safety/reconciliations/${recId}/sign`, T.adminA);
  check('signing twice is refused', r.status === 409, r.text);

  // ── drug-class map: governed, draft rows don't change behaviour until approved ──
  r = await call('GET', '/api/clinical-safety/drug-classes', T.adminA);
  check('the seeded drug classes are awaiting approval, not yet approved', r.status === 200 && r.json.approved.length === 0 && r.json.awaitingApproval >= 6, r.text);
} catch (e) {
  crashed = e;
} finally {
  await cleanup();
  const left = patientA ? (await pool.query(`SELECT count(*)::int AS n FROM patient_allergies WHERE user_id = $1`, [patientA]).catch(() => ({ rows: [{ n: '?' }] }))).rows[0].n : 0;
  check('no residue after cleanup', Number(left) === 0, left);
  try { server?.close(); } catch { /* */ }
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
process.exit(failed.length === 0 && !crashed ? 0 : 1);
