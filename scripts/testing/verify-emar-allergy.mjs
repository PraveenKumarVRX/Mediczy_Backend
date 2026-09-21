#!/usr/bin/env node
/**
 * Verification of WP-0.8 (allergy check at medication administration) through the REAL endpoint
 * POST /api/v1/emar/administer and the real middleware chain.
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION. Run only as OS user
 * `postgres` against the LOCAL unix-socket database (same recipe as verify-parking.mjs):
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-emar-allergy.mjs
 *
 * On this local database the script creates patient_allergies (identical to server/db/migrations/025, minus
 * the users FK) if it is missing. Production protects that table with FORCE ROW LEVEL SECURITY, which a superuser
 * bypasses, so here the table is temporarily wrapped in a VIEW that applies the same predicate from the same session
 * settings (organization = app.current_org_id OR user = app.current_user_id). With no context set the view returns
 * nothing — exactly what the application role saw in production before the lookup set its context.
 * It uses organization 998500 / user ids 998501-998506 and cleans up.
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
delete process.env.EMAR_ALLERGY_UNKNOWN_POLICY;

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
const ORG = 998500;
const token = jwt.sign({ id: ORG, email: 'e@verify.invalid', role: 'hospital_admin', userType: 'hospital', hospital_id: ORG, tenant_id: ORG, organization_id: ORG }, process.env.JWT_SECRET, { expiresIn: '1h' });

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 300) });
let BASE = '';
const administer = async (o, extra = {}) => {
  const res = await fetch(`${BASE}/api/v1/emar/administer`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ orderId: o.orderId, admissionId: o.admissionId, patientId: o.patientId, routeUsed: 'oral', scheduledTime: new Date().toISOString(), ...extra }),
  });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
};

const users = { penicillin: 998501, food: 998502, none: 998503, lifethreat: 998504 };
const makeOrder = async (patientId, drug) => {
  const adm = (await pool.query(`INSERT INTO ip_admissions (organization_id, patient_id, admission_datetime) VALUES ($1,$2,NOW()) RETURNING id`, [ORG, patientId])).rows[0].id;
  const ord = (await pool.query(`INSERT INTO medication_orders (organization_id, admission_id, patient_id, drug_name, dose, route, order_status, prn) VALUES ($1,$2,$3,$4,'250','oral','active',false) RETURNING id`, [ORG, adm, patientId, drug])).rows[0].id;
  return { orderId: ord, admissionId: adm, patientId };
};
const lastAdmin = async (orderId) => (await pool.query(`SELECT * FROM medication_administrations WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [orderId])).rows[0];
const blockedLogs = async (orderId) => (await pool.query(`SELECT * FROM emar_blocked_attempts WHERE order_id = $1`, [orderId])).rows;
const cleanup = async () => {
  const q = (s, p) => pool.query(s, p).catch(() => {});
  const oids = (await pool.query(`SELECT id FROM medication_orders WHERE organization_id = $1`, [ORG]).catch(() => ({ rows: [] }))).rows.map((r) => r.id);
  await q(`DELETE FROM medication_administrations WHERE order_id = ANY($1::int[])`, [oids]);
  await q(`DELETE FROM emar_blocked_attempts WHERE order_id = ANY($1::int[])`, [oids]);
  await q(`DELETE FROM medication_orders WHERE organization_id = $1`, [ORG]);
  await q(`DELETE FROM ip_admissions WHERE organization_id = $1`, [ORG]);
  await q(`DELETE FROM patient_allergies WHERE user_id = ANY($1::int[])`, [Object.values(users)]);
};

let server; let crashed = null; let renamed = false; let wrapped = false;
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER NOT NULL, organization_id INTEGER,
    allergen_name VARCHAR(200) NOT NULL, allergen_code VARCHAR(50), allergen_type VARCHAR(50),
    severity VARCHAR(20) DEFAULT 'UNKNOWN', reaction_type VARCHAR(200), onset_date DATE, notes TEXT,
    verified BOOLEAN DEFAULT FALSE, verified_by INTEGER, verified_at TIMESTAMPTZ, source VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
  await cleanup();
  await pool.query(`ALTER TABLE patient_allergies RENAME TO patient_allergies_base`); wrapped = true;
  await pool.query(`CREATE VIEW patient_allergies AS SELECT * FROM patient_allergies_base
    WHERE organization_id::text = current_setting('app.current_org_id', true) OR user_id::text = current_setting('app.current_user_id', true)`);
  await pool.query(`INSERT INTO patient_allergies_base (user_id, organization_id, allergen_name, allergen_type, severity, reaction_type) VALUES ($1,$2,'Penicillin','drug','SEVERE','anaphylaxis')`, [users.penicillin, ORG]);
  await pool.query(`INSERT INTO patient_allergies_base (user_id, organization_id, allergen_name, allergen_type, severity, reaction_type) VALUES ($1,$2,'Peanut','food','MODERATE','hives')`, [users.food, ORG]);
  await pool.query(`INSERT INTO patient_allergies_base (user_id, organization_id, allergen_name, allergen_type, severity, reaction_type) VALUES ($1,$2,'sulfa','drug','LIFE_THREATENING','anaphylaxis')`, [users.lifethreat, ORG]);

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── the emulated policy really hides rows without context (the production failure mode) ──
  const bare = await pool.query(`SELECT count(*)::int AS n FROM patient_allergies`);
  check('setup: with no RLS context the allergy rows are invisible (as they were to the app role in production)', bare.rows[0].n === 0, JSON.stringify(bare.rows));

  // ── recorded penicillin allergy ──
  const o1 = await makeOrder(users.penicillin, 'PENICILLIN V 250mg tablet');
  let r = await administer(o1);
  check('recorded penicillin allergy + that exact drug -> blocked (403), case-insensitive', r.status === 403 && r.json?.blocked && /Allergy alert.*Penicillin.*anaphylaxis.*severe/.test((r.json.reasons || []).join(' ')), r.text);
  check('the block is logged in emar_blocked_attempts with the allergy detail', (await blockedLogs(o1.orderId)).length === 1 && (await lastAdmin(o1.orderId)) === undefined, JSON.stringify(await blockedLogs(o1.orderId)));
  r = await administer(o1, { overrideReason: 'x' });
  check('a token override reason (too short) does not bypass', r.status === 403, r.text);
  r = await administer(o1, { overrideReason: 'Consultant reviewed; desensitised, monitoring' });
  const a1 = await lastAdmin(o1.orderId);
  check('with a real override reason the dose proceeds (201) and the override is recorded', r.status === 201 && a1?.override_reason && a1.validation_result?.allergy?.status === 'matched' && a1.validation_result.allergy.overridden === true, `${r.text} ${JSON.stringify(a1?.validation_result)}`);
  check('the result notes that matching is by name only', /name only/.test(a1?.validation_result?.allergy?.note || ''));
  const oOther = await makeOrder(users.penicillin, 'Paracetamol 500mg');
  r = await administer(oOther);
  check('a different drug for the same patient is not blocked by the penicillin allergy', r.status === 201 && (await lastAdmin(oOther.orderId)).validation_result.allergy.status === 'checked_no_match', r.text);

  // ── non-drug allergen never matches a drug ──
  const oFood = await makeOrder(users.food, 'Peanut oil emulsion');
  r = await administer(oFood);
  check('a food allergy (peanut) is never matched against a drug name', r.status === 201, r.text);

  // ── life-threatening severity surfaces in the message ──
  const oLt = await makeOrder(users.lifethreat, 'Sulfasalazine 500mg');
  r = await administer(oLt);
  check('severity is shown in the block message', r.status === 403 && /life_threatening/.test((r.json.reasons || []).join(' ')), r.text);

  // ── no recorded allergy status = unknown ──
  const oNone = await makeOrder(users.none, 'Amoxicillin 500mg');
  r = await administer(oNone);
  check('no allergy status recorded -> blocked until acknowledged', r.status === 403 && /No allergy status is recorded/.test((r.json.reasons || []).join(' ')), r.text);
  check('that block is logged too', (await blockedLogs(oNone.orderId)).length === 1);
  r = await administer(oNone, { allergyAcknowledged: true });
  const aNone = await lastAdmin(oNone.orderId);
  check('acknowledging proceeds and the acknowledgement is logged on the administration', r.status === 201 && aNone.validation_result.allergy.status === 'unknown' && aNone.validation_result.allergy.acknowledged === true, `${r.text} ${JSON.stringify(aNone?.validation_result)}`);
  process.env.EMAR_ALLERGY_UNKNOWN_POLICY = 'warn';
  const oWarn = await makeOrder(users.none, 'Ibuprofen 200mg');
  r = await administer(oWarn);
  check('rollout policy "warn": unknown status is allowed but still recorded as unknown', r.status === 201 && (await lastAdmin(oWarn.orderId)).validation_result.allergy.status === 'unknown' && (await lastAdmin(oWarn.orderId)).validation_result.allergy.acknowledged === false, r.text);
  delete process.env.EMAR_ALLERGY_UNKNOWN_POLICY;

  // ── a failed lookup blocks (the original bug swallowed this error and allowed the dose) ──
  await pool.query(`ALTER VIEW patient_allergies RENAME TO patient_allergies_verify_hidden`); renamed = true;
  const oErr = await makeOrder(users.none, 'Cefixime 200mg');
  r = await administer(oErr, { allergyAcknowledged: true });
  check('allergy lookup fails -> administration BLOCKED (not allowed), even with an acknowledgement', r.status === 403 && /could not be checked/.test((r.json.reasons || []).join(' ')), r.text);
  check('the failed-lookup block is logged', (await blockedLogs(oErr.orderId)).length === 1);
  r = await administer(oErr, { overrideReason: 'System down; nurse in charge confirmed with patient no allergy' });
  const aErr = await lastAdmin(oErr.orderId);
  check('with a supervising override the dose proceeds and is recorded as lookup_failed + overridden', r.status === 201 && aErr.validation_result.allergy.status === 'lookup_failed' && aErr.validation_result.allergy.overridden === true, `${r.text} ${JSON.stringify(aErr?.validation_result)}`);

  // ── clinical workspace uses the real columns and reports a failed lookup ──
  const ws = await import(pathToFileURL(path.join(SERVER, 'services/clinical-workspace.service.js')).href);
  let w = await ws.getPatientWorkspace(users.penicillin, ORG);
  check('workspace: while the table is unavailable the lookup failure is flagged (not shown as "no allergies")', w.allergyLookupFailed === true, JSON.stringify({ f: w.allergyLookupFailed, a: w.allergies }));
  await pool.query(`ALTER VIEW patient_allergies_verify_hidden RENAME TO patient_allergies`); renamed = false;
  w = await ws.getPatientWorkspace(users.penicillin, ORG);
  check('workspace: returns the recorded allergen using allergen_name / user_id', w.allergyLookupFailed === false && w.allergies.length === 1 && w.allergies[0].allergen === 'Penicillin' && w.allergies[0].reaction_type === 'anaphylaxis', JSON.stringify(w.allergies));
} catch (e) {
  crashed = e;
} finally {
  if (renamed) await pool.query(`ALTER VIEW patient_allergies_verify_hidden RENAME TO patient_allergies`).catch(() => {});
  await pool.query(`DELETE FROM patient_allergies_base WHERE user_id = ANY($1::int[])`, [Object.values(users)]).catch(() => {});
  if (wrapped) { await pool.query(`DROP VIEW IF EXISTS patient_allergies`).catch(() => {}); await pool.query(`ALTER TABLE patient_allergies_base RENAME TO patient_allergies`).catch(() => {}); }
  await cleanup();
  const left = (await pool.query(`SELECT (SELECT count(*) FROM medication_orders WHERE organization_id = $1) + (SELECT count(*) FROM ip_admissions WHERE organization_id = $1) AS n`, [ORG]).catch(() => ({ rows: [{ n: '?' }] }))).rows[0].n;
  check('no residue after cleanup', Number(left) === 0, left);
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
try { server?.close(); } catch { /* */ }
process.exit(failed.length === 0 && !crashed ? 0 : 1);
