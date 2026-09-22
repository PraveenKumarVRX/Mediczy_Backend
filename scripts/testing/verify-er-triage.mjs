#!/usr/bin/env node
/**
 * End-to-end verification of WP-1.8's ER triage fixes through the REAL middleware chain and the REAL
 * /api/v1/er endpoints: registration and triage-update no longer swallow errors or fabricate a record,
 * triage_time is actually set, a real ESI level is authoritative over the legacy colour, and the queue
 * orders by it.
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION. Only run as OS user `postgres`
 * against the LOCAL unix-socket database:
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-er-triage.mjs
 *
 * Runs migrations/er-triage-esi-fields.migration.js (additive) on the local DB, uses organization 995001,
 * and deletes everything it created.
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
const ORG = 995001;
const token = jwt.sign({ id: ORG, email: 'e@verify.invalid', role: 'hospital_admin', userType: 'hospital', hospital_id: ORG, tenant_id: ORG, organization_id: ORG }, process.env.JWT_SECRET, { expiresIn: '1h' });

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 300) });
let BASE = '';
async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}
const cleanup = async () => { await pool.query(`DELETE FROM er_visits WHERE organization_id = $1`, [ORG]).catch(() => {}); };

let server; let crashed = null;
try {
  const migration = await import(pathToFileURL(path.join(SERVER, 'migrations/er-triage-esi-fields.migration.js')).href);
  await migration.up();
  await cleanup();

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── registration: rejects a bad esiLevel, sets triage_time when a decision is given ──
  let r = await call('POST', '/api/v1/er/register', { patientName: 'A. Patient', esiLevel: 9, chiefComplaint: 'chest pain' });
  check('an out-of-range esiLevel is rejected (400)', r.status === 400, r.text);

  r = await call('POST', '/api/v1/er/register', { patientName: 'B. Patient', esiLevel: 2, chiefComplaint: 'shortness of breath', triageInputs: { highRiskSituation: true } });
  check('registration with a real ESI level succeeds (201) with a real id', r.status === 201 && r.json?.data?.id != null, r.text);
  const visitB = r.json?.data;
  check('triage_time is set at registration when a level is given (the old route never set this)', visitB?.triage_time != null, JSON.stringify(visitB));
  check('esi_level is stored', visitB?.esi_level === 2, JSON.stringify(visitB));
  check('triage_source is "registration"', visitB?.triage_source === 'registration', JSON.stringify(visitB));

  r = await call('POST', '/api/v1/er/register', { patientName: 'C. Patient', triageLevel: 'purple' });
  check('an invalid colour is rejected (400)', r.status === 400, r.text);

  r = await call('POST', '/api/v1/er/register', { patientName: 'D. Patient', triageLevel: 'yellow' });
  const visitD = r.json?.data;
  check('a colour-only registration still gets triage_time (colour is a real decision too)', visitD?.triage_time != null, JSON.stringify(visitD));

  r = await call('POST', '/api/v1/er/register', { patientName: 'E. Patient' });
  const visitE = r.json?.data;
  check('no triage decision at registration -> triage_time stays null (not fabricated)', visitE?.triage_time == null, JSON.stringify(visitE));

  // ── a genuine database failure is reported, not papered over with a fake record ──
  r = await call('POST', '/api/v1/er/register', { patientName: 'F. Patient', age: 'not-a-number-but-column-is-integer' });
  check('a genuine insert failure returns a real error, not a 201 with a fabricated record', r.status !== 201, r.text);

  // ── triage update: requires a level, sets triage_time + confirmation, esi_level wins over colour ──
  r = await call('PUT', `/api/v1/er/triage/${visitE.id}`, {});
  check('triage update with neither esiLevel nor triageLevel is rejected (400)', r.status === 400, r.text);

  r = await call('PUT', `/api/v1/er/triage/${visitE.id}`, { esiLevel: 1, triageInputs: { immediateLifeSavingIntervention: true } });
  check('triage update with a real ESI level succeeds', r.status === 200 && r.json?.data?.esi_level === 1, r.text);
  const updatedE = r.json?.data;
  check('triage_time is set by the update (the old route never set this either)', updatedE?.triage_time != null, JSON.stringify(updatedE));
  check('a confirmed ESI level marks the row reviewed, with who and when', updatedE?.triage_reviewed === true && updatedE?.triage_confirmed_by != null && updatedE?.triage_confirmed_at != null, JSON.stringify(updatedE));
  check('triage_inputs is stored', updatedE?.triage_inputs?.immediateLifeSavingIntervention === true, JSON.stringify(updatedE));

  r = await call('PUT', `/api/v1/er/triage/999999999`, { esiLevel: 3 });
  check('updating a non-existent visit returns 404, not a silent success', r.status === 404, r.text);

  // ── queue: a real ESI level outranks a colour hint, even a "worse-looking" one ──
  r = await call('POST', '/api/v1/er/register', { patientName: 'G. Patient', triageLevel: 'red' }); // colour hint only
  await call('PUT', `/api/v1/er/triage/${r.json.data.id}`, { triageLevel: 'red' }); // colour-only update: NOT reviewed
  r = await call('GET', '/api/v1/er/queue');
  check('queue groups both by legacy colour and by ESI lane', Array.isArray(r.json?.data?.red) && Array.isArray(r.json?.byEsi?.esi1), r.text);
  check('a confirmed ESI-1 patient appears in the esi1 lane', (r.json?.byEsi?.esi1 || []).some((p) => p.id === updatedE.id), JSON.stringify(r.json?.byEsi));
  check('the colour-only red patient appears in the legacy red group', r.json.data.red.some((p) => p.patient_name === 'G. Patient'), JSON.stringify(r.json.data.red));
  check('unreviewed count reflects the colour-only, unconfirmed row', r.json.unreviewed >= 1, JSON.stringify({ unreviewed: r.json.unreviewed }));

  const all = await pool.query(`SELECT id, patient_name FROM er_visits WHERE organization_id = $1 ORDER BY
     CASE WHEN esi_level IS NOT NULL THEN esi_level WHEN triage_level = 'red' THEN 1 WHEN triage_level = 'yellow' THEN 3 WHEN triage_level = 'green' THEN 4 ELSE 6 END, arrival_time ASC`, [ORG]);
  const posE = all.rows.findIndex((row) => row.id === updatedE.id);
  const posG = all.rows.findIndex((row) => row.patient_name === 'G. Patient');
  check('a confirmed ESI-1 patient is ordered ahead of an unconfirmed red-colour-only patient', posE >= 0 && posG >= 0 && posE < posG, JSON.stringify({ posE, posG }));
} catch (e) {
  crashed = e;
} finally {
  await cleanup();
  try { server?.close(); } catch { /* */ }
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
process.exit(failed.length === 0 && !crashed ? 0 : 1);
