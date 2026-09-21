#!/usr/bin/env node
/**
 * End-to-end verification of the parking module through the REAL middleware chain
 * (ringFencing -> authUser -> requireRole -> requireModule -> tenant scoping).
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION.
 * Only run as OS user `postgres` against the LOCAL unix-socket database:
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-parking.mjs
 *
 * Runs the (additive) parking migration on the local DB, uses organizations 996001 /
 * 996002, and deletes everything it created. External network is blocked.
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

const fatal = (msg) => { out(`ABORT: ${msg}`); process.exit(2); };
if (os.userInfo().username !== 'postgres') fatal('must run as OS user postgres (see header)');
if (process.env.NODE_ENV === 'production') fatal('NODE_ENV=production');
if (process.env.DISALLOW_REMOTE_DB !== 'true' || process.env.POSTGRES_FORCE_LOCAL !== 'true') fatal('DISALLOW_REMOTE_DB/POSTGRES_FORCE_LOCAL must be true');
if (!String(process.env.POSTGRES_HOST || '').startsWith('/')) fatal('POSTGRES_HOST must be a unix socket path');
if (process.env.JWT_SECRET !== 'smoke-test-secret') fatal('JWT_SECRET must be smoke-test-secret');

let ALLOWED_PORT = null;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let a0 = args[0];
  if (Array.isArray(a0)) a0 = a0[0];
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

const A = 996001; const B = 996002;
const tok = (org, role = 'hospital_admin') => jwt.sign({ id: org, email: `p${org}@verify.invalid`, role, userType: 'hospital', hospital_id: org, tenant_id: org, organization_id: org }, process.env.JWT_SECRET, { expiresIn: '1h' });
const T = { adminA: tok(A), adminB: tok(B), secA: tok(A, 'security_staff'), secB: tok(B, 'security_staff'), nurseA: tok(A, 'accounts_staff') };

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 220) });
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
const cleanup = async () => {
  for (const t of ['parking_valet_ticket', 'parking_device', 'parking_overstay_alert', 'parking_incident', 'parking_watchlist', 'parking_pass', 'parking_vehicle_log', 'parking_lot']) {
    await pool.query(`DELETE FROM ${t} WHERE organization_id = ANY($1::int[])`, [[A, B]]).catch(() => {});
  }
};

let server; let crashed = null;
try {
  const { up } = await import(pathToFileURL(path.join(SERVER, 'migrations/parking.migration.js')).href);
  await up();
  await up(); // idempotent
  check('migration runs twice without error', true);
  await cleanup();

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── access chain ──
  let r = await call('GET', '/api/parking/lots');
  check('no token -> 401', r.status === 401, r.text);
  r = await call('GET', '/api/parking/lots', T.adminA);
  check('hospital token reaches module (ringFencing) -> 200', r.status === 200 && Array.isArray(r.json?.data), r.text);

  // ── lots ──
  r = await call('POST', '/api/parking/lots', T.adminA, { name: 'Main Basement', twoWheelerCapacity: 2, carCapacity: 2 });
  const lot = r.json?.data;
  check('create lot -> 201', r.status === 201 && lot?.id, r.text);
  r = await call('POST', '/api/parking/lots', T.adminA, { name: 'main basement', twoWheelerCapacity: 1, carCapacity: 1 });
  check('duplicate lot name (case-insensitive) -> 409', r.status === 409, r.text);
  r = await call('POST', '/api/parking/lots', T.adminA, { name: 'Bad', twoWheelerCapacity: -1, carCapacity: 1 });
  check('negative capacity -> 400', r.status === 400, r.text);
  r = await call('GET', '/api/parking/lots', T.nurseA);
  check('non-security hospital role (accounts_staff) is refused -> 403', r.status === 403, r.text);
  r = await call('POST', '/api/parking/lots', T.nurseA, { name: 'Nurse Lot', twoWheelerCapacity: 1, carCapacity: 1 });
  check('accounts_staff cannot create a lot -> 403', r.status === 403, r.text);
  r = await call('GET', '/api/parking/lots', T.secA);
  check('security_staff token reaches the module -> 200', r.status === 200, r.text);
  r = await call('GET', '/api/parking/lots', T.secB);
  check('security_staff of another org sees none of org A lots', r.status === 200 && !r.json.data.some((l) => l.name === 'Main Basement'), r.text);
  const L = lot.id;

  // ── tenant isolation ──
  r = await call('GET', `/api/parking/lots/${L}`, T.adminB);
  check('org B cannot read org A lot -> 404', r.status === 404, r.text);
  r = await call('POST', `/api/parking/lots/${L}/movements`, T.adminB, { vehicleType: 'car', action: 'entry' });
  check('org B cannot log movement in org A lot -> 404', r.status === 404, r.text);
  r = await call('GET', '/api/parking/lots', T.adminB);
  check('org B lot list is empty', r.status === 200 && r.json.data.length === 0, r.text);

  // ── movements: headcount ──
  const mv = (body, token = T.secA) => call('POST', `/api/parking/lots/${L}/movements`, token, body);
  r = await mv({ vehicleType: 'car', action: 'entry' });
  check('headcount entry (security role) -> 201', r.status === 201, r.text);
  await mv({ vehicleType: 'car', action: 'entry' });
  r = await mv({ vehicleType: 'car', action: 'entry' });
  check('entry beyond capacity -> 409 LOT_FULL', r.status === 409 && r.json?.code === 'LOT_FULL', r.text);
  r = await mv({ vehicleType: 'car', action: 'entry', emergencyOverride: true });
  check('emergency override allows full-lot entry with warning', r.status === 201 && r.json.data.warnings.length === 1, r.text);
  r = await mv({ vehicleType: 'two_wheeler', action: 'exit' });
  check('headcount exit with none inside -> 409 LOT_EMPTY', r.status === 409 && r.json?.code === 'LOT_EMPTY', r.text);
  r = await call('GET', `/api/parking/lots/${L}`, T.adminA);
  check('occupancy = 3 cars, 0 two-wheelers', r.json?.data?.cars === 3 && r.json?.data?.two_wheelers === 0, r.text);
  r = await call('POST', `/api/parking/lots/${L}/reset-occupancy`, T.adminA);
  check('reset-occupancy zeroes counters, keeps history', r.json?.data?.cars === 0, r.text);
  r = await call('GET', `/api/parking/lots/${L}/logs`, T.adminA);
  check('history retained after reset', r.json?.data?.length === 3, r.text);

  // ── movements: plate-tracked ──
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'mh 12-ab 1234' });
  check('plate entry normalises to MH12AB1234', r.status === 201 && r.json.data.log.vehicle_number === 'MH12AB1234', r.text);
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'MH12AB1234' });
  check('same plate twice -> 409 ALREADY_INSIDE', r.status === 409 && r.json?.code === 'ALREADY_INSIDE', r.text);
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'AB' });
  check('short plate -> 400', r.status === 400, r.text);
  r = await call('GET', `/api/parking/lots/${L}/active-vehicles`, T.adminA);
  check('active vehicles lists the plate', r.json?.data?.length === 1 && r.json.data[0].vehicle_number === 'MH12AB1234', r.text);
  r = await mv({ vehicleType: 'car', action: 'exit', vehicleNumber: 'KA01ZZ9999' });
  check('exit without entry -> 409 NOT_INSIDE', r.status === 409 && r.json?.code === 'NOT_INSIDE', r.text);
  await pool.query(`UPDATE parking_vehicle_log SET logged_at = NOW() - INTERVAL '95 minutes' WHERE organization_id = $1 AND vehicle_number = 'MH12AB1234'`, [A]);
  r = await mv({ vehicleType: 'two_wheeler', action: 'exit', vehicleNumber: 'MH12AB1234' });
  check('exit computes duration server-side (~95 min) and uses the entry vehicle type', r.status === 201 && Math.abs(r.json.data.log.parking_duration_minutes - 95) <= 1 && r.json.data.log.vehicle_type === 'car', r.text);
  r = await call('GET', `/api/parking/lots/${L}/active-vehicles`, T.adminA);
  check('no active vehicles after exit', r.json?.data?.length === 0, r.text);

  // ── passes ──
  const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  r = await call('POST', '/api/parking/passes', T.secA, { vehicleNumber: 'DL8CAF5030', passType: 'monthly' });
  check('monthly pass without expiry -> 400', r.status === 400, r.text);
  r = await call('POST', '/api/parking/passes', T.secA, { vehicleNumber: 'DL8CAF5030', passType: 'monthly', expiresAt: new Date(Date.now() - 864e5).toISOString() });
  check('monthly pass with past expiry -> 400', r.status === 400, r.text);
  r = await call('POST', '/api/parking/passes', T.secA, { vehicleNumber: 'DL8CAF5030', passType: 'monthly', expiresAt: exp, holderName: 'Dr Rao', holderType: 'doctor' });
  check('issue monthly pass -> 201', r.status === 201, r.text);
  r = await call('POST', '/api/parking/passes', T.secA, { vehicleNumber: 'DL8CAF5030', passType: 'monthly', expiresAt: exp });
  r = await call('GET', '/api/parking/passes?activeOnly=true', T.adminA);
  check('re-issuing retires the previous same-type pass', r.json?.data?.filter((p) => p.vehicle_number === 'DL8CAF5030').length === 1, r.text);
  r = await call('POST', '/api/parking/passes', T.secA, { vehicleNumber: 'TN09BC1111', passType: 'token', tokenBalance: 2 });
  const tokenPass = r.json?.data;
  check('issue token pass (2 tokens)', r.status === 201 && tokenPass.token_balance === 2, r.text);
  r = await call('GET', `/api/parking/check-vehicle?vehicleNumber=DL8CAF5030&lotId=${L}`, T.secA);
  check('check-vehicle: valid monthly pass', r.json?.data?.hasValidPass === true, r.text);
  r = await call('GET', `/api/parking/check-vehicle?vehicleNumber=ZZ99ZZ9999&lotId=${L}`, T.secA);
  check('check-vehicle: unknown plate has no pass', r.json?.data?.hasValidPass === false, r.text);
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'TN09BC1111' });
  check('token entry consumes one token (2 -> 1)', r.status === 201 && r.json.data.pass?.pass?.token_balance === 1, r.text);
  await mv({ vehicleType: 'car', action: 'exit', vehicleNumber: 'TN09BC1111' });
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'TN09BC1111' });
  check('last token consumed -> 0 and pass deactivates', r.status === 201 && r.json.data.pass?.pass?.token_balance === 0, r.text);
  await mv({ vehicleType: 'car', action: 'exit', vehicleNumber: 'TN09BC1111' });
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'TN09BC1111' });
  check('depleted token pass is not valid at entry', r.status === 201 && r.json.data.pass?.hasValidPass === false, r.text);
  await mv({ vehicleType: 'car', action: 'exit', vehicleNumber: 'TN09BC1111' });
  r = await call('POST', `/api/parking/passes/${tokenPass.id}/top-up`, T.secA, { amount: 5 });
  check('top-up reactivates token pass (balance 5)', r.status === 200 && r.json.data.token_balance === 5 && r.json.data.is_active === true, r.text);
  r = await call('POST', `/api/parking/passes/${tokenPass.id}/top-up`, T.secA, { amount: 0 });
  check('top-up 0 -> 400', r.status === 400, r.text);
  r = await call('POST', `/api/parking/passes/${tokenPass.id}/revoke`, T.adminB);
  check('org B cannot revoke org A pass -> 404', r.status === 404, r.text);
  r = await call('POST', `/api/parking/passes/${tokenPass.id}/revoke`, T.secA);
  check('revoke pass', r.status === 200 && r.json.data.is_active === false, r.text);

  // ── watchlist ──
  r = await call('POST', '/api/parking/watchlist', T.secA, { vehicleNumber: 'RJ14XX0001', reason: 'Stolen report', severity: 'high' });
  check('add to watchlist -> 201', r.status === 201, r.text);
  r = await call('POST', '/api/parking/watchlist', T.secA, { vehicleNumber: 'RJ14XX0001', reason: 'x', severity: 'extreme' });
  check('bad severity -> 400', r.status === 400, r.text);
  r = await mv({ vehicleType: 'car', action: 'entry', vehicleNumber: 'RJ14XX0001' });
  check('watchlisted plate entry returns the hit', r.status === 201 && r.json.data.watchlistHit?.severity === 'high', r.text);
  r = await call('GET', '/api/parking/watchlist', T.adminB);
  check('org B does not see org A watchlist', r.json?.data?.length === 0, r.text);

  // ── overstay ──
  r = await call('PUT', `/api/parking/lots/${L}/security-settings`, T.adminA, { maxParkingMinutes: 60, securityEnabled: true });
  check('security settings saved', r.status === 200 && r.json.data.max_parking_minutes === 60 && r.json.data.security_enabled === true, r.text);
  await pool.query(`UPDATE parking_vehicle_log SET logged_at = NOW() - INTERVAL '3 hours' WHERE organization_id = $1 AND vehicle_number = 'RJ14XX0001'`, [A]);
  r = await call('POST', '/api/parking/overstay-alerts/scan', T.secA);
  check('overstay scan creates 1 alert', r.status === 200 && r.json.data.created === 1, r.text);
  r = await call('POST', '/api/parking/overstay-alerts/scan', T.secA);
  check('overstay scan is idempotent', r.json?.data?.created === 0, r.text);
  r = await call('GET', '/api/parking/overstay-alerts?unacknowledgedOnly=true', T.secA);
  const alert = r.json?.data?.[0];
  check('unacknowledged alert listed', r.json?.data?.length === 1, r.text);
  r = await call('POST', `/api/parking/overstay-alerts/${alert.id}/acknowledge`, T.adminB);
  check('org B cannot acknowledge org A alert -> 404', r.status === 404, r.text);
  r = await call('POST', `/api/parking/overstay-alerts/${alert.id}/acknowledge`, T.secA);
  check('acknowledge alert', r.status === 200 && r.json.data.is_acknowledged === true, r.text);

  // ── incidents ──
  r = await call('POST', '/api/parking/incidents', T.secA, { lotId: L, type: 'vandalism', severity: 'medium', title: 'Scratched car', description: 'Bay 4' });
  const inc = r.json?.data;
  check('report incident -> 201', r.status === 201 && inc?.status === 'open', r.text);
  r = await call('POST', '/api/parking/incidents', T.adminB, { lotId: L, type: 'theft', severity: 'low', title: 't', description: 'd' });
  check('org B cannot report into org A lot -> 404', r.status === 404, r.text);
  r = await call('PATCH', `/api/parking/incidents/${inc.id}`, T.secA, { status: 'resolved' });
  check('resolving without a note -> 400', r.status === 400, r.text);
  r = await call('PATCH', `/api/parking/incidents/${inc.id}`, T.secA, { status: 'resolved', resolvedNote: 'Owner informed' });
  check('resolve incident with note', r.status === 200 && r.json.data.status === 'resolved' && r.json.data.resolved_at, r.text);

  // ── devices ──
  r = await call('POST', '/api/parking/devices', T.adminA, { lotId: L, name: 'Entry Barrier', deviceType: 'boom_barrier', position: 'entry', ipAddress: '10.0.0.5', port: 8080, config: { autoClose: true, closeDelaySeconds: 5 } });
  const dev = r.json?.data;
  check('register device -> 201', r.status === 201 && dev?.status === 'offline', r.text);
  r = await call('POST', '/api/parking/devices', T.adminA, { lotId: L, name: 'X', deviceType: 'boom_barrier', port: 99999 });
  check('bad port -> 400', r.status === 400, r.text);
  r = await call('POST', '/api/parking/devices', T.nurseA, { lotId: L, name: 'X', deviceType: 'boom_barrier' });
  check('accounts_staff cannot register devices -> 403', r.status === 403, r.text);
  r = await call('PATCH', `/api/parking/devices/${dev.id}/status`, T.secA, { status: 'online' });
  check('set device online stamps heartbeat', r.status === 200 && r.json.data.last_heartbeat, r.text);
  r = await call('PATCH', `/api/parking/devices/${dev.id}`, T.adminB, { name: 'hijack' });
  check('org B cannot edit org A device -> 404', r.status === 404, r.text);
  r = await call('GET', '/api/parking/devices/stats', T.adminA);
  check('device stats', r.json?.data?.total === 1 && r.json.data.online === 1, r.text);

  // ── analytics / overview ──
  r = await call('GET', '/api/parking/overview', T.adminA);
  check('overview counts', r.status === 200 && r.json.data.active_passes === 1 && r.json.data.today_entries >= 1, r.text);
  r = await call('GET', '/api/parking/analytics/daily?days=7', T.adminA);
  check('daily analytics returns 7 days', r.status === 200 && r.json.data.length === 7, r.text);
  r = await call('GET', '/api/parking/analytics/hourly?days=7', T.adminA);
  check('hourly analytics returns 24 hours', r.status === 200 && r.json.data.length === 24, r.text);

  // ── AI camera ──
  r = await call('POST', '/api/parking/detect', T.secA, { imageBase64: 'not-an-image' });
  check('detect rejects non-image -> 400', r.status === 400, r.text);
  r = await call('POST', '/api/parking/detect', T.secA, { imageBase64: 'data:image/png;base64,iVBORw0KGgo=' });
  check('detect with vision unavailable -> 502 (no fabricated zeros)', r.status === 502 && !('data' in (r.json || {})), r.text);

  // ── concurrency: the lot row lock must serialise simultaneous gates ──
  r = await call('POST', '/api/parking/lots', T.adminA, { name: 'Race Lot', twoWheelerCapacity: 0, carCapacity: 2 });
  const RL = r.json?.data?.id;
  const race = (body) => call('POST', `/api/parking/lots/${RL}/movements`, T.secA, body);
  const burst = await Promise.all(Array.from({ length: 8 }, () => race({ vehicleType: 'car', action: 'entry' })));
  check('8 parallel entries into a 2-car lot: exactly 2 succeed', burst.filter((x) => x.status === 201).length === 2 && burst.filter((x) => x.status === 409).length === 6, burst.map((x) => x.status).join(','));
  await call('POST', `/api/parking/lots/${RL}/reset-occupancy`, T.adminA);
  const same = await Promise.all(Array.from({ length: 6 }, () => race({ vehicleType: 'car', action: 'entry', vehicleNumber: 'GJ01RA0001' })));
  check('6 parallel entries of one plate: exactly 1 succeeds', same.filter((x) => x.status === 201).length === 1 && same.filter((x) => x.json?.code === 'ALREADY_INSIDE').length === 5, same.map((x) => x.status).join(','));
  const twoLots = await call('POST', '/api/parking/lots', T.adminA, { name: 'Other Lot', twoWheelerCapacity: 0, carCapacity: 5 });
  const cross = await call('POST', `/api/parking/lots/${twoLots.json.data.id}/movements`, T.secA, { vehicleType: 'car', action: 'entry', vehicleNumber: 'GJ01RA0001' });
  check('a plate already inside lot A cannot enter lot B', cross.status === 409 && cross.json?.code === 'ALREADY_INSIDE', cross.text);

  // ── reset must not be undone by exits of vehicles that were inside at reset time ──
  r = await call('POST', '/api/parking/lots', T.adminA, { name: 'Reset Lot', twoWheelerCapacity: 0, carCapacity: 10 });
  const ZL = r.json.data.id;
  const zm = (b) => call('POST', `/api/parking/lots/${ZL}/movements`, T.secA, b);
  await zm({ vehicleType: 'car', action: 'entry', vehicleNumber: 'ZZ01AA0001' });
  await zm({ vehicleType: 'car', action: 'entry', vehicleNumber: 'ZZ01AA0002' });
  await call('POST', `/api/parking/lots/${ZL}/reset-occupancy`, T.adminA);
  await zm({ vehicleType: 'car', action: 'entry', vehicleNumber: 'ZZ01AA0003' });
  await zm({ vehicleType: 'car', action: 'exit', vehicleNumber: 'ZZ01AA0001' });
  await zm({ vehicleType: 'car', action: 'exit', vehicleNumber: 'ZZ01AA0002' });
  r = await call('GET', `/api/parking/lots/${ZL}`, T.secA);
  check('reset: cars that were inside at reset time leaving does not hide the car that arrived after (count 1)', r.json?.data?.cars === 1, `cars=${r.json?.data?.cars} ${(await pool.query('SELECT id, action, vehicle_number, entry_log_id, logged_at FROM parking_vehicle_log WHERE lot_id = $1 ORDER BY id', [ZL])).rows.map((x) => `${x.id}:${x.action}:${x.vehicle_number}:e=${x.entry_log_id}:${new Date(x.logged_at).toISOString().slice(17, 23)}`).join(' | ')} cf=${r.json?.data?.counted_from}`);

  // ── valet ──
  const vt = (method, url, token, body) => call(method, `/api/parking/valet${url}`, token, body);
  const cust = { customerName: 'Asha Rao', customerPhone: '+91 98765 43210', vehicleType: 'car' };
  const OL = twoLots.json.data.id;
  r = await vt('GET', '/tickets', T.nurseA);
  check('valet: non-security role refused -> 403', r.status === 403, r.text);
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'MH14VA0001', keyTag: 'K-17', conditionNotes: 'Scratch on left door' });
  const t1 = r.json?.data?.ticket;
  check('valet: create ticket -> 201, received, numbered V<yymmdd>-001', r.status === 201 && t1?.status === 'received' && /^V\d{6}-001$/.test(t1.ticket_no), r.text);
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'mh14 va0001' });
  check('valet: same plate cannot have two open tickets -> 409', r.status === 409 && r.json?.code === 'DUPLICATE_TICKET', r.text);
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'MH14VA0002', customerPhone: '12' });
  check('valet: bad phone -> 400', r.status === 400, r.text);
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'MH14VA0003', customerName: '' });
  check('valet: missing customer name -> 400', r.status === 400, r.text);
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'RJ14XX0001' });
  check('valet: a plate already inside a lot cannot be handed to valet -> 409', r.status === 409 && r.json?.code === 'ALREADY_INSIDE', r.text);
  await call('POST', '/api/parking/watchlist', T.secA, { vehicleNumber: 'GJ05WL0001', reason: 'Unpaid dues', severity: 'medium' });
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'GJ05WL0001' });
  const tWl = r.json?.data?.ticket;
  check('valet: watchlisted plate is accepted but flagged', r.status === 201 && r.json.data.watchlistHit?.severity === 'medium', r.text);
  const burst2 = await Promise.all(['PB01', 'PB02', 'PB03', 'PB04', 'PB05'].map((p) => vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: `${p}ZZ1111` })));
  const nos = burst2.map((x) => x.json?.data?.ticket?.ticket_no);
  check('valet: 5 parallel tickets get 5 distinct sequential numbers', burst2.every((x) => x.status === 201) && new Set(nos).size === 5, nos.join(','));
  r = await vt('GET', `/tickets/${t1.id}`, T.adminB);
  check('valet: org B cannot read org A ticket -> 404', r.status === 404, r.text);
  r = await vt('POST', `/tickets/${t1.id}/park`, T.adminB, { lotId: L });
  check('valet: org B cannot park org A ticket -> 404', r.status === 404, r.text);
  r = await vt('POST', `/tickets/${t1.id}/deliver`, T.secA, { verification: 'ticket' });
  check('valet: cannot deliver a ticket that is only received -> 409', r.status === 409 && r.json?.code === 'INVALID_STATE', r.text);
  r = await vt('POST', `/tickets/${t1.id}/park`, T.secA, { lotId: 99999999 });
  check('valet: parking into an unknown lot -> 404, ticket unchanged', r.status === 404 && (await vt('GET', `/tickets/${t1.id}`, T.secA)).json.data.status === 'received', r.text);
  const c0 = (await call('GET', `/api/parking/lots/${L}`, T.secA)).json.data.cars;
  await call('PUT', `/api/parking/lots/${L}`, T.adminA, { name: 'Main Basement', twoWheelerCapacity: 2, carCapacity: c0 + 1 });
  r = await vt('POST', `/tickets/${t1.id}/park`, T.secA, { lotId: L, slotLabel: 'B2-14' });
  check('valet: park into lot -> parked with slot', r.status === 200 && r.json.data.ticket.status === 'parked' && r.json.data.ticket.slot_label === 'B2-14', r.text);
  r = await call('GET', `/api/parking/lots/${L}`, T.secA);
  check('valet: parked car counts toward lot occupancy (lot now full)', r.json?.data?.cars === c0 + 1, `c0=${c0} cars=${r.json?.data?.cars} cap=${r.json?.data?.car_capacity}`);
  r = await call('GET', `/api/parking/lots/${L}/active-vehicles`, T.secA);
  check('valet: parked car listed as inside the lot', r.json?.data?.some((v) => v.vehicle_number === 'MH14VA0001'), r.text);
  r = await vt('POST', `/tickets/${tWl.id}/park`, T.secA, { lotId: L });
  const tWlAfter = await vt('GET', `/tickets/${tWl.id}`, T.secA);
  check('valet: parking into a full lot -> 409 LOT_FULL and ticket stays received (rolled back)', r.status === 409 && r.json?.code === 'LOT_FULL' && tWlAfter.json.data.status === 'received', r.text);
  r = await vt('POST', `/tickets/${t1.id}/park`, T.secA, { lotId: L });
  check('valet: cannot park a ticket twice -> 409', r.status === 409 && r.json?.code === 'INVALID_STATE', r.text);
  r = await vt('POST', `/tickets/${t1.id}/cancel`, T.secA, { reason: 'changed mind' });
  check('valet: a parked ticket cannot be cancelled -> 409', r.status === 409, r.text);
  r = await vt('POST', `/tickets/${t1.id}/ready`, T.secA);
  check('valet: cannot mark ready before retrieval is requested -> 409', r.status === 409, r.text);
  r = await vt('POST', `/tickets/${t1.id}/request-retrieval`, T.secA);
  check('valet: request retrieval', r.status === 200 && r.json.data.ticket.status === 'retrieval_requested' && r.json.data.ticket.requested_at, r.text);
  await pool.query(`UPDATE parking_vehicle_log SET logged_at = NOW() - INTERVAL '40 minutes' WHERE valet_ticket_id = $1 AND action = 'entry'`, [t1.id]);
  r = await vt('POST', `/tickets/${t1.id}/ready`, T.secA);
  check('valet: mark ready logs the lot exit with server-computed parked time (~40 min)', r.status === 200 && r.json.data.ticket.status === 'ready' && Math.abs(r.json.data.parkedMinutes - 40) <= 1, r.text);
  r = await call('GET', `/api/parking/lots/${L}`, T.secA);
  check('valet: lot occupancy drops back after retrieval', r.json?.data?.cars === c0, r.text);
  r = await vt('POST', `/tickets/${t1.id}/deliver`, T.secA, {});
  check('valet: delivery needs a handover verification -> 400', r.status === 400, r.text);
  r = await vt('POST', `/tickets/${t1.id}/deliver`, T.secA, { verification: 'bogus' });
  check('valet: invalid verification value -> 400', r.status === 400, r.text);
  r = await vt('POST', `/tickets/${t1.id}/deliver`, T.secA, { verification: 'id_check', note: 'Aadhaar seen' });
  check('valet: deliver with ID check', r.status === 200 && r.json.data.ticket.status === 'delivered' && r.json.data.ticket.handover_verification === 'id_check', r.text);
  const linked = (await pool.query(`SELECT count(*)::int AS n FROM parking_vehicle_log WHERE valet_ticket_id = $1`, [t1.id])).rows[0].n;
  check('valet: park + retrieve wrote exactly 2 linked movements', linked === 2, linked);
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'MH14VA0001' });
  check('valet: after delivery the same plate can be ticketed again', r.status === 201, r.text);
  r = await vt('POST', `/tickets/${r.json.data.ticket.id}/cancel`, T.secA, {});
  check('valet: cancel without a reason -> 400', r.status === 400, r.text);
  const again = (await vt('GET', '/tickets?search=MH14VA0001&openOnly=true', T.secA)).json.data[0];
  r = await vt('POST', `/tickets/${again.id}/cancel`, T.secA, { reason: 'Customer took the car back' });
  check('valet: cancel a received ticket with a reason', r.status === 200 && r.json.data.ticket.status === 'cancelled', r.text);
  // two attendants act on the same ticket at once: exactly one wins
  r = await vt('POST', '/tickets', T.secA, { ...cust, vehicleNumber: 'KA05RC0001' });
  const tRace = r.json.data.ticket;
  const both = await Promise.all([vt('POST', `/tickets/${tRace.id}/park`, T.secA, { lotId: OL }), vt('POST', `/tickets/${tRace.id}/park`, T.secA, { lotId: OL })]);
  check('valet: two attendants parking the same ticket at once -> exactly one succeeds', both.filter((x) => x.status === 200).length === 1 && both.filter((x) => x.status === 409).length === 1, both.map((x) => x.status).join(','));
  const inOL = await call('GET', `/api/parking/lots/${OL}`, T.secA);
  check('valet: the double-park logged only one entry (occupancy 1)', inOL.json.data.cars === 1, inOL.text);
  r = await vt('GET', '/tickets?search=43210', T.secA);
  check('valet: search by last phone digits finds tickets', r.status === 200 && r.json.data.length > 0, r.text);
  r = await vt('GET', '/tickets?status=nonsense', T.secA);
  check('valet: invalid status filter -> 400', r.status === 400, r.text);
  r = await vt('GET', '/stats', T.secA);
  check('valet: stats report delivered today and open counts', r.status === 200 && r.json.data.delivered_today === 1 && r.json.data.parked === 1, r.text);
  r = await call('GET', '/api/parking/overview', T.secA);
  check('valet: overview exposes valet_active', r.status === 200 && r.json.data.valet_active >= 1, r.text);

  // ── archive ──
  r = await call('DELETE', `/api/parking/lots/${L}`, T.adminB);
  check('org B cannot archive org A lot -> 404', r.status === 404, r.text);
  r = await call('DELETE', `/api/parking/lots/${L}`, T.adminA);
  check('archive lot', r.status === 200, r.text);
  r = await call('GET', '/api/parking/lots', T.adminA);
  check('archived lot hidden from list', Array.isArray(r.json?.data) && !r.json.data.some((l) => l.id === L), r.text);
  const kept = (await pool.query(`SELECT count(*)::int AS n FROM parking_vehicle_log WHERE organization_id = $1`, [A])).rows[0].n;
  check('movement history survives archiving', kept > 0, kept);
} catch (e) {
  crashed = e;
} finally {
  await cleanup();
  const left = (await pool.query(`SELECT (SELECT count(*) FROM parking_lot WHERE organization_id = ANY($1::int[])) + (SELECT count(*) FROM parking_vehicle_log WHERE organization_id = ANY($1::int[])) AS n`, [[A, B]]).catch(() => ({ rows: [{ n: '?' }] }))).rows[0].n;
  check('no residue after cleanup', Number(left) === 0, left);
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
try { server?.close(); } catch { /* */ }
process.exit(failed.length === 0 && !crashed ? 0 : 1);
