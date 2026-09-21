#!/usr/bin/env node
/**
 * End-to-end verification of camera vision analytics (Security module) through the REAL
 * middleware chain, plus the real edge agent against a mock DVR that requires HTTP digest auth.
 * The vision model is replaced by a stub (no network, no images leave this process).
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION. Run only as OS user
 * `postgres` against the LOCAL unix-socket database (same recipe as verify-parking.mjs):
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-surveillance.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import net from 'net';
import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import { spawn } from 'child_process';
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
const tok = (org, role = 'hospital_admin') => jwt.sign({ id: org, email: `s${org}@verify.invalid`, role, userType: 'hospital', hospital_id: org, tenant_id: org, organization_id: org }, process.env.JWT_SECRET, { expiresIn: '1h' });
const T = { adminA: tok(A), adminB: tok(B), secA: tok(A, 'security_staff'), secB: tok(B, 'security_staff'), otherA: tok(A, 'accounts_staff') };

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 240) });
let BASE = '';
async function call(method, url, token, body, headers = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}
const S = (m, u, t, b) => call(m, `/api/surveillance${u}`, t, b);
const E = (m, u, key, b) => call(m, `/api/surveillance/edge${u}`, null, b, key ? { 'x-gateway-key': key } : {});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), Buffer.alloc(64, 7), Buffer.from([0xff, 0xd9])]);
const JPEG_B64 = JPEG.toString('base64');

// vision stub
let mode = { people: 0, vehicles: 0, fall_or_collapse: false, fire_smoke: false, blocked_exit: false, abandoned_object: false, confidence: 'high', description: 'stub scene' };
let visionCalls = 0; let visionBehaviour = 'ok';
const svcMod = await import(pathToFileURL(path.join(SERVER, 'services/surveillance-analytics.service.js')).href);
svcMod.__setVisionForTests(async () => {
  visionCalls += 1;
  if (visionBehaviour === 'throw') throw new Error('vision provider down');
  if (visionBehaviour === 'garbage') return { content: 'I cannot help', provider: 'stub' };
  return { content: JSON.stringify(mode), provider: 'stub' };
});
const frame = (key, cameraId, extra = {}) => E('POST', '/frames', key, { cameraId, imageBase64: JPEG_B64, ...extra });
const setMode = (m) => { mode = { people: 0, vehicles: 0, fall_or_collapse: false, fire_smoke: false, blocked_exit: false, abandoned_object: false, confidence: 'high', description: 'stub scene', ...m }; };
const reset = (id) => pool.query(`UPDATE surveillance_camera SET last_analysed_at = NULL WHERE id = $1`, [id]);

const cleanup = async () => {
  for (const t of ['surveillance_event', 'surveillance_frame_log', 'surveillance_rule', 'surveillance_camera', 'surveillance_recorder', 'surveillance_gateway']) {
    await pool.query(`DELETE FROM ${t} WHERE organization_id = ANY($1::int[])`, [[A, B]]).catch(() => {});
  }
};
const hhmm = (mins) => { const m = ((mins % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const istNowMinutes = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return (Number(p.find((x) => x.type === 'hour').value) % 24) * 60 + Number(p.find((x) => x.type === 'minute').value); };

// mock DVR: Hikvision-style snapshot path guarded by HTTP digest auth
const DVR_USER = 'viewer'; const DVR_PASS = 'dvr-secret'; const REALM = 'mockdvr';
const dvr = { unauth: 0, authed: 0, bad: 0 };
const mockDvr = http.createServer((req, res) => {
  if (req.url !== '/ISAPI/Streaming/channels/101/picture') { res.statusCode = 404; return res.end(); }
  const h = req.headers.authorization;
  if (!h) { dvr.unauth += 1; res.statusCode = 401; res.setHeader('WWW-Authenticate', `Digest realm="${REALM}", qop="auth", nonce="abc123nonce", opaque="op"`); return res.end(); }
  const p = {}; for (const m of h.replace(/^Digest\s+/, '').matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]*))/g)) p[m[1]] = m[2] ?? m[3];
  const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
  const expect = md5(`${md5(`${DVR_USER}:${REALM}:${DVR_PASS}`)}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${md5(`GET:${req.url}`)}`);
  if (p.username === DVR_USER && p.response === expect) { dvr.authed += 1; res.setHeader('Content-Type', 'image/jpeg'); return res.end(JPEG); }
  dvr.bad += 1; res.statusCode = 401; res.setHeader('WWW-Authenticate', `Digest realm="${REALM}", qop="auth", nonce="abc123nonce"`); res.end();
});
await new Promise((r) => mockDvr.listen(0, '127.0.0.1', r));
const DVR_PORT = mockDvr.address().port;

const runAgent = (cfgObj) => new Promise((resolve) => {
  const f = path.join(os.tmpdir(), `agent-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(cfgObj), { mode: 0o600 });
  const p = spawn(process.execPath, [path.join(ROOT, 'edge/surveillance-agent/agent.mjs'), '--config', f, '--once'], { env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  let so = ''; let se = '';
  p.stdout.on('data', (c) => { so += c; }); p.stderr.on('data', (c) => { se += c; });
  const timer = setTimeout(() => p.kill('SIGKILL'), 60000);
  p.on('close', (code) => { clearTimeout(timer); fs.rmSync(f, { force: true }); resolve({ code, stdout: so, stderr: se }); });
});

let server; let crashed = null;
try {
  const { up } = await import(pathToFileURL(path.join(SERVER, 'migrations/surveillance-analytics.migration.js')).href);
  await up(); await up();
  check('migration runs twice without error', true);
  await cleanup();

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── access ──
  let r = await S('GET', '/cameras');
  check('no token -> 401', r.status === 401, r.text);
  r = await S('GET', '/cameras', T.otherA);
  check('non-security hospital role -> 403', r.status === 403, r.text);
  r = await S('GET', '/cameras', T.secA);
  check('security_staff reaches the module -> 200', r.status === 200 && Array.isArray(r.json?.data), r.text);
  r = await E('GET', '/config', null);
  check('edge without key -> 401', r.status === 401, r.text);
  r = await E('GET', '/config', 'sgw_not-a-real-key');
  check('edge with wrong key -> 401', r.status === 401, r.text);
  r = await S('GET', '/catalog', T.secA);
  check('catalog lists the analytics', r.status === 200 && r.json.data.analytics.length === 9, r.text);

  // ── gateways ──
  r = await S('POST', '/gateways', T.secA, { name: 'Hospital LAN gateway' });
  check('security_staff cannot issue gateway keys -> 403', r.status === 403, r.text);
  r = await S('POST', '/gateways', T.adminA, { name: 'Hospital LAN gateway', siteLabel: 'Server room' });
  const gwA = r.json?.data?.gateway; const keyA = r.json?.data?.apiKey;
  check('admin issues a gateway key (shown once, sgw_ prefix)', r.status === 201 && /^sgw_[0-9a-f]{64}$/.test(keyA || ''), r.text);
  const stored = (await pool.query(`SELECT api_key_hash FROM surveillance_gateway WHERE id = $1`, [gwA.id])).rows[0].api_key_hash;
  check('only the sha256 hash of the key is stored', stored === crypto.createHash('sha256').update(keyA).digest('hex') && !stored.includes(keyA), stored);
  r = await S('GET', '/gateways', T.secA);
  check('gateway list never exposes the key or its hash', r.status === 200 && !r.text.includes(keyA) && !r.text.includes(stored), r.text);
  r = await S('POST', '/gateways', T.adminB, { name: 'B gateway' });
  const gwB = r.json.data.gateway; const keyB = r.json.data.apiKey;

  // ── recorders ──
  r = await S('POST', '/recorders', T.secA, { name: 'Main DVR', vendor: 'hikvision', host: '192.168.1.10', port: 80, channelCount: 16, gatewayId: gwA.id });
  const recA = r.json?.data;
  check('create recorder -> 201', r.status === 201 && recA?.gateway_id === gwA.id, r.text);
  r = await S('POST', '/recorders', T.secA, { name: 'main dvr', vendor: 'hikvision' });
  check('duplicate recorder name (case-insensitive) -> 409', r.status === 409, r.text);
  r = await S('POST', '/recorders', T.secA, { name: 'Bad', vendor: 'notabrand' });
  check('unknown vendor -> 400', r.status === 400, r.text);
  r = await S('POST', '/recorders', T.secA, { name: 'Steal', gatewayId: gwB.id });
  check("cannot attach another organization's gateway -> 404", r.status === 404, r.text);
  r = await S('POST', '/recorders', T.secA, { name: 'Bad host', host: 'evil host; rm -rf' });
  check('invalid host -> 400', r.status === 400, r.text);

  // ── cameras & privacy ──
  r = await S('POST', '/cameras', T.secA, { name: 'Main gate', zone: 'Main gate', zoneType: 'entrance', recorderId: recA.id, channelNo: 1 });
  const camPub = r.json?.data;
  check('entrance camera defaults to privacy class public and analytics allowed', r.status === 201 && camPub.privacy_class === 'public' && camPub.analytics_allowed === true, r.text);
  r = await S('POST', '/cameras', T.secA, { name: 'ICU corridor', zoneType: 'icu', recorderId: recA.id, channelNo: 2 });
  const camIcu = r.json?.data;
  check('ICU camera defaults to clinical and analytics blocked', r.status === 201 && camIcu.privacy_class === 'clinical' && camIcu.analytics_allowed === false, r.text);
  r = await S('POST', '/cameras', T.secA, { name: 'Dup', zoneType: 'entrance', recorderId: recA.id, channelNo: 1 });
  check('same recorder channel twice -> 409', r.status === 409, r.text);
  r = await S('POST', '/cameras', T.secA, { name: 'Bad interval', analysisIntervalSeconds: 2 });
  check('analysis interval below 10s -> 400', r.status === 400, r.text);
  r = await S('GET', `/cameras/${camPub.id}`, T.secB);
  check('org B cannot read org A camera -> 404', r.status === 404, r.text);
  r = await S('POST', `/cameras/${camIcu.id}/rules`, T.secA, { analytic: 'restricted_area' });
  check('rule on an unapproved clinical camera -> 409 PRIVACY_REVIEW_REQUIRED', r.status === 409 && r.json?.code === 'PRIVACY_REVIEW_REQUIRED', r.text);
  r = await S('POST', `/cameras/${camIcu.id}/privacy-approval`, T.secA, { note: 'ok' });
  check('security_staff cannot approve privacy -> 403', r.status === 403, r.text);
  r = await S('POST', `/cameras/${camIcu.id}/privacy-approval`, T.adminA, {});
  check('privacy approval needs a note -> 400', r.status === 400, r.text);
  r = await S('POST', `/cameras/${camIcu.id}/privacy-approval`, T.adminB, { note: 'x' });
  check('org B admin cannot approve org A camera -> 404', r.status === 404, r.text);
  r = await S('POST', `/cameras/${camPub.id}/privacy-approval`, T.adminA, { note: 'x' });
  check('approving a non-clinical camera -> 409', r.status === 409, r.text);

  // ── rules ──
  const rule = (camId, body) => S('POST', `/cameras/${camId}/rules`, T.secA, body);
  r = await rule(camPub.id, { analytic: 'crowd_density' });
  check('crowd rule without a limit -> 400', r.status === 400, r.text);
  r = await rule(camPub.id, { analytic: 'crowd_density', threshold: 0 });
  check('crowd limit of 0 -> 400', r.status === 400, r.text);
  r = await rule(camPub.id, { analytic: 'after_hours_presence' });
  check('after-hours rule without schedule -> 400', r.status === 400, r.text);
  r = await rule(camPub.id, { analytic: 'after_hours_presence', schedule: { start: '25:00', end: '06:00' } });
  check('invalid schedule time -> 400', r.status === 400, r.text);
  r = await rule(camPub.id, { analytic: 'teleportation' });
  check('unknown analytic -> 400', r.status === 400, r.text);
  r = await rule(camPub.id, { analytic: 'crowd_density', threshold: 5, severity: 'medium', cooldownMinutes: 10 });
  const crowdRule = r.json?.data;
  check('create crowd rule (limit 5)', r.status === 201 && crowdRule.threshold === 5, r.text);
  r = await S('POST', `/cameras/${camPub.id}/rules`, T.secB, { analytic: 'fire_smoke' });
  check('org B cannot add rules to org A camera -> 404', r.status === 404, r.text);
  r = await rule(camPub.id, { analytic: 'fall_or_collapse', cooldownMinutes: 0 });
  const fallRule = r.json?.data;
  check('create person-down rule (defaults to high severity)', r.status === 201 && fallRule.severity === 'high', r.text);
  r = await rule(camPub.id, { analytic: 'fire_smoke', cooldownMinutes: 0 });
  r = await S('PATCH', `/rules/${crowdRule.id}`, T.secA, { threshold: 8 });
  check('update rule threshold', r.status === 200 && r.json.data.threshold === 8, r.text);
  await S('PATCH', `/rules/${crowdRule.id}`, T.secA, { threshold: 5 });
  r = await S('PATCH', `/rules/${crowdRule.id}`, T.secB, { threshold: 1 });
  check('org B cannot edit org A rule -> 404', r.status === 404, r.text);

  // ── edge config ──
  r = await E('GET', '/config', keyA);
  check('edge config lists this gateway’s cameras and flags the ones that want frames', r.status === 200 && r.json.data.cameras.some((c) => c.cameraId === camPub.id && c.wantsFrames === true), r.text);
  check('edge config marks the unapproved clinical camera as not wanting frames', r.json.data.cameras.find((c) => c.cameraId === camIcu.id)?.wantsFrames === false, r.text);
  r = await E('GET', '/config', keyB);
  check('another organization’s gateway sees none of these cameras', r.status === 200 && r.json.data.cameras.length === 0, r.text);

  // ── frame pipeline ──
  r = await frame(keyB, camPub.id);
  check('another organization’s gateway cannot send frames for this camera -> 404', r.status === 404, r.text);
  r = await E('POST', '/frames', keyA, { cameraId: camPub.id, imageBase64: '###' });
  check('non-base64 frame -> 400', r.status === 400, r.text);
  r = await frame(keyA, camPub.id, { mimeType: 'image/gif' });
  check('unsupported mime type -> 400', r.status === 400, r.text);
  r = await E('POST', '/frames', keyA, { cameraId: camPub.id, imageBase64: 'A'.repeat(4 * 1024 * 1024 + 1) });
  check('oversized frame -> 413', r.status === 413, `${r.status}`);
  r = await frame(keyA, camIcu.id);
  check('frame from an unapproved clinical camera is not analysed (skipped_privacy)', r.status === 200 && r.json.data.outcome === 'skipped_privacy' && visionCalls === 0, `${r.text} calls=${visionCalls}`);

  setMode({ people: 7 });
  r = await frame(keyA, camPub.id);
  check('frame with 7 people vs limit 5 -> analysed, 1 crowd event', r.status === 200 && r.json.data.outcome === 'analysed' && r.json.data.events.length === 1 && r.json.data.events[0].analytic === 'crowd_density', r.text);
  r = await frame(keyA, camPub.id);
  check('a second frame inside the interval is skipped without calling the model', r.json.data.outcome === 'skipped_interval' && visionCalls === 1, `${r.text} calls=${visionCalls}`);
  await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('after the interval it is analysed but the cooldown suppresses a duplicate event', r.json.data.outcome === 'analysed' && r.json.data.events.length === 0, r.text);
  setMode({ people: 2 });
  await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('2 people (below limit) raises no event', r.json.data.outcome === 'analysed' && r.json.data.events.length === 0, r.text);
  setMode({ fall_or_collapse: true, confidence: 'medium', description: 'person on floor' });
  await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('person-down flag -> high-severity event with the model’s confidence', r.json.data.events.length === 1 && r.json.data.events[0].severity === 'high', r.text);
  setMode({ fire_smoke: true });
  await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('fire/smoke flag -> event', r.json.data.events.some((e) => e.analytic === 'fire_smoke'), r.text);

  visionBehaviour = 'throw'; await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('vision provider down -> vision_unavailable with retryAfterSeconds (not a fake result)', r.status === 200 && r.json.data.outcome === 'vision_unavailable' && r.json.data.retryAfterSeconds > 0 && r.json.data.events.length === 0, r.text);
  visionBehaviour = 'garbage'; await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('unparseable model output -> vision_unreadable, no events', r.json.data.outcome === 'vision_unreadable' && r.json.data.events.length === 0, r.text);
  visionBehaviour = 'ok';

  await pool.query(`UPDATE surveillance_camera SET daily_frame_budget = 0 WHERE id = $1`, [camPub.id]); await reset(camPub.id);
  r = await frame(keyA, camPub.id);
  check('daily frame budget exhausted -> skipped_budget', r.json.data.outcome === 'skipped_budget', r.text);
  await pool.query(`UPDATE surveillance_camera SET daily_frame_budget = 1440 WHERE id = $1`, [camPub.id]);

  // concurrency: six frames at once, one model call
  setMode({ people: 0 }); await reset(camPub.id); const before = visionCalls;
  const burst = await Promise.all(Array.from({ length: 6 }, () => frame(keyA, camPub.id)));
  check('6 simultaneous frames -> exactly one analysed and one model call', burst.filter((x) => x.json.data.outcome === 'analysed').length === 1 && visionCalls - before === 1, burst.map((x) => x.json?.data?.outcome).join(','));

  // schedule windows (hospital-local time)
  r = await S('POST', '/cameras', T.secA, { name: 'Pharmacy store', zoneType: 'store', recorderId: recA.id, channelNo: 3 });
  const camStore = r.json.data;
  check('store camera defaults to restricted (analytics allowed)', camStore.privacy_class === 'restricted' && camStore.analytics_allowed === true, JSON.stringify(camStore));
  const now = istNowMinutes();
  r = await S('POST', `/cameras/${camStore.id}/rules`, T.secA, { analytic: 'after_hours_presence', schedule: { start: hhmm(now + 120), end: hhmm(now + 180) } });
  const offRule = r.json?.data;
  setMode({ people: 1 });
  r = await frame(keyA, camStore.id);
  check('after-hours rule outside its window is not evaluated (skipped_no_rules)', r.json.data.outcome === 'skipped_no_rules', r.text);
  await S('PATCH', `/rules/${offRule.id}`, T.secA, { schedule: { start: hhmm(now - 60), end: hhmm(now + 60) } });
  await reset(camStore.id);
  r = await frame(keyA, camStore.id);
  check('inside the window a person raises an after-hours event', r.json.data.outcome === 'analysed' && r.json.data.events.length === 1 && r.json.data.events[0].analytic === 'after_hours_presence', r.text);
  await S('PATCH', `/rules/${offRule.id}`, T.secA, { schedule: { start: hhmm(now + 30), end: hhmm(now - 30) } });
  await reset(camStore.id); await pool.query(`DELETE FROM surveillance_event WHERE camera_id = $1`, [camStore.id]);
  r = await frame(keyA, camStore.id);
  check('a window that wraps midnight and excludes now is not evaluated', r.json.data.outcome === 'skipped_no_rules', r.text);

  // approved clinical camera becomes analysable
  r = await S('POST', `/cameras/${camIcu.id}/privacy-approval`, T.adminA, { note: 'Approved by CMO for after-hours corridor safety, no faces retained' });
  check('admin approves ICU corridor camera with a note', r.status === 200 && r.json.data.analytics_allowed === true, r.text);
  r = await rule(camIcu.id, { analytic: 'fall_or_collapse', cooldownMinutes: 0 });
  check('rule now allowed on the approved clinical camera', r.status === 201, r.text);
  r = await S('PATCH', `/cameras/${camIcu.id}`, T.secA, { privacyClass: 'clinical' });
  check('reclassifying a camera resets its approval', r.status === 200 && r.json.data.analytics_allowed === false, r.text);
  setMode({ fall_or_collapse: true });
  r = await frame(keyA, camIcu.id);
  check('after reset the camera is blocked again (skipped_privacy)', r.json.data.outcome === 'skipped_privacy', r.text);

  // ── native camera/DVR alarms ──
  const ev = (events) => E('POST', '/events', keyA, { events });
  r = await ev([{ cameraId: camPub.id, type: 'intrusion' }, { cameraId: camPub.id, type: 'intrusion' }, { cameraId: camPub.id, type: 'motion' }, { cameraId: 99999999, type: 'tamper' }, { cameraId: camPub.id, type: 'made_up' }]);
  check('native alarms: 1 stored, duplicate + motion ignored, unknown camera/type rejected', r.status === 200 && r.json.data.stored === 1 && r.json.data.ignored === 2 && r.json.data.rejected === 2, r.text);
  r = await E('POST', '/events', keyB, { events: [{ cameraId: camPub.id, type: 'tamper' }] });
  check('another organization’s gateway cannot raise alarms on this camera', r.json?.data?.rejected === 1 && r.json.data.stored === 0, r.text);
  await ev([{ cameraId: camStore.id, type: 'video_loss' }]);
  check('video loss marks the camera offline', (await S('GET', `/cameras/${camStore.id}`, T.secA)).json.data.status === 'offline');
  await ev([{ cameraId: camStore.id, type: 'video_restored' }]);
  check('video restored marks it online again', (await S('GET', `/cameras/${camStore.id}`, T.secA)).json.data.status === 'online');
  r = await E('POST', '/events', keyA, { events: 'nope' });
  check('events must be an array -> 400', r.status === 400, r.text);

  // ── heartbeat ──
  r = await E('POST', '/heartbeat', keyA, { cameras: [{ cameraId: camPub.id, online: false }, { cameraId: camStore.id, online: true }], recorders: [{ name: 'Main DVR', online: true }] });
  check('heartbeat updates camera and recorder status', r.status === 200 && r.json.data.camerasUpdated === 2, r.text);
  r = await E('POST', '/heartbeat', keyB, { cameras: [{ cameraId: camPub.id, online: true }] });
  check('another organization’s gateway cannot change this camera’s status', r.json?.data?.camerasUpdated === 0, r.text);
  check('recorder marked online with a last-seen time', (await S('GET', '/recorders', T.secA)).json.data.find((x) => x.id === recA.id)?.status === 'online');

  // ── events workflow ──
  r = await S('GET', '/events?status=new', T.secA);
  const evs = r.json?.data || [];
  check('events list (new) includes vision and camera_native sources', evs.some((e) => e.source === 'vision') && evs.some((e) => e.source === 'camera_native'), r.text);
  const target = evs.find((e) => e.analytic === 'crowd_density');
  r = await S('POST', `/events/${target.id}/handle`, T.secA, { status: 'dismissed' });
  check('dismissing needs a note -> 400', r.status === 400, r.text);
  r = await S('POST', `/events/${target.id}/handle`, T.secB, { status: 'acknowledged' });
  check('org B cannot handle org A events -> 404', r.status === 404, r.text);
  r = await S('POST', `/events/${target.id}/handle`, T.secA, { status: 'acknowledged' });
  check('acknowledge an event', r.status === 200 && r.json.data.status === 'acknowledged' && r.json.data.handled_at, r.text);
  r = await S('POST', `/events/${target.id}/handle`, T.secA, { status: 'escalated', note: 'Sent guard to the gate' });
  check('escalate an acknowledged event with a note', r.status === 200 && r.json.data.status === 'escalated', r.text);
  r = await S('POST', `/events/${target.id}/handle`, T.secA, { status: 'dismissed', note: 'x' });
  check('a closed event cannot be changed again -> 409', r.status === 409, r.text);
  r = await S('GET', '/events?status=nonsense', T.secA);
  check('invalid status filter -> 400', r.status === 400, r.text);
  r = await S('GET', '/events', T.secB);
  check('org B sees none of org A events', r.status === 200 && r.json.data.length === 0, r.text);

  // ── overview ──
  r = await S('GET', '/overview', T.secA);
  const o = r.json?.data;
  check('overview: cameras, privacy-blocked, events and vision status are reported', r.status === 200 && o.cameras === 3 && o.blocked_by_privacy === 1 && o.events_new >= 1 && o.gateways === 1 && ['ok', 'degraded', 'unavailable', 'idle'].includes(o.vision_status) && o.external_vision_allowed === false, r.text);

  // ── privacy: no image column anywhere ──
  const imgCols = (await pool.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_name LIKE 'surveillance_%' AND (column_name ILIKE '%image%' OR column_name ILIKE '%frame_data%' OR column_name ILIKE '%snapshot%' OR data_type = 'bytea')`)).rows;
  check('no table can hold an image (frames are analysed in memory and discarded)', imgCols.length === 0, JSON.stringify(imgCols));

  // ── purge ──
  await pool.query(`INSERT INTO surveillance_frame_log (organization_id, camera_id, outcome, received_at) VALUES ($1, $2, 'analysed', NOW() - INTERVAL '45 days')`, [A, camPub.id]);
  const purged = await svcMod.default.purge();
  check('purge removes frame logs older than 30 days', purged.frameLogsDeleted >= 1, JSON.stringify(purged));
  check('purge keeps detection events', Number((await pool.query(`SELECT count(*) FROM surveillance_event WHERE organization_id = $1`, [A])).rows[0].count) > 0);

  // ── real edge agent against a mock DVR using HTTP digest auth ──
  const camAgent = (await S('POST', '/cameras', T.secA, { name: 'Agent test', zoneType: 'lobby', recorderId: recA.id, channelNo: 4 })).json.data;
  // the mock DVR serves /channels/101 (Hikvision channel 1): give that camera an agent-visible channel
  await pool.query(`UPDATE surveillance_camera SET channel_no = 1, is_active = false WHERE id = $1`, [camPub.id]); // free channel 1 (analysis tests are done)
  await pool.query(`UPDATE surveillance_camera SET channel_no = 1 WHERE id = $1`, [camAgent.id]);
  await S('POST', `/cameras/${camAgent.id}/rules`, T.secA, { analytic: 'crowd_density', threshold: 3, cooldownMinutes: 0 });
  setMode({ people: 9 }); await reset(camAgent.id);
  const agentCfg = (pw) => ({ cloudUrl: BASE, gatewayKey: keyA, heartbeatSeconds: 60, recorders: { 'Main DVR': { vendor: 'hikvision', scheme: 'http', host: '127.0.0.1', port: DVR_PORT, username: DVR_USER, password: pw } } });
  let a = await runAgent(agentCfg(DVR_PASS));
  const created = (await pool.query(`SELECT count(*)::int AS n FROM surveillance_event WHERE camera_id = $1 AND source = 'vision'`, [camAgent.id])).rows[0].n;
  check('agent: authenticates to the DVR with HTTP digest, uploads the frame, cloud raises the event', a.code === 0 && dvr.unauth >= 1 && dvr.authed >= 1 && created === 1, `code=${a.code} dvr=${JSON.stringify(dvr)} events=${created} out=${a.stdout.slice(-300)} err=${a.stderr.slice(-200)}`);
  check('agent: heartbeat marked the camera online', (await S('GET', `/cameras/${camAgent.id}`, T.secA)).json.data.status === 'online');
  check('agent: never prints the gateway key or the DVR password', !a.stdout.includes(keyA) && !a.stdout.includes(DVR_PASS) && !a.stderr.includes(keyA) && !a.stderr.includes(DVR_PASS), a.stdout.slice(-200));
  check('agent: recorder credentials are not stored in the cloud', !(await pool.query(`SELECT to_jsonb(r)::text AS t FROM surveillance_recorder r WHERE id = $1`, [recA.id])).rows[0].t.includes(DVR_PASS));
  await reset(camAgent.id);
  a = await runAgent(agentCfg('wrong-password'));
  check('agent: wrong DVR password -> capture fails, camera reported offline, no upload', a.code === 0 && dvr.bad >= 1 && /capture failed/.test(a.stdout) && (await S('GET', `/cameras/${camAgent.id}`, T.secA)).json.data.status === 'offline', `${a.stdout.slice(-250)}`);
  a = await runAgent({ ...agentCfg(DVR_PASS), gatewayKey: 'sgw_wrong' });
  check('agent: wrong gateway key exits with an error', a.code === 1 && /401|Invalid/.test(a.stderr), `${a.code} ${a.stderr.slice(-200)}`);

  // deactivated gateway
  r = await S('DELETE', `/gateways/${gwA.id}`, T.adminA);
  check('admin deactivates a gateway', r.status === 200, r.text);
  r = await E('GET', '/config', keyA);
  check('a deactivated gateway key stops working immediately -> 401', r.status === 401, r.text);
} catch (e) {
  crashed = e;
} finally {
  await cleanup();
  const left = (await pool.query(`SELECT (SELECT count(*) FROM surveillance_camera WHERE organization_id = ANY($1::int[])) + (SELECT count(*) FROM surveillance_event WHERE organization_id = ANY($1::int[])) + (SELECT count(*) FROM surveillance_gateway WHERE organization_id = ANY($1::int[])) AS n`, [[A, B]]).catch(() => ({ rows: [{ n: '?' }] }))).rows[0].n;
  check('no residue after cleanup', Number(left) === 0, left);
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
try { server?.close(); mockDvr.close(); } catch { /* */ }
process.exit(failed.length === 0 && !crashed ? 0 : 1);
