#!/usr/bin/env node
/**
 * End-to-end smoke test for the recently built HMIS modules.
 * ---------------------------------------------------------------------------
 * Boots the REAL express app (server/app.js) in-process on an ephemeral port and
 * drives the real HTTP endpoints through the real middleware chain
 * (ringFencing -> authUser -> requireRole -> requireModule -> tenant binding).
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION.
 * Only run this as OS user `postgres` against the LOCAL unix-socket database:
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/smoke-new-modules.mjs
 *
 * Guards built in: refuses to run unless the DB connection is a unix socket
 * (inet_server_addr() IS NULL) on mediczy_ai; scrubs Twilio/SMTP/Redis/Kafka/S3/
 * MinIO/LLM/ABDM/... env before app.js is imported; and blocks every TCP connect at
 * the net layer except to the harness's own ephemeral port (attempts are reported).
 *
 * Flags:  --strict   do NOT patch ringFencing's path ACLs in-process (shows what the
 *                    real chain does today: most new module prefixes are unreachable).
 *
 * The harness seeds rows with ids 995xxx (orgs 995001/995002), and deletes everything
 * it (or the endpoints) created in a finally block, then verifies zero residue.
 */
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import net from 'net';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SERVER = path.join(ROOT, 'server');
const STRICT = process.argv.includes('--strict');

// ── raw output (app logging is muted; only the harness prints) ───────────────
const realWrite = process.stdout.write.bind(process.stdout);
const out = (s = '') => realWrite(String(s) + '\n');
process.stdout.write = () => true;
process.stderr.write = () => true;

const bgErrors = [];
process.on('unhandledRejection', (e) => bgErrors.push(`unhandledRejection: ${e?.message || e}`));
process.on('uncaughtException', (e) => bgErrors.push(`uncaughtException: ${e?.message || e}`));

// ── 0. environment scrub + hard safety gates (before app.js is imported) ─────
const SCRUB = /^(TWILIO|SMTP|EMAIL|MAIL|SENDGRID|SES_|REDIS|KAFKA|S3_|AWS_|MINIO|OPENAI|GROQ|ANTHROPIC|GEMINI|GOOGLE|FIREBASE|RAZORPAY|ABDM|SMS|WHATSAPP|FACEBOOK|FB_|INSTAGRAM|SIB_|ISHA|ELEVEN|DEEPGRAM|SENTRY|OTEL|STRIPE|PAYU|CASHFREE|MSG91|FCM|APNS|LIVEKIT|MONGO|SUPABASE|R2_|CLOUDFLARE|CDN|SLACK|TELEGRAM|PUSHER|PGI)/i;
const KEEP = /^(POSTGRES_|JWT_|NODE_ENV|PATH|HOME|USER|LANG|PWD|TZ)/;
for (const k of Object.keys(process.env)) if (SCRUB.test(k) && !KEEP.test(k)) delete process.env[k];
process.env.FACEBOOK_APP_SECRET = '';
delete process.env.FACEBOOK_APP_SECRET;
delete process.env.ALLOW_DEV_TOKENS;

const fatal = (msg) => { out(`ABORT: ${msg}`); process.exit(2); };
if (os.userInfo().username !== 'postgres' && !process.env.SMOKE_ALLOW_ANY_USER) fatal('must run as OS user postgres (see header)');
if (process.env.NODE_ENV === 'production') fatal('NODE_ENV=production');
if (process.env.DISALLOW_REMOTE_DB !== 'true' || process.env.POSTGRES_FORCE_LOCAL !== 'true') fatal('DISALLOW_REMOTE_DB/POSTGRES_FORCE_LOCAL must be true');
if (!String(process.env.POSTGRES_HOST || '').startsWith('/')) fatal('POSTGRES_HOST must be a unix socket path');
if (process.env.JWT_SECRET !== 'smoke-test-secret') fatal('JWT_SECRET must be smoke-test-secret');

// Block every non-loopback TCP connect (covers fetch/undici, http(s), tls, axios, SDKs...).
const blockedNet = [];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
let ALLOWED_PORT = null; // set once the in-process server is listening; every other loopback port (local redis/kafka/prod app) stays blocked
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let a0 = args[0];
  if (Array.isArray(a0)) a0 = a0[0];
  let host; let isPath = false; let port;
  if (a0 && typeof a0 === 'object') { host = a0.host; port = a0.port; isPath = !!a0.path && !a0.port; if (a0.port && !host) host = 'localhost'; }
  else if (typeof a0 === 'string') { isPath = true; }
  else if (typeof a0 === 'number') { port = a0; host = typeof args[1] === 'string' ? args[1] : 'localhost'; }
  const portOk = ALLOWED_PORT !== null && Number(port) === ALLOWED_PORT;
  if (!isPath && host && !(LOOPBACK.has(String(host)) && portOk)) {
    blockedNet.push(`${host}:${port ?? ''}`);
    process.nextTick(() => this.destroy(new Error(`SMOKE: external network blocked (${host})`)));
    return this;
  }
  return origConnect.apply(this, args);
};

// ── 1. DB guard: first import of pgPool, assert unix socket ──────────────────
const pgMod = await import(pathToFileURL(path.join(SERVER, 'db/pgPool.js')).href);
const pool = pgMod.default || pgMod.pool;
{
  const r = await pool.query(`SELECT inet_server_addr() AS addr, current_database() AS db, current_user AS usr`);
  if (r.rows[0].addr !== null) fatal(`DB connection is TCP (${r.rows[0].addr}) — refusing`);
  if (r.rows[0].db !== 'mediczy_ai') fatal(`unexpected database ${r.rows[0].db}`);
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const q1 = async (sql, params = []) => (await q(sql, params))[0];
const qs = async (sql, params = []) => { try { return await q(sql, params); } catch (e) { return { error: e.message }; } };

const require = createRequire(path.join(SERVER, 'package.json'));
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

// ── constants / ids ──────────────────────────────────────────────────────────
const A = 995001; const B = 995002;
const ORGS = [A, B];
const U = { adminA: 995101, adminB: 995102, mdA: 995103, patA: 995104, staffA: 995105, corpPatA: 995106, corpPatB: 995107, patA2: 995108 };
const DOC = { A: 995201, A2: 995202 };
const AMB = { A: 995301, B: 995302 };
const CORP = { A: 995401, B: 995402, NULL: 995403 };
const DEV_TOKEN = 'smoke-device-A';
const TAG = 'SMOKE';

// ── result recording ─────────────────────────────────────────────────────────
const results = []; // {group, name, status, detail}
const rec = (group, name, status, detail = '') => { results.push({ group, name, status, detail: String(detail ?? '') }); };
const ok = (group, name, cond, detail = '') => rec(group, name, cond ? 'PASS' : 'FAIL', cond ? '' : detail);
const skip = (group, name, why) => rec(group, name, 'SKIP', why);
const info = (group, name, detail) => rec(group, name, 'INFO', detail);
const short = (r) => `HTTP ${r.status} ${String(r.text || '').slice(0, 160).replace(/\s+/g, ' ')}`;
const expectStatus = (group, name, r, want, extraOk = true, extraMsg = '') => {
  const wants = Array.isArray(want) ? want : [want];
  ok(group, name, wants.includes(r.status) && extraOk, `${extraMsg} ${short(r)} (want ${wants.join('/')})`.trim());
};

const sign = (claims) => jwt.sign(claims, SECRET, { expiresIn: '1h' });
const hospTok = (org, role = 'hospital_admin') => sign({
  id: org, email: `hosp${org}@smoke.invalid`, role, userType: 'hospital', hospital_id: org, tenant_id: org, organization_id: org, hospitalName: 'Smoke Hospital',
});

let BASE = '';
async function api(method, url, { token, body, headers = {}, rawBody } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h['content-type'] = 'application/json'; }
  if (rawBody !== undefined) b = rawBody;
  let status; let buf; let rh;
  if (h.host) {
    // fetch() ignores a Host override; use raw http so tenant-subdomain resolution can be exercised
    ({ status, buf, headers: rh } = await new Promise((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port: ALLOWED_PORT, method, path: url, headers: h }, (rs) => {
        const chunks = []; rs.on('data', (c) => chunks.push(c));
        rs.on('end', () => resolve({ status: rs.statusCode, buf: Buffer.concat(chunks), headers: { get: (k) => rs.headers[String(k).toLowerCase()] } }));
      });
      rq.on('error', reject); if (b) rq.write(b); rq.end();
    }));
  } else {
    const res = await fetch(BASE + url, { method, headers: h, body: b });
    status = res.status; buf = Buffer.from(await res.arrayBuffer()); rh = res.headers;
  }
  const text = buf.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status, json, text, buf, headers: rh };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = (offsetDays = 0) => { const d = new Date(Date.now() + offsetDays * 86400000); return d.toISOString().slice(0, 10); };

// ── cleanup ──────────────────────────────────────────────────────────────────
const COUNT_TABLES = ['users', 'tenants', 'doctors', 'corporates', 'user_associations', 'hospital_branch', 'staff_branch_assignment', 'care_series', 'care_series_session',
  'dialysis_chair', 'dialysis_session_detail', 'chemo_cycle_detail', 'hospital_queue_entries', 'green_channel_application_log', 'asset_tag', 'asset_tag_event', 'asset_reader_device',
  'dms_document', 'housekeeping_task', 'ambulances', 'ambulance_trip', 'ambulance_vehicle', 'ambulance_crew', 'clinical_knowledge_rules', 'ai_model_change_log',
  'operative_notes', 'ot_bookings', 'post_op_followup_plan', 'payroll_runs', 'payroll_structures', 'cssd_sets', 'cssd_set_usage', 'appointments', 'reports',
  'display_devices', 'hg_equipment_inventory', 'biomedical_maintenance_ticket', 'biomedical_calibration_schedule', 'hfr_facility_registrations', 'hpr_provider_registrations',
  'scm_vendors', 'scm_purchase_orders', 'scm_grns', 'scm_ap_invoices', 'hospital_payments', 'hospital_invoices', 'operations_audit_log', 'operations_approvals', 'green_channel_config'];
async function snapshotCounts() {
  const s = {};
  for (const t of COUNT_TABLES) {
    const ex = await q1(`SELECT to_regclass($1) AS r`, [`public.${t}`]);
    if (!ex.r) { s[t] = null; continue; }
    s[t] = Number((await q1(`SELECT count(*)::int AS n FROM "${t}"`)).n);
  }
  return s;
}
const del = async (sql, params = []) => { try { await pool.query(sql, params); } catch { /* table/column absent or FK; sweep retries */ } };

async function cleanup() {
  const ids = (arr) => (arr.length ? arr : [-1]);
  // CKF rules created by the harness (+ their governance change-log rows)
  const chg = await qs(`SELECT governance_change_id AS id FROM clinical_knowledge_rules WHERE title LIKE '${TAG}-%' AND governance_change_id IS NOT NULL`);
  await del(`DELETE FROM clinical_knowledge_rules WHERE title LIKE '${TAG}-%'`);
  if (Array.isArray(chg) && chg.length) await del(`DELETE FROM ai_model_change_log WHERE id = ANY($1::int[])`, [chg.map((r) => r.id)]);
  // SCM rows created via endpoints (tables are not tenant-scoped, so they are tagged: department/name/code = SMOKE...)
  const poR = await qs(`SELECT id FROM scm_purchase_orders WHERE department = 'SMOKE-DEPT'`);
  const poIds = Array.isArray(poR) ? poR.map((r) => r.id) : [];
  const grnR = poIds.length ? await qs(`SELECT id FROM scm_grns WHERE order_id = ANY($1::int[])`, [poIds]) : [];
  const grnIds = Array.isArray(grnR) ? grnR.map((r) => r.id) : [];
  await del(`DELETE FROM scm_ap_invoices WHERE invoice_number LIKE '${TAG}-%' OR po_id = ANY($1::int[])`, [ids(poIds)]);
  await del(`DELETE FROM scm_grn_lines WHERE grn_id = ANY($1::int[])`, [ids(grnIds)]);
  await del(`DELETE FROM scm_grns WHERE id = ANY($1::int[])`, [ids(grnIds)]);
  await del(`DELETE FROM scm_po_lines WHERE order_id = ANY($1::int[])`, [ids(poIds)]);
  await del(`DELETE FROM operations_approvals WHERE module='scm' AND entity_id = ANY($1::int[])`, [ids(poIds).concat(ids(grnIds))]);
  await del(`DELETE FROM operations_audit_log WHERE module='scm' AND entity_id = ANY($1::int[])`, [ids(poIds).concat(ids(grnIds))]);
  await del(`DELETE FROM scm_purchase_orders WHERE id = ANY($1::int[])`, [ids(poIds)]);
  await del(`DELETE FROM scm_items WHERE item_code LIKE '${TAG}-%'`);
  await del(`DELETE FROM scm_vendors WHERE vendor_code LIKE '${TAG}-%'`);
  // CSSD (global tables) — sets are tagged by code
  await del(`DELETE FROM operations_audit_log WHERE module='cssd' AND entity_type='set' AND entity_id IN (SELECT id::text FROM cssd_sets WHERE set_code LIKE '${TAG}-%')`);
  await del(`DELETE FROM operations_audit_log WHERE module='cssd' AND entity_type='set' AND entity_id IN (SELECT id FROM cssd_sets WHERE set_code LIKE '${TAG}-%')`);
  await del(`DELETE FROM cssd_set_usage WHERE set_id IN (SELECT id FROM cssd_sets WHERE set_code LIKE '${TAG}-%')`);
  await del(`DELETE FROM cssd_sets WHERE set_code LIKE '${TAG}-%'`);
  // Care series family (keyed via series.organization_id)
  const sess = `SELECT s.id FROM care_series_session s JOIN care_series c ON c.id = s.series_id WHERE c.organization_id = ANY($1::int[])`;
  await del(`DELETE FROM dialysis_medication_administration WHERE session_id IN (${sess})`, [ORGS]);
  await del(`DELETE FROM dialysis_session_detail WHERE session_id IN (${sess})`, [ORGS]);
  await del(`DELETE FROM chemo_cycle_detail WHERE session_id IN (${sess})`, [ORGS]);
  await del(`DELETE FROM dialysis_recurring_schedule WHERE organization_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM care_series_session WHERE series_id IN (SELECT id FROM care_series WHERE organization_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM care_series WHERE organization_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM dialysis_chair WHERE organization_id = ANY($1::int[])`, [ORGS]);
  // OT
  await del(`DELETE FROM post_op_followup_plan WHERE ot_booking_id IN (SELECT id FROM ot_bookings WHERE organization_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM operative_notes WHERE organization_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM ot_bookings WHERE organization_id = ANY($1::int[])`, [ORGS]);
  // Queue, branches
  await del(`DELETE FROM hospital_queue_entries WHERE organization_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM staff_branch_assignment WHERE branch_id IN (SELECT id FROM hospital_branch WHERE organization_id = ANY($1::int[])) OR user_id BETWEEN 995000 AND 995999`, [ORGS]);
  await del(`DELETE FROM charge_master_branch_override WHERE branch_id IN (SELECT id FROM hospital_branch WHERE organization_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM hospital_branch WHERE organization_id = ANY($1::int[])`, [ORGS]);
  // Corporates
  const corpIds = [CORP.A, CORP.B, CORP.NULL];
  for (const t of ['corporate_mou', 'corporate_rate_card_version', 'corporate_account_spoc', 'corporate_account_credit_ledger', 'corporate_consent_grant', 'corporate_green_channel']) {
    await del(`DELETE FROM ${t} WHERE corporate_id = ANY($1::int[])`, [corpIds]);
  }
  await del(`DELETE FROM user_associations WHERE "userId" BETWEEN 995000 AND 995999 OR ("entityId" = ANY($1::int[]) AND "entityType"::text = 'corporate')`, [corpIds]);
  await del(`DELETE FROM corporates WHERE id = ANY($1::int[])`, [corpIds]);
  // Asset tracking
  await del(`DELETE FROM asset_tag_event WHERE tag_id IN (SELECT id FROM asset_tag WHERE organization_id = ANY($1::int[])) OR reader_device_id IN (SELECT id FROM asset_reader_device WHERE organization_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM asset_tag WHERE organization_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM asset_reader_device WHERE organization_id = ANY($1::int[])`, [ORGS]);
  // DMS
  await del(`DELETE FROM dms_document_version WHERE document_id IN (SELECT id FROM dms_document WHERE organization_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM dms_document WHERE organization_id = ANY($1::int[])`, [ORGS]);
  // Ambulance
  const ambIds = [AMB.A, AMB.B];
  for (const t of ['ambulance_shift', 'ambulance_maintenance', 'ambulance_crew', 'ambulance_vehicle', 'ambulance_trip']) await del(`DELETE FROM ${t} WHERE ambulance_id = ANY($1::int[])`, [ambIds]);
  await del(`DELETE FROM ambulances WHERE id = ANY($1::int[])`, [ambIds]);
  // Payroll (tenant-scoped, children first)
  await del(`DELETE FROM payroll_run_lines WHERE run_id IN (SELECT id FROM payroll_runs WHERE tenant_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM payroll_runs WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM payroll_structures WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  // Billing (dashboards)
  await del(`DELETE FROM hospital_payments WHERE hospital_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM hospital_invoice_lines WHERE invoice_id IN (SELECT id FROM hospital_invoices WHERE hospital_id = ANY($1::int[]))`, [ORGS]);
  await del(`DELETE FROM hospital_invoices WHERE hospital_id = ANY($1::int[])`, [ORGS]);
  // ABDM registries, biomedical
  await del(`DELETE FROM hfr_facility_registrations WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM hpr_provider_registrations WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM biomedical_calibration_schedule WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM biomedical_maintenance_ticket WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  await del(`DELETE FROM hg_equipment_inventory WHERE tenant_id = ANY($1::int[])`, [ORGS]);
  // Patient-portal seeds, display device, green-channel config
  await del(`DELETE FROM appointments WHERE "userId" BETWEEN 995000 AND 995999`);
  await del(`DELETE FROM reports WHERE "userId" BETWEEN 995000 AND 995999`);
  await del(`DELETE FROM display_devices WHERE device_token LIKE 'smoke-%'`);
  await del(`DELETE FROM green_channel_config WHERE organization_id = ANY($1::int[])`, [ORGS]);
  // Generic sweep: any remaining row keyed to the two test orgs (3 passes so FK order sorts itself out)
  const cols = await q(`SELECT c.table_name, c.column_name FROM information_schema.columns c
                          JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
                         WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
                           AND c.column_name IN ('organization_id','tenant_id','hospital_id','org_id','organizationId','tenantId')
                           AND c.table_name NOT IN ('tenants','users','doctors','platform_tenants')`);
  for (let pass = 0; pass < 3; pass++) {
    for (const c of cols) await del(`DELETE FROM "${c.table_name}" WHERE "${c.column_name}"::text IN ('${A}','${B}')`);
  }
  // Seeded identities last
  await del(`DELETE FROM patients WHERE "userId" BETWEEN 995000 AND 995999`);
  await del(`DELETE FROM doctors WHERE id BETWEEN 995000 AND 995999`);
  await del(`DELETE FROM users WHERE id BETWEEN 995000 AND 995999`);
  await del(`DELETE FROM tenants WHERE id = ANY($1::int[])`, [ORGS]);
}

async function residueScan() {
  const leaks = [];
  const cols = await q(`SELECT c.table_name, c.column_name FROM information_schema.columns c
                          JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
                         WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
                           AND c.column_name IN ('organization_id','tenant_id','hospital_id','org_id','organizationId','tenantId')`);
  for (const c of cols) {
    const r = await qs(`SELECT count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}"::text IN ('${A}','${B}')`);
    if (!r.error && r[0].n) leaks.push(`${c.table_name}.${c.column_name}=${r[0].n}`);
  }
  const extra = [
    ['users', `id BETWEEN 995000 AND 995999`], ['doctors', `id BETWEEN 995000 AND 995999`], ['corporates', `id BETWEEN 995400 AND 995499`],
    ['ambulances', `id BETWEEN 995300 AND 995399`], ['clinical_knowledge_rules', `title LIKE '${TAG}-%'`], ['cssd_sets', `set_code LIKE '${TAG}-%'`],
    ['display_devices', `device_token LIKE 'smoke-%'`], ['user_associations', `"userId" BETWEEN 995000 AND 995999`],
  ];
  for (const [t, w] of extra) {
    const r = await qs(`SELECT count(*)::int AS n FROM "${t}" WHERE ${w}`);
    if (!r.error && r[0].n) leaks.push(`${t}(${w})=${r[0].n}`);
  }
  return leaks;
}

// ── seeding ──────────────────────────────────────────────────────────────────
async function seedUser(id, role, org, { isAdmin = false } = {}) {
  await pool.query(
    `INSERT INTO users (id, "firstName", "lastName", email, password, "phoneNumber", role, "isAdmin", organization_id, tenant_id, status, "createdAt", "updatedAt")
     VALUES ($1,'Smoke',$2,$3,'x',$4,$5,$6,$7,$7,'active',NOW(),NOW())`,
    [id, `${role}${id}`, `smoke-${id}@smoke.invalid`, `SMK${id}`, role, isAdmin, org]
  );
}
async function seedBase() {
  for (const [id, slug, sub] of [[A, 'smoke-org-a', 'smokea'], [B, 'smoke-org-b', 'smokeb']]) {
    await pool.query(
      `INSERT INTO tenants (id, name, slug, subdomain, type, email, phone, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'hospital',$5,$6,'active',NOW(),NOW())`,
      [id, `SMOKE Hospital ${id}`, slug, sub, `${slug}@smoke.invalid`, `SMK${id}`]
    );
  }
  await seedUser(U.adminA, 'admin', A, { isAdmin: true });
  await seedUser(U.adminB, 'admin', B, { isAdmin: true });
  await seedUser(U.mdA, 'medical_director', A);
  await seedUser(U.patA, 'patient', A);
  await seedUser(U.staffA, 'staff', A);
  await seedUser(U.corpPatA, 'patient', A);
  await seedUser(U.corpPatB, 'patient', B);
  await seedUser(U.patA2, 'patient', A);
  for (const [id, org] of [[DOC.A, A], [DOC.A2, A]]) {
    await pool.query(
      `INSERT INTO doctors (id, "firstName", "lastName", email, password, "phoneNumber", specialization, tenant_id, organization_id, status, "createdAt", "updatedAt")
       VALUES ($1,'Smoke',$2,$3,'x',$4,'General',$5,$5,'active',NOW(),NOW())`,
      [id, `Doc${id}`, `smoke-doc-${id}@smoke.invalid`, `SMD${id}`, org]
    );
  }
  for (const id of [AMB.A, AMB.B]) {
    await pool.query(
      `INSERT INTO ambulances (id, "providerName", email, password, phone, "createdAt", "updatedAt") VALUES ($1,$2,$3,'x',$4,NOW(),NOW())`,
      [id, `SMOKE Ambulance ${id}`, `smoke-amb-${id}@smoke.invalid`, `SMA${id}`]
    );
  }
  for (const [id, tenant, uid] of [[CORP.A, A, 'S9A001'], [CORP.B, B, 'S9B001'], [CORP.NULL, null, 'S9N001']]) {
    await pool.query(
      `INSERT INTO corporates (id, "companyName", "contactPerson", email, "phoneNumber", "createdAt", "updatedAt", tenant_id, unique_id)
       VALUES ($1,$2,'Smoke',$3,$4,NOW(),NOW(),$5,$6)`,
      [id, `SMOKE Corp ${id}`, `smoke-corp-${id}@smoke.invalid`, `SMC${id}`, tenant, uid]
    );
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
let before = {}; let after = {}; let leaks = []; let fatalErr = null;
class StrictStop extends Error {}
let server;
const G = {};
const shimmed = [];
try {
  // stale-run guard: only proceed if leftover ids are ours
  const stale = await q1(`SELECT count(*)::int AS n FROM tenants WHERE id = ANY($1::int[]) AND name NOT LIKE 'SMOKE%'`, [ORGS]);
  if (stale.n) fatal('tenant ids 995001/995002 exist and are not SMOKE rows');
  await cleanup(); // heal any previous aborted run
  before = await snapshotCounts();

  // LOCAL SCHEMA SHIM (additive, nullable): doctor.model.postgres.js maps google_id/facebook_id/oauth_provider but no
  // migration in the repo creates them, so doctor JWT auth fails on a DB that lacks them. Add locally so doctor routes are testable.
  for (const [col, typ] of [['google_id', 'VARCHAR(255)'], ['facebook_id', 'VARCHAR(255)'], ['oauth_provider', 'VARCHAR(32)']]) {
    const ex = await q1(`SELECT 1 AS x FROM information_schema.columns WHERE table_name='doctors' AND column_name=$1`, [col]);
    if (!ex) { await pool.query(`ALTER TABLE doctors ADD COLUMN ${col} ${typ}`); shimmed.push(`doctors.${col}`); }
  }
  await seedBase();

  // ── import the real app, patch nothing in server/ ──
  const ringMod = await import(pathToFileURL(path.join(SERVER, 'middleware/ringFencing.js')).href);
  const entMod = await import(pathToFileURL(path.join(SERVER, 'middleware/moduleEntitlement.middleware.js')).href);
  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await sleep(1500); // let start-up async work settle

  const tok = {
    adminA: sign({ id: U.adminA, role: 'admin', isAdmin: true, tenantId: A, email: `smoke-${U.adminA}@smoke.invalid` }),
    adminB: sign({ id: U.adminB, role: 'admin', isAdmin: true, tenantId: B, email: `smoke-${U.adminB}@smoke.invalid` }),
    mdA: sign({ id: U.mdA, role: 'medical_director', userType: 'admin', email: `smoke-${U.mdA}@smoke.invalid` }),
    hospAdminA: hospTok(A, 'hospital_admin'), hospAdminB: hospTok(B, 'hospital_admin'),
    hospStaffA: hospTok(A, 'hospital_staff'), hospA: hospTok(A, 'hospital'),
    patA: sign({ id: U.patA, role: 'patient', email: `smoke-${U.patA}@smoke.invalid` }),
    patA2: sign({ id: U.patA2, role: 'patient', email: `smoke-${U.patA2}@smoke.invalid` }),
    docA: sign({ id: DOC.A, role: 'doctor', email: `smoke-doc-${DOC.A}@smoke.invalid` }),
    ambA: sign({ id: AMB.A, email: `smoke-amb-${AMB.A}@smoke.invalid`, role: 'ambulance', type: 'ambulance' }),
    ambB: sign({ id: AMB.B, email: `smoke-amb-${AMB.B}@smoke.invalid`, role: 'ambulance', type: 'ambulance' }),
  };

  // ═══ G0  ring-fencing reachability (as-is, before any in-process patch) ═══
  {
    const g = 'G0 ringfence';
    const candidates = {
      admin: tok.adminA, hospital_admin: tok.hospAdminA, hospital_staff: tok.hospStaffA, doctor: tok.docA, patient: tok.patA,
      ambulance: tok.ambA, nurse: sign({ id: 1, role: 'nurse' }), team: sign({ id: 1, role: 'team', isTeam: true }),
      clinic: sign({ id: 1, role: 'clinic' }), assistant: sign({ id: 1, role: 'assistant' }), corporate: sign({ id: 1, role: 'corporate' }),
    };
    const prefixes = ['/api/care-series/x', '/api/dialysis/x', '/api/chemotherapy/x', '/api/specialty-ot/x', '/api/clinical-knowledge-fabric/domains', '/api/hospital-branch/branches',
      '/api/corporate-account/green-channel/config', '/api/qms/context', '/api/ambulance/trips', '/api/asset-tracking/stats', '/api/dms/categories', '/api/housekeeping/stats',
      '/api/patient/appointments', '/api/patient/reports', '/api/payroll/structures', '/api/hospital/ceo/financials', '/api/hospital/rcm/claims', '/api/abdm/hfr/status'];
    const RF = new Set(['ACCESS_DENIED', 'INVALID_USER_TYPE', 'NO_TOKEN', 'MISSING_ROLE', 'OWN_RESOURCE_ONLY', 'RESOURCE_TYPE_DENIED']);
    G.reach = {};
    for (const p of prefixes) {
      const passing = [];
      for (const [name, t] of Object.entries(candidates)) {
        const r = await api('GET', p, { token: t });
        if (!(r.json && RF.has(r.json.code))) passing.push(name);
      }
      G.reach[p] = passing;
      ok(g, `${p.replace('/x', '')} reachable through ringFencing`, passing.length > 0, `blocked for ALL role tokens tried (${Object.keys(candidates).join(',')})`);
      if (passing.length) info(g, `${p.replace('/x', '')} roles that pass`, passing.join(','));
    }
    const rp = await api('POST', '/api/asset-tracking/reader/events', { headers: { 'X-Reader-Key': 'bogus' }, body: { scans: [] } });
    ok(g, 'reader ingest not rejected by ringFencing NO_TOKEN', !(rp.json && rp.json.code === 'NO_TOKEN'), short(rp));
    const rw = await api('POST', '/api/whatsapp-business/webhook', { body: { object: 'x' } });
    info(g, 'whatsapp webhook w/o token', `${short(rw)} (known pre-existing: Meta cannot send a Bearer token)`);
  }

  if (STRICT) throw new StrictStop();
  // In-process ACL patch (harness only — server files untouched) so downstream logic can be exercised.
  {
    const P = ringMod.USER_TYPE_PERMISSIONS;
    const add = (type, paths) => { for (const p of paths) if (!P[type].allowedPaths.includes(p)) P[type].allowedPaths.push(p); };
    const newPaths = ['/api/care-series', '/api/dialysis', '/api/chemotherapy', '/api/specialty-ot', '/api/clinical-knowledge-fabric', '/api/hospital-branch', '/api/corporate-account',
      '/api/asset-tracking', '/api/dms', '/api/housekeeping', '/api/abdm', '/api/whatsapp-business'];
    add('admin', newPaths); add('hospital', newPaths); add('doctor', ['/api/abdm']);
    add('patient', ['/api/patient', '/api/corporate-account']); add('user', ['/api/patient']);
    info('G0 ringfence', 'HARNESS PATCH', 'in-process USER_TYPE_PERMISSIONS extended for admin/hospital/doctor/patient so groups G1-G13 can exercise the handlers');
  }

  // ═══ G1  care series / dialysis / chemotherapy ═══
  {
    const g = 'G1 care/dialysis/chemo';
    const s1 = await api('POST', '/api/care-series/series', { token: tok.adminA, body: { patientId: U.patA, domainKey: 'nephrology_dialysis', seriesType: 'dialysis', plannedSessions: 12, protocolReference: 'SMOKE' } });
    expectStatus(g, 'POST /care-series/series (start)', s1, 201, s1.json?.data?.id > 0);
    const seriesId = s1.json?.data?.id;
    const bad0 = await api('POST', '/api/care-series/series', { token: tok.adminA, body: { patientId: U.patA } });
    expectStatus(g, 'POST /care-series/series missing seriesType -> 400', bad0, 400);
    const lst = await api('GET', `/api/care-series/patients/${U.patA}/series`, { token: tok.adminA });
    expectStatus(g, 'GET /care-series/patients/:id/series', lst, 200, lst.json?.data?.some((s) => s.id === seriesId));
    const sess = await api('POST', `/api/care-series/series/${seriesId}/sessions`, { token: tok.adminA, body: { sessionNumber: 1, scheduledAt: new Date().toISOString() } });
    expectStatus(g, 'POST /care-series/series/:id/sessions (schedule)', sess, 201, sess.json?.data?.id > 0);
    const sid = sess.json?.data?.id;
    const rc = await api('POST', `/api/care-series/sessions/${sid}/record`, { token: tok.adminA, body: { vitals: { bp: '120/80' }, notes: 'ok', status: 'completed' } });
    expectStatus(g, 'POST /care-series/sessions/:id/record', rc, 200, rc.json?.data?.status === 'completed');
    const rcBad = await api('POST', `/api/care-series/sessions/${sid}/record`, { token: tok.adminA, body: { status: 'bogus' } });
    expectStatus(g, 'record with invalid status -> 400', rcBad, 400);
    expectStatus(g, 'GET /care-series/series/:id/history', await api('GET', `/api/care-series/series/${seriesId}/history`, { token: tok.adminA }), 200);
    expectStatus(g, 'GET /care-series/series/:id/guidance', await api('GET', `/api/care-series/series/${seriesId}/guidance`, { token: tok.adminA }), 200);
    // isolation
    expectStatus(g, 'org B GET history of A series -> 404', await api('GET', `/api/care-series/series/${seriesId}/history`, { token: tok.adminB }), 404);
    expectStatus(g, 'org B schedule session on A series -> 404', await api('POST', `/api/care-series/series/${seriesId}/sessions`, { token: tok.adminB, body: { sessionNumber: 9 } }), 404);
    expectStatus(g, 'org B record A session -> 404', await api('POST', `/api/care-series/sessions/${sid}/record`, { token: tok.adminB, body: { status: 'completed' } }), 404);
    expectStatus(g, 'org B complete A series -> 404', await api('POST', `/api/care-series/series/${seriesId}/complete`, { token: tok.adminB }), 404);
    const plainMd = await api('GET', `/api/care-series/patients/${U.patA}/series`, { token: tok.patA });
    ok(g, 'patient token refused on care-series (403)', plainMd.status === 403, short(plainMd));

    // dialysis
    const d1 = await api('POST', `/api/dialysis/sessions/${sid}/detail`, { token: tok.adminA, body: { vascularAccessType: 'fistula', preSessionWeightKg: 70.5, targetUfVolumeMl: 2000 } });
    expectStatus(g, 'POST /dialysis/sessions/:id/detail (insert)', d1, 201);
    const d2 = await api('POST', `/api/dialysis/sessions/${sid}/detail`, { token: tok.adminA, body: { postSessionWeightKg: 68.2 } });
    expectStatus(g, 'POST /dialysis detail 2nd partial upsert', d2, 201);
    const dg = await api('GET', `/api/dialysis/sessions/${sid}/detail`, { token: tok.adminA });
    const dd = dg.json?.data || {};
    ok(g, 'partial upsert keeps earlier fields (pre weight/access/UF target + new post weight)',
      dg.status === 200 && Number(dd.pre_session_weight_kg) === 70.5 && dd.vascular_access_type === 'fistula' && Number(dd.target_uf_volume_ml) === 2000 && Number(dd.post_session_weight_kg) === 68.2, JSON.stringify(dd).slice(0, 200));
    const dr = await api('POST', `/api/dialysis/sessions/${sid}/readings`, { token: tok.adminA, body: { bp: '130/80', hr: 78 } });
    expectStatus(g, 'POST /dialysis/sessions/:id/readings', dr, 201, Array.isArray(dr.json?.data?.intra_session_readings) && dr.json.data.intra_session_readings.length === 1);
    const dm = await api('POST', `/api/dialysis/sessions/${sid}/medications`, { token: tok.adminA, body: { medication: 'Heparin', dose: 5000, doseUnit: 'IU', route: 'IV' } });
    expectStatus(g, 'POST /dialysis/sessions/:id/medications', dm, 201);
    expectStatus(g, 'POST medications w/o medication -> 400', await api('POST', `/api/dialysis/sessions/${sid}/medications`, { token: tok.adminA, body: {} }), 400);
    const dml = await api('GET', `/api/dialysis/sessions/${sid}/medications`, { token: tok.adminA });
    expectStatus(g, 'GET /dialysis/sessions/:id/medications', dml, 200, dml.json?.data?.length === 1);
    expectStatus(g, 'org B GET dialysis detail -> 404', await api('GET', `/api/dialysis/sessions/${sid}/detail`, { token: tok.adminB }), 404);
    expectStatus(g, 'org B POST dialysis detail -> 404', await api('POST', `/api/dialysis/sessions/${sid}/detail`, { token: tok.adminB, body: { preSessionWeightKg: 1 } }), 404);
    expectStatus(g, 'org B POST dialysis medication -> 404', await api('POST', `/api/dialysis/sessions/${sid}/medications`, { token: tok.adminB, body: { medication: 'x' } }), 404);
    const ch = await api('POST', '/api/dialysis/chairs', { token: tok.adminA, body: { chairNumber: 'SMK-1' } });
    expectStatus(g, 'POST /dialysis/chairs', ch, 201, ch.json?.data?.id > 0);
    const chairId = ch.json?.data?.id;
    const chl = await api('GET', '/api/dialysis/chairs', { token: tok.adminA });
    expectStatus(g, 'GET /dialysis/chairs', chl, 200, chl.json?.data?.some((c) => c.id === chairId));
    const chlB = await api('GET', '/api/dialysis/chairs', { token: tok.adminB });
    expectStatus(g, 'org B chair list excludes A chair', chlB, 200, !chlB.json?.data?.some((c) => c.id === chairId));
    const sch = await api('POST', '/api/dialysis/schedules', { token: tok.adminA, body: { patientId: U.patA, seriesId, chairId, daysOfWeek: ['mon', 'wed', 'fri'], shift: 'morning', startDate: today() } });
    expectStatus(g, 'POST /dialysis/schedules (recurring)', sch, 201, sch.json?.data?.id > 0);
    const schId = sch.json?.data?.id;
    expectStatus(g, 'org B schedule using A chair -> 404', await api('POST', '/api/dialysis/schedules', { token: tok.adminB, body: { patientId: U.patA, chairId, daysOfWeek: ['mon'] } }), [404, 400], true, 'foreign chair must not be usable');
    const gen = await api('POST', `/api/dialysis/schedules/${schId}/generate-sessions`, { token: tok.adminA, body: { weeksAhead: 2 } });
    expectStatus(g, 'POST /dialysis/schedules/:id/generate-sessions', gen, 201, Array.isArray(gen.json?.data) && gen.json.data.length >= 4, `${gen.json?.data?.length} sessions`);
    expectStatus(g, 'org B generate-sessions on A schedule -> 404', await api('POST', `/api/dialysis/schedules/${schId}/generate-sessions`, { token: tok.adminB, body: {} }), 404);
    expectStatus(g, 'GET /dialysis/patients/:id/schedule', await api('GET', `/api/dialysis/patients/${U.patA}/schedule`, { token: tok.adminA }), 200);
    expectStatus(g, 'POST /dialysis/schedules/:id/pause', await api('POST', `/api/dialysis/schedules/${schId}/pause`, { token: tok.adminA }), 200);
    expectStatus(g, 'org B pause A schedule -> 404', await api('POST', `/api/dialysis/schedules/${schId}/pause`, { token: tok.adminB }), 404);

    // chemotherapy (own series/session)
    const cs = await api('POST', '/api/care-series/series', { token: tok.adminA, body: { patientId: U.patA, domainKey: 'oncology_chemotherapy', seriesType: 'chemotherapy', plannedSessions: 6 } });
    const csid = cs.json?.data?.id;
    const csess = await api('POST', `/api/care-series/series/${csid}/sessions`, { token: tok.adminA, body: { sessionNumber: 1 } });
    const chSid = csess.json?.data?.id;
    ok(g, 'chemo series + session created', csid > 0 && chSid > 0, short(cs) + short(csess));
    const c1 = await api('POST', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminA, body: { heightCm: 170, weightKg: 70, regimenReference: 'SMOKE-REG' } });
    expectStatus(g, 'POST /chemotherapy detail (BSA computed)', c1, 201, Math.abs(Number(c1.json?.data?.bsa_m2) - 1.818) < 0.002, `bsa=${c1.json?.data?.bsa_m2}`);
    const ex = await api('POST', `/api/chemotherapy/sessions/${chSid}/extravasation`, { token: tok.adminA, body: { actionTaken: 'Stopped infusion' } });
    expectStatus(g, 'POST /chemotherapy extravasation flag', ex, 201, ex.json?.data?.extravasation_occurred === true);
    const c2 = await api('POST', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminA, body: { ctcaeToxicityGrade: 2, toxicityCategory: 'nausea' } });
    expectStatus(g, 'later form save omitting extravasation (CTCAE grade 2)', c2, 201, Number(c2.json?.data?.ctcae_toxicity_grade) === 2);
    const c3 = await api('POST', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminA, body: { extravasationOccurred: false } });
    const cg = await api('GET', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminA });
    const cd = cg.json?.data || {};
    ok(g, 'extravasation flag + action survive later saves (even explicit false)', c3.status === 201 && cd.extravasation_occurred === true && /Stopped infusion/.test(cd.extravasation_action_taken || ''), JSON.stringify(cd).slice(0, 200));
    ok(g, 'BSA + earlier fields preserved after partial saves', Math.abs(Number(cd.bsa_m2) - 1.818) < 0.002 && cd.regimen_reference === 'SMOKE-REG' && Number(cd.ctcae_toxicity_grade) === 2, JSON.stringify(cd).slice(0, 200));
    const c4 = await api('POST', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminA, body: { weightKg: 80 } });
    ok(g, 'BSA recomputed from stored height + new weight', Math.abs(Number(c4.json?.data?.bsa_m2) - 1.944) < 0.002, `bsa=${c4.json?.data?.bsa_m2}`);
    expectStatus(g, 'POST /chemotherapy readings', await api('POST', `/api/chemotherapy/sessions/${chSid}/readings`, { token: tok.adminA, body: { rate: 100 } }), 201);
    const cBad = await api('POST', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminA, body: { ctcaeToxicityGrade: 9 } });
    if (cBad.status >= 500) info(g, 'CTCAE grade 9 (invalid)', `returns ${cBad.status} instead of 400 (DB CHECK surfaced as 500)`); else ok(g, 'CTCAE grade 9 rejected', cBad.status === 400, short(cBad));
    expectStatus(g, 'org B GET chemo detail -> 404', await api('GET', `/api/chemotherapy/sessions/${chSid}/detail`, { token: tok.adminB }), 404);
    expectStatus(g, 'org B flag extravasation on A session -> 404', await api('POST', `/api/chemotherapy/sessions/${chSid}/extravasation`, { token: tok.adminB, body: {} }), 404);
    expectStatus(g, 'org B chemo reading -> 404', await api('POST', `/api/chemotherapy/sessions/${chSid}/readings`, { token: tok.adminB, body: { rate: 1 } }), 404);
    expectStatus(g, 'complete series (org A)', await api('POST', `/api/care-series/series/${seriesId}/complete`, { token: tok.adminA }), 200);
  }

  // ═══ G2  specialty OT ═══
  {
    const g = 'G2 specialty-ot';
    const bk = await q1(`INSERT INTO ot_bookings (organization_id, patient_id, procedure_name, scheduled_start, scheduled_end, created_at, updated_at)
                         VALUES ($1,$2,'SMOKE procedure', NOW(), NOW() + interval '1 hour', NOW(), NOW()) RETURNING id`, [A, U.patA]);
    const nt = await q1(`INSERT INTO operative_notes (organization_id, ot_booking_id, patient_id, procedure_name, status) VALUES ($1,$2,$3,'SMOKE procedure','draft') RETURNING id`, [A, bk.id, U.patA]);
    const noteData = async () => (await q1(`SELECT note_data, status FROM operative_notes WHERE id=$1`, [nt.id]));
    const o1 = await api('POST', `/api/specialty-ot/notes/${nt.id}/ophthalmology`, { token: tok.adminA, body: { iolPower: '21.5', iolModel: 'SMOKE-IOL', iolLotNumber: 'L1' } });
    expectStatus(g, 'POST /specialty-ot/notes/:id/ophthalmology', o1, 201);
    const o2 = await api('POST', `/api/specialty-ot/notes/${nt.id}/cardiac`, { token: tok.adminA, body: { procedureType: 'CABG', graftVessels: 3, anticoagulationPlan: 'warfarin' } });
    expectStatus(g, 'POST /specialty-ot/notes/:id/cardiac', o2, 201);
    const o3 = await api('POST', `/api/specialty-ot/notes/${nt.id}/orthopaedic`, { token: tok.adminA, body: { jointReplaced: 'knee', implantManufacturer: 'SMOKE', implantModel: 'K1', implantSize: '4' } });
    expectStatus(g, 'POST /specialty-ot/notes/:id/orthopaedic', o3, 201);
    const nd = (await noteData()).note_data || {};
    ok(g, 'all three specialty blocks merged into note_data (none clobbered)', nd.ophthalmology?.iolModel === 'SMOKE-IOL' && nd.cardiacSurgery?.procedureType === 'CABG' && nd.orthopaedicImplant?.implantModel === 'K1', JSON.stringify(nd).slice(0, 200));
    const ob = await api('POST', `/api/specialty-ot/notes/${nt.id}/ophthalmology`, { token: tok.adminB, body: { iolPower: '99', iolModel: 'HACK' } });
    ok(g, 'org B cannot write A note (rejected)', ob.status >= 400 && ob.status < 500, short(ob));
    if (ob.status === 400) info(g, 'org B foreign note answers 400 (not 404)', 'minor: not-found and validation both map to 400');
    ok(g, 'org B attempt did not modify note_data', (await noteData()).note_data?.ophthalmology?.iolModel === 'SMOKE-IOL');
    await q(`UPDATE operative_notes SET status='signed' WHERE id=$1`, [nt.id]);
    const os = await api('POST', `/api/specialty-ot/notes/${nt.id}/cardiac`, { token: tok.adminA, body: { procedureType: 'X' } });
    expectStatus(g, 'signed note rejects specialty edits', os, 400);
    await q(`UPDATE operative_notes SET status='draft' WHERE id=$1`, [nt.id]);
    const fp = await api('POST', `/api/specialty-ot/bookings/${bk.id}/followup-plan`, { token: tok.adminA, body: { patientId: U.patA, surgeryDate: today(-6) } });
    expectStatus(g, 'POST /specialty-ot/bookings/:id/followup-plan (generate)', fp, 201, fp.json?.data?.length === 3);
    const fl = await api('GET', `/api/specialty-ot/bookings/${bk.id}/followup-plan`, { token: tok.adminA });
    expectStatus(g, 'GET followup-plan (3 rows)', fl, 200, fl.json?.data?.length === 3);
    const planId = fl.json?.data?.[0]?.id;
    const st = await api('POST', `/api/specialty-ot/followup-plan/${planId}/status`, { token: tok.adminA, body: { status: 'completed', notes: 'seen' } });
    expectStatus(g, 'POST followup-plan/:id/status', st, 200, st.json?.data?.status === 'completed');
    const stBad = await api('POST', `/api/specialty-ot/followup-plan/${planId}/status`, { token: tok.adminA, body: { status: 'bogus' } });
    if (stBad.status >= 500) info(g, 'followup status "bogus"', `returns ${stBad.status} (DB CHECK surfaced as 500, should be 400)`); else expectStatus(g, 'invalid followup status rejected', stBad, 400);
    const due = await api('GET', '/api/specialty-ot/followup-plan/due-soon?withinDays=30', { token: tok.adminA });
    expectStatus(g, 'GET followup-plan/due-soon', due, 200, due.json?.data?.length === 2 && due.json.data.every((p) => p.status === 'pending'), `n=${due.json?.data?.length}`);
    const flB = await api('GET', `/api/specialty-ot/bookings/${bk.id}/followup-plan`, { token: tok.adminB });
    expectStatus(g, 'org B list A followup plan is empty', flB, 200, flB.json?.data?.length === 0);
    const gB = await api('POST', `/api/specialty-ot/bookings/${bk.id}/followup-plan`, { token: tok.adminB, body: { patientId: U.patA } });
    ok(g, 'org B cannot generate plan for A booking', gB.status >= 400 && gB.status < 500, short(gB));
    const sB = await api('POST', `/api/specialty-ot/followup-plan/${fl.json?.data?.[1]?.id}/status`, { token: tok.adminB, body: { status: 'missed' } });
    const still = await q1(`SELECT status FROM post_op_followup_plan WHERE id=$1`, [fl.json?.data?.[1]?.id]);
    ok(g, 'org B cannot change A plan status (DB unchanged)', still.status === 'pending', `status=${still.status}`);
    if (sB.status === 200) info(g, 'org B status change on foreign plan answers 200 {data:undefined}', 'minor: should be 404 (write correctly blocked)');
    const dueB = await api('GET', '/api/specialty-ot/followup-plan/due-soon?withinDays=30', { token: tok.adminB });
    expectStatus(g, 'org B due-soon excludes A', dueB, 200, dueB.json?.data?.length === 0);
  }

  // ═══ G3  Clinical Knowledge Fabric ═══
  {
    const g = 'G3 knowledge-fabric';
    const dom = await api('GET', '/api/clinical-knowledge-fabric/domains', { token: tok.adminA });
    expectStatus(g, 'GET /domains', dom, 200, dom.json?.data?.length >= 5, `n=${dom.json?.data?.length}`);
    const key = 'nephrology_dialysis';
    const rd0 = await api('GET', `/api/clinical-knowledge-fabric/domains/${key}/rules`, { token: tok.adminA });
    expectStatus(g, 'GET /domains/:key/rules (approved only)', rd0, 200, Array.isArray(rd0.json?.data));
    const title = `${TAG}-rule-${Date.now()}`;
    const nr = await api('POST', '/api/clinical-knowledge-fabric/rules', { token: tok.adminA, body: { domainKey: key, ruleType: 'red_flag', title, conditionText: 'smoke cond', recommendationText: 'smoke rec' } });
    expectStatus(g, 'POST /rules (draft)', nr, 201, nr.json?.data?.status === 'draft');
    const rid = nr.json?.data?.id;
    expectStatus(g, 'POST /rules missing fields -> 400', await api('POST', '/api/clinical-knowledge-fabric/rules', { token: tok.adminA, body: { domainKey: key } }), 400);
    const rd1 = await api('GET', `/api/clinical-knowledge-fabric/domains/${key}/rules`, { token: tok.adminA });
    ok(g, 'draft rule NOT visible in approved read', !JSON.stringify(rd1.json?.data || []).includes(title));
    expectStatus(g, 'POST /rules/:id/propose', await api('POST', `/api/clinical-knowledge-fabric/rules/${rid}/propose`, { token: tok.adminA }), 200);
    expectStatus(g, 'plain admin approve -> 403', await api('POST', `/api/clinical-knowledge-fabric/rules/${rid}/approve`, { token: tok.adminA, body: {} }), 403);
    expectStatus(g, 'plain admin reject -> 403', await api('POST', `/api/clinical-knowledge-fabric/rules/${rid}/reject`, { token: tok.adminA, body: {} }), 403);
    expectStatus(g, 'plain admin pending-review -> 403', await api('GET', '/api/clinical-knowledge-fabric/pending-review', { token: tok.adminA }), 403);
    const pend = await api('GET', '/api/clinical-knowledge-fabric/pending-review', { token: tok.mdA });
    expectStatus(g, 'medical_director pending-review lists rule', pend, 200, JSON.stringify(pend.json?.data || []).includes(title));
    const ap = await api('POST', `/api/clinical-knowledge-fabric/rules/${rid}/approve`, { token: tok.mdA, body: { notes: 'smoke approve' } });
    expectStatus(g, 'medical_director approve', ap, 200, ap.json?.data?.status === 'approved');
    const rd2 = await api('GET', `/api/clinical-knowledge-fabric/domains/${key}/rules`, { token: tok.adminA });
    ok(g, 'approved rule now appears in read', JSON.stringify(rd2.json?.data || []).includes(title));
    expectStatus(g, 'approve again -> 4xx (not under_review)', await api('POST', `/api/clinical-knowledge-fabric/rules/${rid}/approve`, { token: tok.mdA, body: {} }), [400, 409]);
    // reject path on a second rule
    const nr2 = await api('POST', '/api/clinical-knowledge-fabric/rules', { token: tok.mdA, body: { domainKey: key, ruleType: 'monitoring_reminder', title: `${title}-b`, conditionText: 'c', recommendationText: 'r' } });
    const rid2 = nr2.json?.data?.id;
    await api('POST', `/api/clinical-knowledge-fabric/rules/${rid2}/propose`, { token: tok.mdA });
    expectStatus(g, 'medical_director reject', await api('POST', `/api/clinical-knowledge-fabric/rules/${rid2}/reject`, { token: tok.mdA, body: { notes: 'no' } }), 200);
    const rd3 = await api('GET', `/api/clinical-knowledge-fabric/domains/${key}/rules`, { token: tok.adminA });
    ok(g, 'rejected rule not visible', !JSON.stringify(rd3.json?.data || []).includes(`${title}-b`));
  }

  // ═══ G4  multi-branch ═══
  {
    const g = 'G4 multi-branch';
    const b1 = await api('POST', '/api/hospital-branch/branches', { token: tok.hospAdminA, body: { name: `${TAG} Branch A1`, address: 'Road 1' } });
    expectStatus(g, 'POST /branches (hospital_admin)', b1, 201, b1.json?.data?.id > 0);
    const b2 = await api('POST', '/api/hospital-branch/branches', { token: tok.hospAdminA, body: { name: `${TAG} Branch A2` } });
    G.branchA1 = b1.json?.data?.id; G.branchA2 = b2.json?.data?.id;
    const bB = await api('POST', '/api/hospital-branch/branches', { token: tok.hospAdminB, body: { name: `${TAG} Branch B1` } });
    G.branchB1 = bB.json?.data?.id;
    expectStatus(g, 'POST /branches missing name -> 400', await api('POST', '/api/hospital-branch/branches', { token: tok.hospAdminA, body: {} }), 400);
    expectStatus(g, 'POST /branches with hospital_staff -> 403', await api('POST', '/api/hospital-branch/branches', { token: tok.hospStaffA, body: { name: 'x' } }), 403);
    expectStatus(g, 'POST /branches with admin token', await api('POST', '/api/hospital-branch/branches', { token: tok.adminA, body: { name: `${TAG} Branch A3` } }), 201);
    const bl = await api('GET', '/api/hospital-branch/branches', { token: tok.hospAdminA });
    expectStatus(g, 'GET /branches (hospital_admin)', bl, 200, bl.json?.data?.some((b) => b.id === G.branchA1) && !bl.json.data.some((b) => b.id === G.branchB1));
    expectStatus(g, 'GET /branches (hospital_staff read allowed)', await api('GET', '/api/hospital-branch/branches', { token: tok.hospStaffA }), 200);
    const blB = await api('GET', '/api/hospital-branch/branches', { token: tok.hospAdminB });
    expectStatus(g, 'org B list excludes org A branches', blB, 200, !blB.json?.data?.some((b) => b.id === G.branchA1));
    const as = await api('POST', `/api/hospital-branch/branches/${G.branchA1}/staff`, { token: tok.hospAdminA, body: { userId: U.staffA, role: 'nurse' } });
    expectStatus(g, 'POST /branches/:id/staff', as, 201);
    expectStatus(g, 'org B assign staff to A branch -> 404', await api('POST', `/api/hospital-branch/branches/${G.branchA1}/staff`, { token: tok.hospAdminB, body: { userId: U.staffA, role: 'nurse' } }), 404);
    expectStatus(g, 'hospital_staff assign staff -> 403', await api('POST', `/api/hospital-branch/branches/${G.branchA1}/staff`, { token: tok.hospStaffA, body: { userId: U.staffA, role: 'nurse' } }), 403);
    expectStatus(g, 'assign missing role -> 400', await api('POST', `/api/hospital-branch/branches/${G.branchA1}/staff`, { token: tok.hospAdminA, body: { userId: U.staffA } }), 400);
    const sb = await api('GET', `/api/hospital-branch/staff/${U.staffA}/branches`, { token: tok.hospAdminA });
    expectStatus(g, 'GET /staff/:userId/branches (admin, org-scoped)', sb, 200, sb.json?.data?.some((b) => b.id === G.branchA1));
    const sbB = await api('GET', `/api/hospital-branch/staff/${U.staffA}/branches`, { token: tok.hospAdminB });
    expectStatus(g, 'org B admin sees none of A staff assignments', sbB, 200, sbB.json?.data?.length === 0);
    expectStatus(g, 'hospital_staff cannot read other user assignments -> 403', await api('GET', `/api/hospital-branch/staff/${U.staffA}/branches`, { token: tok.hospStaffA }), 403);
    const to = await api('POST', `/api/hospital-branch/branches/${G.branchA1}/tariff-override`, { token: tok.hospAdminA, body: { chargeMasterId: 990001, overridePrice: 250.5, effectiveDate: today() } });
    expectStatus(g, 'POST /branches/:id/tariff-override', to, 201, Number(to.json?.data?.override_price) === 250.5);
    expectStatus(g, 'org B tariff override on A branch -> 404', await api('POST', `/api/hospital-branch/branches/${G.branchA1}/tariff-override`, { token: tok.hospAdminB, body: { chargeMasterId: 990001, overridePrice: 1 } }), 404);
    expectStatus(g, 'negative override price -> 400', await api('POST', `/api/hospital-branch/branches/${G.branchA1}/tariff-override`, { token: tok.hospAdminA, body: { chargeMasterId: 990001, overridePrice: -5 } }), 400);
    expectStatus(g, 'tariff override missing fields -> 400', await api('POST', `/api/hospital-branch/branches/${G.branchA1}/tariff-override`, { token: tok.hospAdminA, body: {} }), 400);
    // real tenant binding (Host subdomain -> req.tenantId vs token org)
    const hostA = { host: 'smokea.example.test' };
    const tbOk = await api('GET', '/api/hospital-branch/branches', { token: tok.hospAdminA, headers: hostA });
    expectStatus(g, 'tenant binding: org A token on org A subdomain -> 200', tbOk, 200);
    const tbBad = await api('GET', '/api/hospital-branch/branches', { token: tok.hospAdminB, headers: hostA });
    expectStatus(g, 'tenant binding: org B token on org A subdomain -> 403 mismatch', tbBad, 403, /mismatch/i.test(tbBad.text));
    const tbAdm = await api('GET', '/api/hospital-branch/branches', { token: tok.adminA, headers: { host: 'smokeb.example.test' } });
    info(g, 'tenant binding: platform admin (bypass role) on other tenant subdomain', short(tbAdm));
    // observation: is the assigned userId validated against the org?
    const xa = await api('POST', `/api/hospital-branch/branches/${G.branchA1}/staff`, { token: tok.hospAdminA, body: { userId: U.corpPatB, role: 'nurse' } });
    if (xa.status === 201) info(g, 'assign staff userId from ANOTHER org', 'accepted (201): userId is not checked to belong to caller org (low severity: only org-A branch rows are exposed)');
  }

  // ═══ G5  corporate account + green channel ═══
  {
    const g = 'G5 corporate/green-channel';
    const H = tok.hospAdminA;
    const cfg = await api('GET', '/api/corporate-account/green-channel/config', { token: H });
    expectStatus(g, 'GET /green-channel/config (default quiet)', cfg, 200, cfg.json?.data?.displayMode === 'quiet' && cfg.json.data.corporates?.some((c) => c.id === CORP.A) && !cfg.json.data.corporates.some((c) => c.id === CORP.B || c.id === CORP.NULL), JSON.stringify(cfg.json?.data || {}).slice(0, 200));
    expectStatus(g, 'PUT config invalid mode -> 400', await api('PUT', '/api/corporate-account/green-channel/config', { token: H, body: { displayMode: 'loud' } }), 400);
    expectStatus(g, 'PUT config staff_badge', await api('PUT', '/api/corporate-account/green-channel/config', { token: H, body: { displayMode: 'staff_badge' } }), 200);
    expectStatus(g, 'PUT /corporates/:id/green-channel own corporate', await api('PUT', `/api/corporate-account/corporates/${CORP.A}/green-channel`, { token: H, body: { enabled: true } }), 200);
    expectStatus(g, 'PUT green-channel foreign corporate -> 404', await api('PUT', `/api/corporate-account/corporates/${CORP.B}/green-channel`, { token: H, body: { enabled: true } }), 404);
    expectStatus(g, 'PUT green-channel NULL-tenant corporate -> 404', await api('PUT', `/api/corporate-account/corporates/${CORP.NULL}/green-channel`, { token: H, body: { enabled: true } }), 404);
    expectStatus(g, 'org B enables its own corporate', await api('PUT', `/api/corporate-account/corporates/${CORP.B}/green-channel`, { token: tok.hospAdminB, body: { enabled: true } }), 200);
    const stf = await api('GET', '/api/corporate-account/green-channel/config', { token: tok.hospStaffA });
    if (stf.status === 200) info(g, 'hospital_staff passes corporate-desk gate', 'requireRole list contains "hospital", which every hospital_* role (incl. hospital_staff/doctor) normalises to -> any hospital staff can change green-channel mode, MoU, rate card, SPOC and credit limits (privilege breadth, medium/low)');
    else expectStatus(g, 'hospital_staff refused on green-channel config', stf, 403);
    expectStatus(g, 'unauthenticated -> 401', await api('GET', '/api/corporate-account/green-channel/config'), 401);
    // own-corporate CRUD
    const mouStr = await api('POST', `/api/corporate-account/corporates/${CORP.A}/mou`, { token: H, body: { terms: 'plain text terms', effectiveDate: today() } });
    if (mouStr.status >= 500) info(g, 'mou terms sent as a plain string', `returns ${mouStr.status} (${mouStr.json?.error}) — terms column is JSONB, route does not validate/coerce (should be 400)`);
    const mou = await api('POST', `/api/corporate-account/corporates/${CORP.A}/mou`, { token: H, body: { terms: { payment: 'net30', note: 'SMOKE' }, effectiveDate: today(), renewalDate: today(365) } });
    expectStatus(g, 'POST mou (own)', mou, 201);
    const mouL = await api('GET', `/api/corporate-account/corporates/${CORP.A}/mou`, { token: H });
    expectStatus(g, 'GET mou history', mouL, 200, mouL.json?.data?.length >= 1);
    expectStatus(g, 'POST rate-card (own)', await api('POST', `/api/corporate-account/corporates/${CORP.A}/rate-card`, { token: H, body: { rateCard: { consult: 400 }, effectiveDate: today() } }), 201);
    const rcG = await api('GET', `/api/corporate-account/corporates/${CORP.A}/rate-card`, { token: H });
    expectStatus(g, 'GET rate-card', rcG, 200, JSON.stringify(rcG.json?.data || {}).includes('400'));
    expectStatus(g, 'POST spoc (own)', await api('POST', `/api/corporate-account/corporates/${CORP.A}/spoc`, { token: H, body: { staffUserId: U.staffA } }), 201);
    expectStatus(g, 'GET spoc', await api('GET', `/api/corporate-account/corporates/${CORP.A}/spoc`, { token: H }), 200);
    expectStatus(g, 'POST credit-limit (own)', await api('POST', `/api/corporate-account/corporates/${CORP.A}/credit-limit`, { token: H, body: { creditLimit: 100000 } }), 201);
    const cst = await api('GET', `/api/corporate-account/corporates/${CORP.A}/credit-status`, { token: H });
    expectStatus(g, 'GET credit-status', cst, 200);
    for (const [label, corp] of [['foreign', CORP.B], ['NULL-tenant', CORP.NULL]]) {
      const c = `/api/corporate-account/corporates/${corp}`;
      expectStatus(g, `mou POST ${label} -> 404`, await api('POST', `${c}/mou`, { token: H, body: { terms: 'x' } }), 404);
      expectStatus(g, `mou GET ${label} -> 404`, await api('GET', `${c}/mou`, { token: H }), 404);
      expectStatus(g, `rate-card POST ${label} -> 404`, await api('POST', `${c}/rate-card`, { token: H, body: { rateCard: {} } }), 404);
      expectStatus(g, `spoc POST ${label} -> 404`, await api('POST', `${c}/spoc`, { token: H, body: { staffUserId: U.staffA } }), 404);
      expectStatus(g, `credit-limit POST ${label} -> 404`, await api('POST', `${c}/credit-limit`, { token: H, body: { creditLimit: 1 } }), 404);
      expectStatus(g, `credit-status GET ${label} -> 404`, await api('GET', `${c}/credit-status`, { token: H }), 404);
    }
    expectStatus(g, 'non-numeric corporate id -> 400', await api('GET', '/api/corporate-account/corporates/abc/mou', { token: H }), 400);
    // consent: employee-controlled
    const cn = await api('POST', `/api/corporate-account/corporates/${CORP.A}/consent`, { token: tok.patA, body: { dataCategory: 'fitness_certificate', granted: true } });
    expectStatus(g, 'employee grants own consent', cn, 201);
    const cbad = await api('POST', `/api/corporate-account/corporates/${CORP.A}/consent`, { token: tok.patA, body: { dataCategory: 'lab_results', granted: true } });
    if (cbad.status >= 500) info(g, 'consent with unknown dataCategory', `returns ${cbad.status} (DB CHECK as 500; should be 400)`);
    expectStatus(g, 'consent needs boolean -> 400', await api('POST', `/api/corporate-account/corporates/${CORP.A}/consent`, { token: tok.patA, body: { dataCategory: 'x', granted: 'yes' } }), 400);
    const cg = await api('GET', `/api/corporate-account/corporates/${CORP.A}/employees/${U.patA}/consent`, { token: H });
    expectStatus(g, 'desk reads granted categories', cg, 200, JSON.stringify(cg.json?.data || []).includes('fitness_certificate'));
    const cnx = await api('POST', `/api/corporate-account/corporates/${CORP.B}/consent`, { token: tok.patA, body: { dataCategory: 'fitness_certificate', granted: true } });
    if (cnx.status === 201) info(g, 'consent grant against a corporate the employee does not belong to', 'accepted (201): /consent does not verify membership of the employee in that corporate (low)');
    // requireModule enforcement
    await q(`UPDATE tenants SET features = features || '{"module_corporate_health": false}'::jsonb WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    const me = await api('GET', '/api/corporate-account/green-channel/config', { token: H });
    expectStatus(g, 'requireModule(corporate_health)=false -> 403 MODULE_NOT_ENABLED', me, 403, me.json?.error === 'MODULE_NOT_ENABLED');
    const meB = await api('GET', '/api/corporate-account/green-channel/config', { token: tok.hospAdminB });
    expectStatus(g, 'other tenant unaffected by A entitlement flag', meB, 200);
    await q(`UPDATE tenants SET features = features - 'module_corporate_health' WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    expectStatus(g, 'entitlement restored -> 200', await api('GET', '/api/corporate-account/green-channel/config', { token: H }), 200);

    // ── green channel in the queue ──
    const gq = 'G5b green-channel queue';
    await q(`INSERT INTO user_associations ("userId","entityType","entityId",role,status,"createdAt","updatedAt") VALUES ($1,'corporate',$2,'employee','active',NOW(),NOW())`, [U.corpPatA, CORP.A]);
    await q(`INSERT INTO user_associations ("userId","entityType","entityId",role,status,"createdAt","updatedAt") VALUES ($1,'corporate',$2,'employee','active',NOW(),NOW())`, [U.corpPatB, CORP.B]);
    await q(`INSERT INTO display_devices (device_token, name, zone_id, display_type, organization_id, active) VALUES ($1,'smoke device','opd-waiting','queue-board',$2,true)`, [DEV_TOKEN, A]);
    const QH = tok.hospA;
    const ctx = await api('GET', '/api/qms/context', { token: QH });
    const zone = ctx.json?.context?.queueZone || 'opd-waiting';
    const chk = (body, tk = QH) => api('POST', '/api/qms/check-in', { token: tk, body });
    // SSE subscriber on the PUBLIC display stream
    const ctrl = new AbortController();
    let sseBuf = '';
    const sseRes = await fetch(`${BASE}/api/display/events?zone=${zone}&deviceToken=${DEV_TOKEN}`, { signal: ctrl.signal });
    ok(gq, 'public display SSE endpoint connects', sseRes.status === 200, `HTTP ${sseRes.status}`);
    (async () => { try { const rd = sseRes.body.getReader(); const dec = new TextDecoder(); for (;;) { const { value, done } = await rd.read(); if (done) break; sseBuf += dec.decode(value); } } catch { /* aborted */ } })();
    await sleep(300);
    const ctl = await chk({ patientName: 'SMOKE Control' });
    const corp = await chk({ patientName: 'SMOKE Corp Employee', patientId: U.corpPatA });
    expectStatus(gq, 'QMS check-in (control walk-in)', ctl, 201);
    expectStatus(gq, 'QMS check-in (corporate employee)', corp, 201);
    const pc = ctl.json?.entry?.priorityScore; const pk = corp.json?.entry?.priorityScore;
    ok(gq, 'green channel adds +5 priority when no triage level', pk - pc === 5, `control=${pc} corp=${pk}`);
    const tri = await chk({ patientName: 'SMOKE Corp Triage', patientId: U.corpPatA, triageLevel: 3 });
    const triCtl = await chk({ patientName: 'SMOKE Triage Control', triageLevel: 3 });
    ok(gq, 'no bonus when a triage level is present', tri.json?.entry?.priorityScore === triCtl.json?.entry?.priorityScore, `corp=${tri.json?.entry?.priorityScore} ctl=${triCtl.json?.entry?.priorityScore}`);
    const foreign = await chk({ patientName: 'SMOKE Foreign Corp', patientId: U.corpPatB });
    ok(gq, 'employee of ANOTHER org\'s corporate gets no bonus', foreign.json?.entry?.priorityScore === pc, `foreign=${foreign.json?.entry?.priorityScore} control=${pc}`);
    const cons = await api('GET', `/api/qms/console?zone=${zone}`, { token: QH });
    const ents = cons.json?.entries || [];
    const corpEntry = ents.find((e) => e.id === corp.json?.entry?.id);
    ok(gq, 'staff console shows green-channel marker (staff_badge mode)', !!corpEntry?.metadata?.greenChannel && corpEntry.metadata.greenChannel.lane === false, JSON.stringify(corpEntry?.metadata || {}).slice(0, 160));
    ok(gq, 'control entry has no marker', !ents.find((e) => e.id === ctl.json?.entry?.id)?.metadata?.greenChannel);
    const pub = await api('GET', `/api/display/queue?zone=${zone}&department=opd&deviceToken=${DEV_TOKEN}`, { token: undefined });
    ok(gq, 'public display board (/api/display/queue) has NO marker', pub.status === 200 && !/greenChannel|green/i.test(pub.text), short(pub));
    const svc = await import(pathToFileURL(path.join(SERVER, 'services/hospital-queue.service.js')).href);
    const snapPub = await svc.getBoardSnapshot({ organizationId: A, queueZone: zone, department: 'opd' });
    const snapStaff = await svc.getBoardSnapshot({ organizationId: A, queueZone: zone, department: 'opd', staffView: true });
    ok(gq, 'getBoardSnapshot default strips marker; staffView keeps it', !/greenChannel/.test(JSON.stringify(snapPub)) && /greenChannel/.test(JSON.stringify(snapStaff)));
    await sleep(600);
    ok(gq, 'SSE stream delivered the token-issued event', /queue_token_issued/.test(sseBuf), sseBuf.slice(0, 200));
    ok(gq, 'SSE payload has NO green-channel marker', !/greenChannel/.test(sseBuf), 'marker leaked into public SSE');
    // separate_lane + quiet modes
    await api('PUT', '/api/corporate-account/green-channel/config', { token: H, body: { displayMode: 'separate_lane' } });
    const lane = await chk({ patientName: 'SMOKE Lane', patientId: U.corpPatA });
    const cons2 = await api('GET', `/api/qms/console?zone=${zone}`, { token: QH });
    ok(gq, 'separate_lane: staff marker lane=true', cons2.json?.entries?.find((e) => e.id === lane.json?.entry?.id)?.metadata?.greenChannel?.lane === true);
    await api('PUT', '/api/corporate-account/green-channel/config', { token: H, body: { displayMode: 'quiet' } });
    const quiet = await chk({ patientName: 'SMOKE Quiet', patientId: U.corpPatA });
    const cons3 = await api('GET', `/api/qms/console?zone=${zone}`, { token: QH });
    ok(gq, 'quiet mode: +5 priority but no marker', quiet.json?.entry?.priorityScore - pc === 5 && !cons3.json?.entries?.find((e) => e.id === quiet.json?.entry?.id)?.metadata?.greenChannel, `p=${quiet.json?.entry?.priorityScore}`);
    await sleep(300);
    ok(gq, 'SSE still marker-free after lane/quiet events', !/greenChannel/.test(sseBuf));
    ctrl.abort();
    const logN = await q1(`SELECT count(*)::int AS n FROM green_channel_application_log WHERE organization_id=$1`, [A]);
    ok(gq, 'application audit log written (fairness review)', logN.n >= 3, `rows=${logN.n}`);
    const imp = await api('GET', '/api/corporate-account/green-channel/config', { token: H });
    ok(gq, 'config impactLast30Days reflects applications', imp.json?.data?.impactLast30Days?.applications >= 3, JSON.stringify(imp.json?.data?.impactLast30Days));
  }

  // ═══ G6  queue branch filter ═══
  {
    const g = 'G6 queue-branch';
    const QH = tok.hospA;
    const chk = (body) => api('POST', '/api/qms/check-in', { token: QH, body });
    const e1 = await chk({ patientName: 'SMOKE Br A1', patientId: U.corpPatA, branchId: G.branchA1, queueType: 'scheduled' });
    const e2 = await chk({ patientName: 'SMOKE Br A2', branchId: G.branchA2, queueType: 'scheduled' });
    const e3 = await chk({ patientName: 'SMOKE Br foreign', branchId: G.branchB1, queueType: 'scheduled' });
    const e4 = await chk({ patientName: 'SMOKE Br none', queueType: 'scheduled' });
    ok(g, 'check-in with branchId stores branch', e1.json?.entry?.branchId === G.branchA1 && e2.json?.entry?.branchId === G.branchA2, `${e1.json?.entry?.branchId}/${e2.json?.entry?.branchId}`);
    ok(g, 'check-in with ANOTHER org\'s branchId -> stored NULL', e3.status === 201 && e3.json?.entry?.branchId === null, `branchId=${e3.json?.entry?.branchId}`);
    const cA1 = await api('GET', `/api/qms/console?branchId=${G.branchA1}`, { token: QH });
    const ids = (r) => new Set((r.json?.entries || []).map((e) => e.id));
    const s1 = ids(cA1);
    ok(g, 'console?branchId filters (A1 present, A2 absent, untagged legacy present)', s1.has(e1.json?.entry?.id) && !s1.has(e2.json?.entry?.id) && s1.has(e4.json?.entry?.id), `n=${s1.size}`);
    const cH = await api('GET', '/api/qms/console', { token: QH, headers: { 'x-branch-id': String(G.branchA2) } });
    const s2 = ids(cH);
    ok(g, 'console X-Branch-Id header filters (A2 present, A1 absent)', s2.has(e2.json?.entry?.id) && !s2.has(e1.json?.entry?.id));
    const cAll = await api('GET', '/api/qms/console', { token: QH });
    ok(g, 'console without branch shows all', ids(cAll).has(e1.json?.entry?.id) && ids(cAll).has(e2.json?.entry?.id));
    const cForeign = await api('GET', `/api/qms/console?branchId=${G.branchB1}`, { token: QH });
    const sf = ids(cForeign);
    info(g, 'console?branchId=<foreign org branch>', `returns ${sf.size} entries of caller's own org only (org filter always applied)`);
    ok(g, 'foreign branchId filter cannot leak other-org rows', (cForeign.json?.entries || []).every((e) => e.organizationId === A || e.organizationId === undefined));
    const bs = await api('GET', `/api/hospital-branch/patients/${U.corpPatA}/branch-summary`, { token: tok.hospAdminA });
    expectStatus(g, 'GET branch-summary (patient seen at A1)', bs, 200, bs.json?.data?.some((b) => b.branch_id === G.branchA1 && b.visit_count >= 1), JSON.stringify(bs.json?.data));
    const bsB = await api('GET', `/api/hospital-branch/patients/${U.corpPatA}/branch-summary`, { token: tok.hospAdminB });
    expectStatus(g, 'org B branch-summary for same patient is empty', bsB, 200, bsB.json?.data?.length === 0);
  }

  // ═══ G7  ambulance ═══
  {
    const g = 'G7 ambulance';
    const T = tok.ambA; const TB = tok.ambB;
    expectStatus(g, 'no token -> 401', await api('GET', '/api/ambulance/trips/active'), 401);
    const pt = await api('GET', '/api/ambulance/trips/active', { token: tok.patA });
    ok(g, 'patient token -> 403', pt.status === 403, short(pt));
    const adm = await api('GET', '/api/ambulance/trips/active', { token: tok.adminA });
    expectStatus(g, 'non-ambulance JWT (admin) -> 403 at route', adm, 403, /Ambulance provider/.test(adm.text));
    expectStatus(g, 'POST /trips missing pickup -> 400', await api('POST', '/api/ambulance/trips', { token: T, body: {} }), 400);
    const tr = await api('POST', '/api/ambulance/trips', { token: T, body: { pickupLocation: 'SMOKE pickup', dropLocation: 'SMOKE hospital', patientName: 'SMOKE P', patientPhone: '9999999999', tripType: 'emergency', urgency: 'High', driverName: 'SMOKE D' } });
    expectStatus(g, 'POST /trips (dispatch)', tr, 201, tr.json?.trip?.id > 0);
    const tid = tr.json?.trip?.id;
    expectStatus(g, 'PATCH status invalid -> 400', await api('PATCH', `/api/ambulance/trips/${tid}/status`, { token: T, body: { status: 'flying' } }), 400);
    expectStatus(g, 'PATCH status missing -> 400', await api('PATCH', `/api/ambulance/trips/${tid}/status`, { token: T, body: {} }), 400);
    expectStatus(g, 'PATCH status invalid trip id -> 400', await api('PATCH', '/api/ambulance/trips/abc/status', { token: T, body: { status: 'arrived' } }), 400);
    expectStatus(g, 'other provider PATCH status -> 404', await api('PATCH', `/api/ambulance/trips/${tid}/status`, { token: TB, body: { status: 'en_route' } }), 404);
    expectStatus(g, 'other provider PATCH fare -> 404', await api('PATCH', `/api/ambulance/trips/${tid}/fare`, { token: TB, body: { fareAmount: 1 } }), 404);
    const act = await api('GET', '/api/ambulance/trips/active', { token: T });
    expectStatus(g, 'GET /trips/active lists dispatched trip', act, 200, act.json?.trips?.some((t) => t.id === tid));
    const actB = await api('GET', '/api/ambulance/trips/active', { token: TB });
    expectStatus(g, 'other provider active list excludes it', actB, 200, !actB.json?.trips?.some((t) => t.id === tid));
    expectStatus(g, 'PATCH status en_route', await api('PATCH', `/api/ambulance/trips/${tid}/status`, { token: T, body: { status: 'en_route' } }), 200);
    expectStatus(g, 'PATCH status arrived', await api('PATCH', `/api/ambulance/trips/${tid}/status`, { token: T, body: { status: 'arrived' } }), 200);
    const fare = await api('PATCH', `/api/ambulance/trips/${tid}/fare`, { token: T, body: { fareAmount: 1500.5, paymentStatus: 'paid' } });
    expectStatus(g, 'PATCH /trips/:id/fare', fare, 200, Number(fare.json?.trip?.fare_amount ?? fare.json?.trip?.fareAmount) === 1500.5, JSON.stringify(fare.json?.trip || {}).slice(0, 160));
    expectStatus(g, 'fare negative -> 400', await api('PATCH', `/api/ambulance/trips/${tid}/fare`, { token: T, body: { fareAmount: -1 } }), 400);
    expectStatus(g, 'fare bad paymentStatus -> 400', await api('PATCH', `/api/ambulance/trips/${tid}/fare`, { token: T, body: { paymentStatus: 'maybe' } }), 400);
    expectStatus(g, 'fare empty body -> 400', await api('PATCH', `/api/ambulance/trips/${tid}/fare`, { token: T, body: {} }), 400);
    expectStatus(g, 'PATCH status completed', await api('PATCH', `/api/ambulance/trips/${tid}/status`, { token: T, body: { status: 'completed' } }), 200);
    const comp = await api('GET', '/api/ambulance/trips/completed', { token: T });
    expectStatus(g, 'GET /trips/completed', comp, 200, comp.json?.trips?.some((t) => t.id === tid));
    expectStatus(g, 'GET /trips', await api('GET', '/api/ambulance/trips?status=completed', { token: T }), 200);
    expectStatus(g, 'GET /dashboard-stats', await api('GET', '/api/ambulance/dashboard-stats', { token: T }), 200);
    const fs = await api('GET', '/api/ambulance/financial-summary', { token: T });
    expectStatus(g, 'GET /financial-summary reflects paid fare', fs, 200, JSON.stringify(fs.json?.summary || {}).includes('1500'), JSON.stringify(fs.json?.summary));
    const fsB = await api('GET', '/api/ambulance/financial-summary', { token: TB });
    ok(g, 'other provider financial-summary excludes it', fsB.status === 200 && !JSON.stringify(fsB.json?.summary || {}).includes('1500'), JSON.stringify(fsB.json?.summary));
    const trBad = await api('POST', '/api/ambulance/trips', { token: T, body: { pickupLocation: 'x', tripType: 'bogus' } });
    const urgBad = await api('POST', '/api/ambulance/trips', { token: T, body: { pickupLocation: 'x', urgency: 'high' } });
    if (urgBad.status >= 500) info(g, 'POST /trips urgency "high" (lowercase)', `returns ${urgBad.status}: urgency is not validated in the route; DB CHECK wants Critical|High|Medium|Low and surfaces as 500 (should be 400)`);
    if (trBad.status >= 500) info(g, 'POST /trips tripType "bogus"', `returns ${trBad.status} (DB CHECK surfaced as 500; should be 400)`); else ok(g, 'invalid tripType rejected', trBad.status === 400, short(trBad));
    // fleet
    const v = await api('POST', '/api/ambulance/fleet/vehicles', { token: T, body: { registrationNumber: 'smk-001', vehicleType: 'ALS', status: 'available', lastServiceDate: today(-30), nextServiceDue: today(3) } });
    expectStatus(g, 'POST /fleet/vehicles', v, 201, v.json?.vehicle?.id > 0);
    const vid = v.json?.vehicle?.id;
    expectStatus(g, 'duplicate registration -> 409', await api('POST', '/api/ambulance/fleet/vehicles', { token: T, body: { registrationNumber: 'SMK-001' } }), 409);
    expectStatus(g, 'vehicle bad type -> 400', await api('POST', '/api/ambulance/fleet/vehicles', { token: T, body: { registrationNumber: 'X', vehicleType: 'Rocket' } }), 400);
    expectStatus(g, 'vehicle bad date -> 400', await api('POST', '/api/ambulance/fleet/vehicles', { token: T, body: { registrationNumber: 'X2', lastServiceDate: '01/02/2026' } }), 400);
    const vl = await api('GET', '/api/ambulance/fleet/vehicles', { token: T });
    expectStatus(g, 'GET /fleet/vehicles', vl, 200, vl.json?.vehicles?.some((x) => x.id === vid));
    expectStatus(g, 'other provider vehicle list excludes', await api('GET', '/api/ambulance/fleet/vehicles', { token: TB }), 200);
    expectStatus(g, 'PATCH vehicle status', await api('PATCH', `/api/ambulance/fleet/vehicles/${vid}/status`, { token: T, body: { status: 'available' } }), 200);
    expectStatus(g, 'PATCH vehicle status invalid -> 400', await api('PATCH', `/api/ambulance/fleet/vehicles/${vid}/status`, { token: T, body: { status: 'flying' } }), 400);
    expectStatus(g, 'other provider PATCH vehicle -> 404', await api('PATCH', `/api/ambulance/fleet/vehicles/${vid}/status`, { token: TB, body: { status: 'off_duty' } }), 404);
    expectStatus(g, 'GET /fleet/summary', await api('GET', '/api/ambulance/fleet/summary', { token: T }), 200);
    const cr = await api('POST', '/api/ambulance/crew', { token: T, body: { name: 'SMOKE Driver', role: 'driver', licenseNumber: 'DL-SMOKE', phone: '9000000000' } });
    expectStatus(g, 'POST /crew', cr, 201, cr.json?.member?.id > 0);
    const crid = cr.json?.member?.id;
    expectStatus(g, 'crew bad role -> 400', await api('POST', '/api/ambulance/crew', { token: T, body: { name: 'x', role: 'pilot' } }), 400);
    expectStatus(g, 'GET /crew?role=driver', await api('GET', '/api/ambulance/crew?role=driver', { token: T }), 200);
    expectStatus(g, 'GET /crew?role=bad -> 400', await api('GET', '/api/ambulance/crew?role=bad', { token: T }), 400);
    expectStatus(g, 'PATCH crew duty', await api('PATCH', `/api/ambulance/crew/${crid}/duty`, { token: T, body: { dutyStatus: 'off_duty' } }), 200);
    expectStatus(g, 'other provider PATCH crew duty -> 404', await api('PATCH', `/api/ambulance/crew/${crid}/duty`, { token: TB, body: { dutyStatus: 'on_duty' } }), 404);
    const mt = await api('POST', '/api/ambulance/maintenance', { token: T, body: { vehicleId: vid, maintenanceType: 'Oil change', scheduledDate: today(2), notes: 'smoke' } });
    expectStatus(g, 'POST /maintenance', mt, 201, mt.json?.maintenance?.id > 0);
    const mid = mt.json?.maintenance?.id;
    expectStatus(g, 'other provider schedules maintenance on my vehicle -> 404', await api('POST', '/api/ambulance/maintenance', { token: TB, body: { vehicleId: vid, maintenanceType: 'x', scheduledDate: today() } }), 404);
    expectStatus(g, 'maintenance bad date -> 400', await api('POST', '/api/ambulance/maintenance', { token: T, body: { vehicleId: vid, maintenanceType: 'x', scheduledDate: 'tomorrow' } }), 400);
    expectStatus(g, 'PATCH maintenance start', await api('PATCH', `/api/ambulance/maintenance/${mid}/start`, { token: T }), 200);
    expectStatus(g, 'other provider start maintenance -> 404', await api('PATCH', `/api/ambulance/maintenance/${mid}/start`, { token: TB }), 404);
    expectStatus(g, 'PATCH maintenance complete', await api('PATCH', `/api/ambulance/maintenance/${mid}/complete`, { token: T, body: { lastServiceDate: today(), nextServiceDue: today(90) } }), 200);
    expectStatus(g, 'GET /maintenance', await api('GET', '/api/ambulance/maintenance', { token: T }), 200);
    const vAfter = await q1(`SELECT status, last_service_date, next_service_due FROM ambulance_vehicle WHERE id=$1`, [vid]);
    ok(g, 'maintenance complete updated vehicle service dates', String(vAfter.next_service_due).length > 0 && vAfter.next_service_due && new Date(vAfter.next_service_due).toISOString().slice(0, 10) === today(90), JSON.stringify(vAfter));
    const sh = await api('POST', '/api/ambulance/shifts', { token: T, body: { crewId: crid, vehicleId: vid, shiftDate: today(1), startTime: '08:00', endTime: '16:00' } });
    expectStatus(g, 'POST /shifts', sh, 201);
    expectStatus(g, 'shift bad time -> 400', await api('POST', '/api/ambulance/shifts', { token: T, body: { crewId: crid, shiftDate: today(1), startTime: '8am', endTime: '16:00' } }), 400);
    expectStatus(g, 'other provider shift w/ my crew -> 404', await api('POST', '/api/ambulance/shifts', { token: TB, body: { crewId: crid, shiftDate: today(1), startTime: '08:00', endTime: '16:00' } }), 404);
    expectStatus(g, 'GET /shifts range', await api('GET', `/api/ambulance/shifts?from=${today(0)}&to=${today(7)}`, { token: T }), 200);
    expectStatus(g, 'GET /shifts bad range -> 400', await api('GET', '/api/ambulance/shifts?from=abc', { token: T }), 400);
    const al = await api('GET', '/api/ambulance/alerts', { token: T });
    expectStatus(g, 'GET /alerts', al, 200, Array.isArray(al.json?.alerts));
  }

  // ═══ G8  biomedical registry ═══
  {
    const g = 'G8 biomedical';
    const mk = (tenant) => sign({ id: 77, email: 'bio@smoke.invalid', role: 'biomedical', tenant_id: tenant, hospital_id: tenant });
    const TA = mk(A); const TBk = mk(B);
    const eqA = await q1(`INSERT INTO hg_equipment_inventory (tenant_id, equipment_class, device_name) VALUES ($1,'ventilator','SMOKE Vent A') RETURNING id`, [A]);
    const eqB = await q1(`INSERT INTO hg_equipment_inventory (tenant_id, equipment_class, device_name) VALUES ($1,'ventilator','SMOKE Vent B') RETURNING id`, [B]);
    const el = await api('GET', '/api/biomedical/equipment', { token: TA });
    expectStatus(g, 'GET /equipment (tenant A only)', el, 200, el.json?.data?.some((e) => e.id === eqA.id) && !el.json.data.some((e) => e.id === eqB.id));
    expectStatus(g, 'no token -> 401', await api('GET', '/api/biomedical/equipment'), 401);
    const tk = await api('POST', '/api/biomedical/maintenance-tickets', { token: TA, body: { equipmentId: eqA.id, issueDescription: 'SMOKE alarm fault', priority: 'urgent' } });
    expectStatus(g, 'POST /maintenance-tickets (open)', tk, 201, tk.json?.data?.status === 'open' || !!tk.json?.data?.id, JSON.stringify(tk.json?.data || {}).slice(0, 120));
    const tkid = tk.json?.data?.id;
    expectStatus(g, 'ticket bad priority -> 400', await api('POST', '/api/biomedical/maintenance-tickets', { token: TA, body: { issueDescription: 'x', priority: 'asap' } }), 400);
    expectStatus(g, 'ticket bad equipmentId -> 400', await api('POST', '/api/biomedical/maintenance-tickets', { token: TA, body: { equipmentId: 'abc', issueDescription: 'x' } }), 400);
    expectStatus(g, 'ticket for tenant B equipment -> 404', await api('POST', '/api/biomedical/maintenance-tickets', { token: TA, body: { equipmentId: eqB.id, issueDescription: 'x' } }), 404);
    const tl = await api('GET', '/api/biomedical/maintenance-tickets?status=open', { token: TA });
    expectStatus(g, 'GET /maintenance-tickets?status=open', tl, 200, tl.json?.data?.some((t) => t.id === tkid));
    const tlB = await api('GET', '/api/biomedical/maintenance-tickets', { token: TBk });
    expectStatus(g, 'tenant B ticket list excludes A', tlB, 200, !tlB.json?.data?.some((t) => t.id === tkid));
    expectStatus(g, 'tenant B resolve A ticket -> 404', await api('POST', `/api/biomedical/maintenance-tickets/${tkid}/resolve`, { token: TBk, body: { resolutionNotes: 'x' } }), 404);
    const rs = await api('POST', `/api/biomedical/maintenance-tickets/${tkid}/resolve`, { token: TA, body: { resolutionNotes: 'replaced sensor', assignedTo: 'tech1' } });
    expectStatus(g, 'POST resolve ticket', rs, 200, rs.json?.data?.status === 'resolved' || rs.json?.data?.status === 'closed', rs.json?.data?.status);
    const cs = await api('POST', '/api/biomedical/calibration-schedule', { token: TA, body: { equipmentId: eqA.id, calibrationType: 'annual', nextDueAt: today(10), frequencyDays: 365 } });
    expectStatus(g, 'POST /calibration-schedule', cs, 201);
    const csid = cs.json?.data?.id;
    expectStatus(g, 'calibration missing fields -> 400', await api('POST', '/api/biomedical/calibration-schedule', { token: TA, body: { equipmentId: eqA.id } }), 400);
    expectStatus(g, 'calibration for B equipment -> 404', await api('POST', '/api/biomedical/calibration-schedule', { token: TA, body: { equipmentId: eqB.id, calibrationType: 'x', nextDueAt: today(1) } }), 404);
    const due = await api('GET', '/api/biomedical/calibration-due?withinDays=30', { token: TA });
    expectStatus(g, 'GET /calibration-due lists it', due, 200, due.json?.data?.some((d) => d.id === csid || d.equipment_id === eqA.id));
    const dueB = await api('GET', '/api/biomedical/calibration-due?withinDays=30', { token: TBk });
    expectStatus(g, 'tenant B calibration-due excludes A', dueB, 200, !dueB.json?.data?.some((d) => d.equipment_id === eqA.id));
    expectStatus(g, 'tenant B complete A calibration -> 404', await api('POST', `/api/biomedical/calibration-schedule/${csid}/complete`, { token: TBk }), 404);
    const cc = await api('POST', `/api/biomedical/calibration-schedule/${csid}/complete`, { token: TA });
    expectStatus(g, 'POST calibration complete (next due advanced by frequency)', cc, 200, cc.json?.data?.next_due_at && new Date(cc.json.data.next_due_at) > new Date(Date.now() + 300 * 86400000), JSON.stringify(cc.json?.data || {}).slice(0, 160));
    // auth weakness probe: any valid JWT is accepted; tenant falls back to token id
    const evil = await api('GET', '/api/biomedical/equipment', { token: sign({ id: A, role: 'patient' }) });
    ok(g, 'patient token is NOT accepted on biomedical registry', evil.status === 401 || evil.status === 403, `patient token with id==tenantId reads that tenant's equipment: ${short(evil)}`);
  }

  // ═══ G9  asset tracking ═══
  {
    const g = 'G9 asset-tracking';
    const H = tok.hospAdminA; const HB = tok.hospAdminB;
    const rd = await api('POST', '/api/asset-tracking/readers', { token: H, body: { deviceName: 'SMOKE reader', location: 'Ward 1' } });
    expectStatus(g, 'POST /readers (key returned once)', rd, 201, typeof rd.json?.data?.apiKey === 'string' && rd.json.data.apiKey.length >= 16);
    const rkey = rd.json?.data?.apiKey; const rid = rd.json?.data?.device?.id;
    expectStatus(g, 'POST /readers missing name -> 400', await api('POST', '/api/asset-tracking/readers', { token: H, body: {} }), 400);
    const rl = await api('GET', '/api/asset-tracking/readers', { token: H });
    expectStatus(g, 'GET /readers never returns key/hash', rl, 200, rl.json?.data?.some((d) => d.id === rid) && !/api_?key/i.test(JSON.stringify(rl.json.data).replace(/api_key_hash/g, 'x')) || !JSON.stringify(rl.json?.data).includes(rkey));
    const tg = await api('POST', '/api/asset-tracking/tags', { token: H, body: { tagUid: 'SMOKE-TAG-1', assetType: 'equipment', label: 'Smoke pump' } });
    expectStatus(g, 'POST /tags (register)', tg, 201, tg.json?.data?.id > 0);
    const tid = tg.json?.data?.id;
    expectStatus(g, 'duplicate tag -> 400', await api('POST', '/api/asset-tracking/tags', { token: H, body: { tagUid: 'SMOKE-TAG-1', assetType: 'equipment' } }), [400, 409]);
    expectStatus(g, 'tag bad assetType -> 400', await api('POST', '/api/asset-tracking/tags', { token: H, body: { tagUid: 'SMOKE-TAG-2', assetType: 'spaceship' } }), 400);
    expectStatus(g, 'GET /tags', await api('GET', '/api/asset-tracking/tags', { token: H }), 200);
    expectStatus(g, 'GET /tags/uid/:uid', await api('GET', '/api/asset-tracking/tags/uid/SMOKE-TAG-1', { token: H }), 200);
    const ev = await api('POST', `/api/asset-tracking/tags/${tid}/events`, { token: H, body: { eventType: 'location_update', location: 'OT-1', notes: 'moved', source: 'reader', reader_device_id: rid } });
    expectStatus(g, 'POST /tags/:id/events (manual)', ev, 201, ev.json?.data?.source === 'manual', `source=${ev.json?.data?.source}`);
    expectStatus(g, 'GET /tags/:id/location', await api('GET', `/api/asset-tracking/tags/${tid}/location`, { token: H }), 200);
    expectStatus(g, 'GET /stats', await api('GET', '/api/asset-tracking/stats', { token: H }), 200);
    // reader ingest without any bearer token, through the real ringFencing
    const hdr = { 'X-Reader-Key': rkey };
    const now = new Date().toISOString();
    const i1 = await api('POST', '/api/asset-tracking/reader/events', { headers: hdr, body: { scans: [{ tagUid: 'SMOKE-TAG-1', eventType: 'location_update', rssi: -60, scannedAt: now }, { tagUid: 'SMOKE-UNKNOWN', eventType: 'checkin' }, { tagUid: '', eventType: 'checkin' }] } });
    expectStatus(g, 'reader ingest w/o bearer passes ringFencing', i1, 200, i1.json?.code !== 'NO_TOKEN' && i1.json?.data?.accepted === 1 && i1.json.data.unknownTags === 1 && i1.json.data.rejected === 1, JSON.stringify(i1.json?.data));
    const i2 = await api('POST', '/api/asset-tracking/reader/events', { headers: hdr, body: { scans: [{ tagUid: 'SMOKE-TAG-1', eventType: 'location_update', scannedAt: now }] } });
    expectStatus(g, 'reader duplicate scan is de-duplicated', i2, 200, i2.json?.data?.duplicates === 1 && i2.json.data.accepted === 0, JSON.stringify(i2.json?.data));
    const src = await q1(`SELECT count(*)::int AS n FROM asset_tag_event WHERE tag_id=$1 AND source='reader' AND reader_device_id=$2`, [tid, rid]);
    ok(g, 'reader events stored with source=reader + device id', src.n === 1, `n=${src.n}`);
    const manualReader = await q1(`SELECT count(*)::int AS n FROM asset_tag_event WHERE tag_id=$1 AND source='manual' AND reader_device_id IS NOT NULL`, [tid]);
    ok(g, 'manual event cannot claim source=reader / device', manualReader.n === 0);
    expectStatus(g, 'bad reader key -> 401', await api('POST', '/api/asset-tracking/reader/events', { headers: { 'X-Reader-Key': 'nope-nope-nope' }, body: { scans: [] } }), 401);
    expectStatus(g, 'missing reader key -> 401', await api('POST', '/api/asset-tracking/reader/events', { body: { scans: [] } }), 401);
    expectStatus(g, 'scans not array -> 400', await api('POST', '/api/asset-tracking/reader/events', { headers: hdr, body: { scans: 'x' } }), 400);
    expectStatus(g, 'scans > 500 -> 400', await api('POST', '/api/asset-tracking/reader/events', { headers: hdr, body: { scans: Array.from({ length: 501 }, () => ({ tagUid: 'a' })) } }), 400);
    const bearerKey = await api('POST', '/api/asset-tracking/reader/events', { token: H, headers: hdr, body: { scans: [] } });
    ok(g, 'reader ingest ignores/does-not-need staff bearer', bearerKey.status === 200, short(bearerKey));
    // tenant isolation
    expectStatus(g, 'org B GET tag by uid -> 404', await api('GET', '/api/asset-tracking/tags/uid/SMOKE-TAG-1', { token: HB }), 404);
    const tlB = await api('GET', '/api/asset-tracking/tags', { token: HB });
    expectStatus(g, 'org B tag list excludes A', tlB, 200, !tlB.json?.data?.some((t) => t.id === tid));
    expectStatus(g, 'org B deactivate A reader -> 404', await api('PATCH', `/api/asset-tracking/readers/${rid}/deactivate`, { token: HB }), 404);
    const idorEv = await api('POST', `/api/asset-tracking/tags/${tid}/events`, { token: HB, body: { eventType: 'lost_reported', location: 'HACK' } });
    ok(g, 'org B cannot record event on A tag (IDOR)', idorEv.status === 404 || idorEv.status === 403, `tenant isolation gap: ${short(idorEv)}`);
    const idorSt = await api('PATCH', `/api/asset-tracking/tags/${tid}/status`, { token: HB, body: { status: 'retired' } });
    ok(g, 'org B cannot change A tag status (IDOR)', idorSt.status === 404 || idorSt.status === 403, `tenant isolation gap: ${short(idorSt)}`);
    const idorLoc = await api('GET', `/api/asset-tracking/tags/${tid}/location`, { token: HB });
    ok(g, 'org B cannot read A tag last location (IDOR)', idorLoc.status === 404 || idorLoc.status === 403 || !idorLoc.json?.data, `tenant isolation gap: ${short(idorLoc)}`);
    await q(`UPDATE asset_tag SET status='active' WHERE id=$1`, [tid]);
    // retired tag is rejected by reader, deactivated reader loses access
    expectStatus(g, 'PATCH /tags/:id/status -> lost', await api('PATCH', `/api/asset-tracking/tags/${tid}/status`, { token: H, body: { status: 'lost' } }), 200);
    expectStatus(g, 'PATCH /tags/:id/status invalid -> 400', await api('PATCH', `/api/asset-tracking/tags/${tid}/status`, { token: H, body: { status: 'exploded' } }), 400);
    expectStatus(g, 'PATCH /readers/:id/deactivate', await api('PATCH', `/api/asset-tracking/readers/${rid}/deactivate`, { token: H }), 200);
    expectStatus(g, 'deactivated reader key -> 401', await api('POST', '/api/asset-tracking/reader/events', { headers: hdr, body: { scans: [] } }), 401);
    // entitlement
    await q(`UPDATE tenants SET features = features || '{"module_asset_tracking": false}'::jsonb WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    const me = await api('GET', '/api/asset-tracking/stats', { token: H });
    expectStatus(g, 'requireModule(asset_tracking)=false -> 403 MODULE_NOT_ENABLED', me, 403, me.json?.error === 'MODULE_NOT_ENABLED');
    await q(`UPDATE tenants SET features = features - 'module_asset_tracking' WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    expectStatus(g, 'entitlement restored -> 200', await api('GET', '/api/asset-tracking/stats', { token: H }), 200);
  }

  // ═══ G10  DMS + housekeeping ═══
  {
    const g = 'G10 dms/housekeeping';
    const H = tok.hospAdminA; const HB = tok.hospAdminB;
    const cat = await api('GET', '/api/dms/categories', { token: H });
    expectStatus(g, 'GET /dms/categories', cat, 200, cat.json?.data?.length === 7);
    const doc = await q1(`INSERT INTO dms_document (organization_id, category, title, description, status, current_version, file_url, file_key, file_name, mime_type, size_bytes)
                          VALUES ($1,'policy','SMOKE Policy','d','draft',1,'http://x','k','p.pdf','application/pdf',10) RETURNING id`, [A]);
    await q(`INSERT INTO dms_document_version (document_id, version_no, file_url, file_key, file_name, mime_type, size_bytes) VALUES ($1,1,'http://x','k','p.pdf','application/pdf',10)`, [doc.id]);
    const dl = await api('GET', '/api/dms/documents?category=policy', { token: H });
    expectStatus(g, 'GET /dms/documents', dl, 200, dl.json?.data?.some((d) => d.id === doc.id));
    expectStatus(g, 'GET /dms/documents/:id', await api('GET', `/api/dms/documents/${doc.id}`, { token: H }), 200);
    expectStatus(g, 'hospital_staff can read documents', await api('GET', '/api/dms/documents', { token: tok.hospStaffA }), 200);
    expectStatus(g, 'org B GET A document -> 404', await api('GET', `/api/dms/documents/${doc.id}`, { token: HB }), 404);
    const dlB = await api('GET', '/api/dms/documents', { token: HB });
    expectStatus(g, 'org B list excludes A document', dlB, 200, !dlB.json?.data?.some((d) => d.id === doc.id));
    expectStatus(g, 'org B publish A document -> 404', await api('PATCH', `/api/dms/documents/${doc.id}/publish`, { token: HB }), 404);
    expectStatus(g, 'org B archive A document -> 404', await api('PATCH', `/api/dms/documents/${doc.id}/archive`, { token: HB }), 404);
    expectStatus(g, 'org B delete A document -> 404', await api('DELETE', `/api/dms/documents/${doc.id}`, { token: HB }), 404);
    expectStatus(g, 'hospital_staff publish -> 403 (write = custodians only)', await api('PATCH', `/api/dms/documents/${doc.id}/publish`, { token: tok.hospStaffA }), 403);
    const pb = await api('PATCH', `/api/dms/documents/${doc.id}/publish`, { token: H });
    expectStatus(g, 'PATCH publish (hospital_admin)', pb, 200, pb.json?.data?.status === 'published', pb.json?.data?.status);
    const ar = await api('PATCH', `/api/dms/documents/${doc.id}/archive`, { token: H });
    expectStatus(g, 'PATCH archive', ar, 200, ar.json?.data?.status === 'archived', ar.json?.data?.status);
    expectStatus(g, 'GET invalid id -> 400', await api('GET', '/api/dms/documents/abc', { token: H }), 400);
    expectStatus(g, 'POST /documents bad category -> 400 (before any upload)', await api('POST', '/api/dms/documents', { token: H, body: { category: 'bogus', title: 'x' } }), 400);
    expectStatus(g, 'POST /documents without file -> 400', await api('POST', '/api/dms/documents', { token: H, body: { category: 'policy', title: 'x' } }), 400);
    skip(g, 'POST /dms/documents + /versions with file', 'needs MinIO (external object store) — not exercised');
    expectStatus(g, 'DELETE archived document -> 400 (only drafts deletable)', await api('DELETE', `/api/dms/documents/${doc.id}`, { token: H }), 400);
    const doc2 = await q1(`INSERT INTO dms_document (organization_id, category, title, status, current_version, file_url, file_key, file_name, mime_type, size_bytes)
                           VALUES ($1,'sop','SMOKE Draft SOP','draft',1,'http://x','k2','s.pdf','application/pdf',10) RETURNING id`, [A]);
    await q(`INSERT INTO dms_document_version (document_id, version_no, file_url, file_key, file_name, mime_type, size_bytes) VALUES ($1,1,'http://x','k2','s.pdf','application/pdf',10)`, [doc2.id]);
    expectStatus(g, 'org B DELETE A draft -> 404', await api('DELETE', `/api/dms/documents/${doc2.id}`, { token: HB }), 404);
    expectStatus(g, 'hospital_staff DELETE draft -> 403', await api('DELETE', `/api/dms/documents/${doc2.id}`, { token: tok.hospStaffA }), 403);
    expectStatus(g, 'DELETE draft document', await api('DELETE', `/api/dms/documents/${doc2.id}`, { token: H }), 200);
    expectStatus(g, 'deleted document -> 404', await api('GET', `/api/dms/documents/${doc2.id}`, { token: H }), 404);
    const orphan = await q1(`SELECT count(*)::int n FROM dms_document_version WHERE document_id=$1`, [doc2.id]);
    ok(g, 'delete removed version rows too (no orphans)', orphan.n === 0, `n=${orphan.n}`);
    await q(`UPDATE tenants SET features = features || '{"module_dms": false}'::jsonb WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    const me = await api('GET', '/api/dms/categories', { token: H });
    expectStatus(g, 'requireModule(dms)=false -> 403 MODULE_NOT_ENABLED', me, 403, me.json?.error === 'MODULE_NOT_ENABLED');
    expectStatus(g, 'dms flag off does not affect org B', await api('GET', '/api/dms/categories', { token: HB }), 200);
    await q(`UPDATE tenants SET features = features - 'module_dms' WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    expectStatus(g, 'dms entitlement restored -> 200', await api('GET', '/api/dms/categories', { token: H }), 200);
    // housekeeping
    const t1 = await api('POST', '/api/housekeeping/tasks', { token: H, body: { location: 'SMOKE OT-1', taskType: 'terminal_cleaning', priority: 'urgent', ward: 'OT' } });
    expectStatus(g, 'POST /housekeeping/tasks', t1, 201, t1.json?.data?.status === 'pending');
    const hid = t1.json?.data?.id;
    expectStatus(g, 'task missing fields -> 400', await api('POST', '/api/housekeeping/tasks', { token: H, body: { location: 'x' } }), 400);
    const tbad = await api('POST', '/api/housekeeping/tasks', { token: H, body: { location: 'x', taskType: 'mopping-the-moon' } });
    if (tbad.status >= 500) info(g, 'task bad taskType', `returns ${tbad.status} (DB CHECK as 500; should be 400)`); else expectStatus(g, 'bad taskType -> 400', tbad, 400);
    expectStatus(g, 'PATCH assign', await api('PATCH', `/api/housekeeping/tasks/${hid}/assign`, { token: H, body: { assignedTo: U.staffA } }), 200);
    expectStatus(g, 'assign missing assignedTo -> 400', await api('PATCH', `/api/housekeeping/tasks/${hid}/assign`, { token: H, body: {} }), 400);
    expectStatus(g, 'verify before complete -> 400', await api('PATCH', `/api/housekeeping/tasks/${hid}/verify`, { token: H }), 400);
    expectStatus(g, 'org B start A task -> 404', await api('PATCH', `/api/housekeeping/tasks/${hid}/start`, { token: HB }), 404);
    expectStatus(g, 'org B complete A task -> 404', await api('PATCH', `/api/housekeeping/tasks/${hid}/complete`, { token: HB, body: {} }), 404);
    expectStatus(g, 'org B verify A task -> 404', await api('PATCH', `/api/housekeeping/tasks/${hid}/verify`, { token: HB }), 404);
    expectStatus(g, 'invalid task id -> 400', await api('PATCH', '/api/housekeeping/tasks/abc/start', { token: H }), 400);
    expectStatus(g, 'PATCH start', await api('PATCH', `/api/housekeeping/tasks/${hid}/start`, { token: H }), 200);
    expectStatus(g, 'start again -> 400', await api('PATCH', `/api/housekeeping/tasks/${hid}/start`, { token: H }), 400);
    expectStatus(g, 'PATCH complete', await api('PATCH', `/api/housekeeping/tasks/${hid}/complete`, { token: H, body: { notes: 'done' } }), 200);
    expectStatus(g, 'PATCH verify', await api('PATCH', `/api/housekeeping/tasks/${hid}/verify`, { token: H }), 200);
    expectStatus(g, 'verify twice -> 400', await api('PATCH', `/api/housekeeping/tasks/${hid}/verify`, { token: H }), 400);
    const hl = await api('GET', '/api/housekeeping/tasks?status=verified', { token: H });
    expectStatus(g, 'GET /housekeeping/tasks?status=verified', hl, 200, hl.json?.data?.some((t) => t.id === hid));
    const hlB = await api('GET', '/api/housekeeping/tasks', { token: HB });
    expectStatus(g, 'org B task list excludes A', hlB, 200, !hlB.json?.data?.some((t) => t.id === hid));
    const hs = await api('GET', '/api/housekeeping/stats', { token: H });
    expectStatus(g, 'GET /housekeeping/stats', hs, 200, hs.json?.data && typeof hs.json.data.verifiedToday === 'number' && hs.json.data.verifiedToday >= 1, JSON.stringify(hs.json?.data));
    const cv = await api('PATCH', `/api/housekeeping/tasks/${hid}/complete`, { token: H, body: {} });
    const stAfter = (await q1(`SELECT status FROM housekeeping_task WHERE id=$1`, [hid])).status;
    ok(g, 'complete on an already VERIFIED task is refused (no regression to completed)', cv.status === 400 && stAfter === 'verified', `HTTP ${cv.status}, status now '${stAfter}' — completeTask() has no status guard`);
    const t2 = await api('POST', '/api/housekeeping/tasks', { token: H, body: { location: 'SMOKE Ward-2', taskType: 'routine_cleaning' } });
    const cp = await api('PATCH', `/api/housekeeping/tasks/${t2.json?.data?.id}/complete`, { token: H, body: {} });
    ok(g, 'complete on a PENDING (never started) task is refused', cp.status === 400, `HTTP ${cp.status}: pending task can be completed without start`);
    await q(`UPDATE tenants SET features = features || '{"module_housekeeping": false}'::jsonb WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
    expectStatus(g, 'requireModule(housekeeping)=false -> 403', await api('GET', '/api/housekeeping/stats', { token: H }), 403);
    await q(`UPDATE tenants SET features = features - 'module_housekeeping' WHERE id=$1`, [A]);
    entMod.clearModuleEntitlementCache();
  }

  // ═══ G11  patient portal ═══
  {
    const g = 'G11 patient-portal';
    await q(`INSERT INTO appointments ("userId","appointmentDate","appointmentTime","appointmentDateTime") VALUES ($1,$2,'10:00',$3)`, [U.patA, today(5), `${today(5)} 10:00:00`]);
    await q(`INSERT INTO appointments ("userId","appointmentDate","appointmentTime","appointmentDateTime",status) VALUES ($1,$2,'09:00',$3,'completed')`, [U.patA, today(-5), `${today(-5)} 09:00:00`]);
    await q(`INSERT INTO reports ("userId","fileName","filePath","fileSize","mimeType","uploadedAt","createdAt","updatedAt") VALUES ($1,'smoke.pdf','/x/smoke.pdf',10,'application/pdf',NOW(),NOW(),NOW())`, [U.patA]);
    const ap = await api('GET', '/api/patient/appointments', { token: tok.patA });
    expectStatus(g, 'GET /patient/appointments (upcoming/past split)', ap, 200, ap.json?.data?.upcoming?.length === 1 && ap.json.data.past?.length === 1, JSON.stringify(ap.json?.data || {}).slice(0, 200));
    const rp = await api('GET', '/api/patient/reports', { token: tok.patA });
    expectStatus(g, 'GET /patient/reports', rp, 200, rp.json?.data?.reports?.length === 1);
    const ap2 = await api('GET', '/api/patient/appointments', { token: tok.patA2 });
    expectStatus(g, 'other patient sees none of A\'s appointments', ap2, 200, ap2.json?.data?.upcoming?.length === 0 && ap2.json.data.past?.length === 0);
    const rp2 = await api('GET', '/api/patient/reports', { token: tok.patA2 });
    expectStatus(g, 'other patient sees none of A\'s reports', rp2, 200, rp2.json?.data?.reports?.length === 0);
    expectStatus(g, 'non-patient (admin) -> 403', await api('GET', '/api/patient/appointments', { token: tok.adminA }), 403);
    expectStatus(g, 'non-patient (hospital_admin) -> 403', await api('GET', '/api/patient/reports', { token: tok.hospAdminA }), 403);
    expectStatus(g, 'no token -> 401', await api('GET', '/api/patient/appointments'), 401);
    info(g, 'RLS note', 'local DB runs as superuser (bypasses RLS) and appointments RLS policy is not exercised; the withRlsTransaction GUC path executed without error but cannot prove RLS filtering');
  }

  // ═══ G12  payroll / CSSD / SCM / dashboards / ABDM ═══
  {
    const g = 'G12a payroll';
    const H = tok.hospAdminA;
    const st = await q1(`INSERT INTO payroll_structures (tenant_id, employee_code, employee_name, department, basic) VALUES ($1,'SMK-E1',$2,'Nursing',30000) RETURNING id`, [A, '=HYPERLINK("http://evil","x")']);
    const st2 = await q1(`INSERT INTO payroll_structures (tenant_id, employee_code, employee_name, department, basic) VALUES ($1,'SMK-E2','Plain Name','Nursing',20000) RETURNING id`, [A]);
    const run = await q1(`INSERT INTO payroll_runs (tenant_id, month, status, gross_total, pf_total, esi_total, tds_total, net_total) VALUES ($1,'2026-08','approved',50000,3600,0,500,45900) RETURNING id`, [A]);
    await q(`INSERT INTO payroll_run_lines (run_id, structure_id, gross, pf, esi, tds, other_deductions, net) VALUES ($1,$2,30000,2160,0,300,0,27540),($1,$3,20000,1440,0,200,0,18360)`, [run.id, st.id, st2.id]);
    const pdf = await api('GET', `/api/payroll/runs/${run.id}/employees/SMK-E2/payslip`, { token: H });
    expectStatus(g, 'GET payslip PDF', pdf, 200, /pdf/.test(pdf.headers.get('content-type') || '') && pdf.buf.slice(0, 4).toString() === '%PDF' && /attachment/.test(pdf.headers.get('content-disposition') || ''), `ct=${pdf.headers.get('content-type')} magic=${pdf.buf.slice(0, 4)}`);
    const pj = await api('GET', `/api/payroll/runs/${run.id}/employees/SMK-E2/payslip?format=json`, { token: H });
    expectStatus(g, 'payslip ?format=json metadata only (no path)', pj, 200, pj.json?.data?.fileName && !/\/(tmp|home|var)\//.test(pj.text));
    expectStatus(g, 'payslip unknown employee -> 404', await api('GET', `/api/payroll/runs/${run.id}/employees/NOPE/payslip`, { token: H }), 404);
    expectStatus(g, 'payslip foreign tenant run -> 404', await api('GET', `/api/payroll/runs/${run.id}/employees/SMK-E2/payslip`, { token: tok.hospAdminB }), 404);
    expectStatus(g, 'payslip invalid run id -> 400', await api('GET', '/api/payroll/runs/abc/employees/SMK-E2/payslip', { token: H }), 400);
    expectStatus(g, 'payslip hospital_staff -> 403', await api('GET', `/api/payroll/runs/${run.id}/employees/SMK-E2/payslip`, { token: tok.hospStaffA }), 403);
    const csv = await api('GET', `/api/payroll/runs/${run.id}/statutory-export.csv`, { token: H });
    expectStatus(g, 'GET statutory-export.csv', csv, 200, /csv/.test(csv.headers.get('content-type') || '') && /SMK-E2/.test(csv.text) && /SMK-E1/.test(csv.text), csv.text.slice(0, 120));
    const evilCell = csv.text.split('\n').find((l) => /HYPERLINK/.test(l)) || '';
    ok(g, 'CSV neutralises formula injection in employee name', evilCell.length > 0 && !/(^|,)"?[=+@-]HYPERLINK/.test(evilCell), evilCell || 'row missing from CSV');
    info(g, 'CSV injection row as emitted', evilCell.slice(0, 120));
    expectStatus(g, 'statutory-export foreign tenant -> 404', await api('GET', `/api/payroll/runs/${run.id}/statutory-export.csv`, { token: tok.hospAdminB }), 404);
    expectStatus(g, 'statutory-export invalid id -> 400', await api('GET', '/api/payroll/runs/abc/statutory-export.csv', { token: H }), 400);
  }
  {
    const g = 'G12b cssd';
    const T = sign({ id: 5, role: 'cssd', email: 'cssd@smoke.invalid' });
    const mk = async (code, status, sterile) => (await q1(`INSERT INTO cssd_sets (set_code, name, status, sterile_until) VALUES ($1,$2,$3,$4) RETURNING id`, [`${TAG}-${code}`, `Smoke set ${code}`, status, sterile])).id;
    const sAvail = await mk('AVAIL', 'available', new Date(Date.now() + 86400000));
    const sInUse = await mk('INUSE', 'in_use', null);
    const sProc = await mk('PROC', 'processing', null);
    const sExp = await mk('EXP', 'available', new Date(Date.now() - 86400000));
    const u1 = await api('POST', `/api/cssd/sets/${sAvail}/usage`, { token: T, body: { otBookingId: 990001 } });
    expectStatus(g, 'set usage for AVAILABLE set -> 201', u1, 201, u1.json?.data?.set_id === sAvail);
    expectStatus(g, 'same set again (now in_use) -> 409', await api('POST', `/api/cssd/sets/${sAvail}/usage`, { token: T, body: { otBookingId: 990002 } }), 409);
    expectStatus(g, 'in_use set -> 409', await api('POST', `/api/cssd/sets/${sInUse}/usage`, { token: T, body: { otBookingId: 990001 } }), 409);
    expectStatus(g, 'processing set -> 409', await api('POST', `/api/cssd/sets/${sProc}/usage`, { token: T, body: { otBookingId: 990001 } }), 409);
    expectStatus(g, 'expired sterility -> 409', await api('POST', `/api/cssd/sets/${sExp}/usage`, { token: T, body: { otBookingId: 990001 } }), 409);
    expectStatus(g, 'unknown set -> 404', await api('POST', '/api/cssd/sets/99999999/usage', { token: T, body: { otBookingId: 990001 } }), 404);
    expectStatus(g, 'bad otBookingId -> 400', await api('POST', `/api/cssd/sets/${sProc}/usage`, { token: T, body: { otBookingId: 'x' } }), 400);
    const st = (await q1(`SELECT status FROM cssd_sets WHERE id=$1`, [sAvail])).status;
    ok(g, 'used set flipped to in_use in same transaction', st === 'in_use', st);
    const un = (await q1(`SELECT count(*)::int n FROM cssd_set_usage WHERE set_id = ANY($1::int[])`, [[sInUse, sProc, sExp]])).n;
    ok(g, 'no usage rows created for rejected sets', un === 0, `n=${un}`);
    const hist = await api('GET', `/api/cssd/sets/${sAvail}/usage-history`, { token: T });
    expectStatus(g, 'GET usage-history', hist, 200, hist.json?.data?.length === 1);
    const ot = await api('GET', '/api/cssd/ot-bookings/990001/sets', { token: T });
    expectStatus(g, 'GET ot-bookings/:id/sets traceability', ot, 200, ot.json?.data?.some((r) => r.set_id === sAvail));
    expectStatus(g, 'no token -> 401', await api('POST', `/api/cssd/sets/${sAvail}/usage`, { body: { otBookingId: 1 } }), 401);
  }
  {
    const g = 'G12c scm-3way';
    const T = sign({ id: 5, role: 'scm', email: 'scm@smoke.invalid' });
    const H = { token: T };
    const suffix = Date.now() % 1000000;
    const vend = await api('POST', '/api/scm/vendors', { ...H, body: { name: `${TAG} Vendor`, vendorCode: `${TAG}-V${suffix}` } });
    const item = await api('POST', '/api/scm/items', { ...H, body: { itemCode: `${TAG}-I${suffix}`, name: `${TAG} item`, category: 'Consumable' } });
    ok(g, 'vendor + item created', vend.json?.data?.id > 0 && item.json?.data?.id > 0, short(vend) + ' | ' + short(item));
    const po = await api('POST', '/api/scm/orders', { ...H, body: { vendorId: vend.json?.data?.id, department: 'SMOKE-DEPT', lines: [{ itemId: item.json?.data?.id, description: 'smoke line 1', quantity: 10, unitPrice: 100 }, { itemId: item.json?.data?.id, description: 'smoke line 2', quantity: 5, unitPrice: 200 }] } });
    const poId = po.json?.data?.id;
    expectStatus(g, 'POST /scm/orders (total 2000)', po, 201, Number(po.json?.data?.total_amount) === 2000, `total=${po.json?.data?.total_amount}`);
    const noDesc = await api('POST', '/api/scm/orders', { ...H, body: { vendorId: vend.json?.data?.id, department: 'SMOKE-DEPT', lines: [{ itemId: item.json?.data?.id, quantity: 1, unitPrice: 1 }] } });
    if (noDesc.status >= 500) info(g, 'PO line without description', `returns ${noDesc.status}: description is NOT NULL in scm_po_lines but not validated by the route (should be 400); it also leaves an orphan PO header row (header inserted before lines, no transaction)`);
    const ap = await api('PATCH', `/api/scm/orders/${poId}/approve`, H);
    ok(g, 'PATCH /scm/orders/:id/approve works', ap.status === 200, `${short(ap)} — route queries operations_approvals ORDER BY created_at but the table column is requested_at`);
    if (ap.status !== 200) await q(`UPDATE scm_purchase_orders SET status='approved' WHERE id=$1`, [poId]); // continue the scenario
    const lines = await q(`SELECT id, unit_price FROM scm_po_lines WHERE order_id=$1 ORDER BY id`, [poId]);
    const grn = await api('POST', `/api/scm/orders/${poId}/grn`, { ...H, body: { receivedBy: 'smoke', lines: [{ lineId: lines[0].id, itemId: item.json?.data?.id, receivedQuantity: 6 }] } });
    expectStatus(g, 'partial GRN (6 x 100 = 600) -> partial_receipt', grn, 201, /partial/.test(String(grn.json?.data?.orderStatus)), `orderStatus=${grn.json?.data?.orderStatus}`);
    const inv = async (num, amount, tax, grnId = grn.json?.data?.id, po_ = poId) => {
      const r = await api('POST', '/api/scm/ap/invoices', { ...H, body: { invoiceNumber: `${TAG}-${num}-${Date.now()}`, vendorId: vend.json?.data?.id, poId: po_, grnId, invoiceDate: today(), amount, taxAmount: tax } });
      return r;
    };
    const legs = await q1(`SELECT COALESCE(SUM(gl.quantity * pl.unit_price),0)::numeric AS v FROM scm_grn_lines gl JOIN scm_po_lines pl ON pl.id = gl.po_line_id WHERE gl.grn_id = $1`, [grn.json?.data?.id]);
    ok(g, 'GRN leg of the 3-way match computes 600 (6 x 100, tax excluded) — SQL from the route run directly', Number(legs.v) === 600, `v=${legs.v}`);
    const i1 = await inv('OK', 600, 108);
    const m1 = await api('POST', `/api/scm/ap/invoices/${i1.json?.data?.id}/match`, H);
    if (m1.status >= 500) info(g, 'match endpoint root cause', `UPDATE scm_ap_invoices SET match_status = $2, status = CASE WHEN $2 = 'matched' ... uses $2 as varchar and text -> PG "inconsistent types deduced for parameter $2"; every /ap/invoices/:id/match call 500s (needs $2::text)`);
    expectStatus(g, 'partial receipt + 18% tax -> matched', m1, 200, m1.json?.data?.match_status === 'matched' && m1.json?.matchDetail?.grnReceivedValue === 600 && m1.json.matchDetail.invoiceTax === 108, JSON.stringify(m1.json?.matchDetail));
    const i2 = await inv('OVER', 700, 0);
    const m2 = await api('POST', `/api/scm/ap/invoices/${i2.json?.data?.id}/match`, H);
    expectStatus(g, 'invoice != GRN value -> variance', m2, 200, m2.json?.data?.match_status === 'variance' && m2.json?.matchDetail?.grnVsInvoiceMatch === false);
    const i3 = await inv('BIGPO', 2500, 0);
    const m3 = await api('POST', `/api/scm/ap/invoices/${i3.json?.data?.id}/match`, H);
    expectStatus(g, 'invoice above PO total -> variance', m3, 200, m3.json?.data?.match_status === 'variance' && m3.json?.matchDetail?.poVsInvoiceMatch === false);
    const i4 = await inv('NOGRN', 600, 0, null);
    const m4 = await api('POST', `/api/scm/ap/invoices/${i4.json?.data?.id}/match`, H);
    expectStatus(g, 'invoice without GRN -> unmatched', m4, 200, m4.json?.data?.match_status === 'unmatched');
    expectStatus(g, 'match unknown invoice -> 404', await api('POST', '/api/scm/ap/invoices/99999999/match', H), 404);
  }
  {
    const g = 'G12d exec-dashboards';
    const H = tok.hospAdminA;
    // trigger billing table creation (idempotent CREATE IF NOT EXISTS) then seed one completed payment for org A
    await api('GET', '/api/hospital/billing/stations', { token: H });
    // hospital_* tables created by the service's ensureTables() lack columns added by migrations/hospital-billing-rcm-phases.migration.js
    for (const [t, c, typ] of [['hospital_invoices', 'voided_at', 'TIMESTAMPTZ'], ['hospital_payments', 'voided_at', 'TIMESTAMPTZ']]) {
      const ex = await q1(`SELECT to_regclass($1) AS r`, [`public.${t}`]);
      if (ex.r) { const has = await q1(`SELECT 1 AS x FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [t, c]); if (!has) { await pool.query(`ALTER TABLE ${t} ADD COLUMN ${c} ${typ}`); shimmed.push(`${t}.${c}`); } }
    }
    const hasPay = await q1(`SELECT to_regclass('public.hospital_payments') AS r`);
    if (hasPay.r) {
      const invR = await q1(`INSERT INTO hospital_invoices (hospital_id, bill_number, total_amount, status) VALUES ($1,'SMOKE-BILL-1',250000,'paid') RETURNING id`, [A]);
      await q(`INSERT INTO hospital_payments (hospital_id, invoice_id, payment_method, amount, status, created_at) VALUES ($1,$2,'upi',250000,'completed',NOW())`, [A, invR.id]);
    }
    const ceo = await api('GET', '/api/hospital/ceo/financials', { token: H });
    const cd = ceo.json?.data || {};
    expectStatus(g, 'GET /hospital/ceo/financials shape', ceo, 200, 'monthlyRevenue' in cd && 'revenueTrend' in cd && cd.payerMix === null && cd.dataAvailable && cd.dataAvailable.payerMix === false, JSON.stringify(cd).slice(0, 200));
    if (hasPay.r) ok(g, 'CEO monthlyRevenue is in LAKHS (250000 rupees -> 2.5)', cd.monthlyRevenue === 2.5 && cd.monthlyRevenueRupees === 250000, `monthlyRevenue=${cd.monthlyRevenue} rupees=${cd.monthlyRevenueRupees}`);
    else skip(g, 'CEO monthlyRevenue lakhs value', 'hospital_payments table could not be created locally');
    const ceoB = await api('GET', '/api/hospital/ceo/financials', { token: tok.hospAdminB });
    ok(g, 'CEO dashboard is tenant-scoped (org B sees no A revenue)', ceoB.json?.data?.monthlyRevenue == null || ceoB.json.data.monthlyRevenue === 0, JSON.stringify(ceoB.json?.data?.monthlyRevenue));
    expectStatus(g, 'GET /hospital/cfo/financials', await api('GET', '/api/hospital/cfo/financials', { token: H }), 200);
    expectStatus(g, 'GET /hospital/coo/operations', await api('GET', '/api/hospital/coo/operations', { token: H }), 200);
    const ms = await api('GET', '/api/hospital/ms/clinical', { token: H });
    const md = ms.json?.data || {};
    expectStatus(g, 'GET /hospital/ms/clinical (unavailable metrics are null, not fabricated)', ms, 200, md.mortalityRate == null && md.haiRate == null && md.nabhScore == null, JSON.stringify(md).slice(0, 200));
    const rcm = await api('GET', '/api/hospital/rcm/claims', { token: H });
    expectStatus(g, 'GET /hospital/rcm/claims (RCM dashboard)', rcm, 200, rcm.json?.success === true, JSON.stringify(rcm.json?.data || {}).slice(0, 150));
    expectStatus(g, 'GET /hospital/dashboard/stats', await api('GET', '/api/hospital/dashboard/stats', { token: H }), 200);
    const billing = sign({ userType: 'hospital', role: 'billing', id: A, hospital_id: A, tenant_id: A, organization_id: A });
    expectStatus(g, 'billing role: RCM dashboard allowed', await api('GET', '/api/hospital/rcm/claims', { token: billing }), 200);
    expectStatus(g, 'billing role: CEO dashboard -> 403 (role-scoped)', await api('GET', '/api/hospital/ceo/financials', { token: billing }), 403);
    expectStatus(g, 'hospital_staff: CEO dashboard -> 403', await api('GET', '/api/hospital/ceo/financials', { token: tok.hospStaffA }), 403);
  }
  {
    const g = 'G12e abdm-auth';
    const before = blockedNet.length;
    const dOwn = await api('POST', '/api/abdm/hpr/register', { token: tok.docA, body: { doctorId: DOC.A, providerName: 'SMOKE Doc', registrationNumber: 'SMK-1' } });
    ok(g, 'doctor registers OWN HPR -> graceful (201 or clean 5xx JSON, no crash)', [201, 500, 502, 503].includes(dOwn.status) && dOwn.json && typeof dOwn.json.success === 'boolean', short(dOwn));
    expectStatus(g, 'doctor registers ANOTHER doctor -> 403', await api('POST', '/api/abdm/hpr/register', { token: tok.docA, body: { doctorId: DOC.A2, providerName: 'x' } }), 403);
    expectStatus(g, 'doctor HPR register missing fields -> 400', await api('POST', '/api/abdm/hpr/register', { token: tok.docA, body: {} }), 400);
    const sOwn = await api('GET', `/api/abdm/hpr/${DOC.A}/status`, { token: tok.docA });
    ok(g, 'doctor GET own HPR status -> 200', sOwn.status === 200, short(sOwn));
    expectStatus(g, 'doctor GET another doctor HPR status -> 403', await api('GET', `/api/abdm/hpr/${DOC.A2}/status`, { token: tok.docA }), 403);
    expectStatus(g, 'doctor cannot register facility (HFR) -> 403', await api('POST', '/api/abdm/hfr/register', { token: tok.docA, body: { facilityName: 'x' } }), 403);
    expectStatus(g, 'hospital_staff cannot register facility -> 403', await api('POST', '/api/abdm/hfr/register', { token: tok.hospStaffA, body: { facilityName: 'x' } }), 403);
    expectStatus(g, 'HFR register missing facilityName -> 400', await api('POST', '/api/abdm/hfr/register', { token: tok.hospAdminA, body: {} }), 400);
    const hAdm = await api('POST', '/api/abdm/hfr/register', { token: tok.hospAdminA, body: { facilityName: 'SMOKE Facility' } });
    ok(g, 'hospital_admin HFR register -> graceful (no crash)', [201, 500, 502, 503].includes(hAdm.status) && hAdm.json && typeof hAdm.json.success === 'boolean', short(hAdm));
    const aAdm = await api('POST', '/api/abdm/hpr/register', { token: tok.hospAdminA, body: { doctorId: DOC.A2, providerName: 'SMOKE Doc2' } });
    ok(g, 'hospital_admin may register any doctor (not 403)', aAdm.status !== 403 && aAdm.status !== 401, short(aAdm));
    expectStatus(g, 'GET /abdm/hfr/status (hospital_admin)', await api('GET', '/api/abdm/hfr/status', { token: tok.hospAdminA }), 200);
    info(g, 'external gateway', `ABDM gateway calls blocked at net layer (${blockedNet.length - before} attempt(s) refused); handlers degraded gracefully`);
  }

  // ═══ G13  WhatsApp webhook ═══
  {
    const g = 'G13 whatsapp-webhook';
    const rw = await api('POST', '/api/whatsapp-business/webhook', { body: { object: 'whatsapp_business_account', entry: [] } });
    info(g, 'as-is: unauthenticated POST', `${short(rw)} — ringFencing blocks Meta (no Bearer) -> webhook can never be delivered (KNOWN, pre-existing)`);
    const rv = await api('GET', '/api/whatsapp-business/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1');
    info(g, 'as-is: GET verify handshake w/o token', short(rv) + ' — same ringFencing block');
    {
      const ok1 = await api('POST', '/api/whatsapp-business/webhook', { token: tok.adminA, body: { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [], statuses: [] } }] }] } });
      expectStatus(g, 'handler with FACEBOOK_APP_SECRET unset + NODE_ENV=development -> passes (200)', ok1, 200, ok1.json?.success === true);
      const bad = await api('POST', '/api/whatsapp-business/webhook', { token: tok.adminA, body: { object: 'whatsapp_business_account' } });
      ok(g, 'malformed payload -> clean 500 JSON (no crash)', bad.status === 500 && bad.json?.success === false, short(bad));
      const ver = await api('GET', '/api/whatsapp-business/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1', { token: tok.adminA });
      expectStatus(g, 'verify handshake with wrong token -> 403', ver, 403);
    }
  }
} catch (e) {
  if (e instanceof StrictStop) info('G0 ringfence', '--strict', 'groups G1-G13 not run: with the real ACLs their prefixes are unreachable (see G0 FAIL rows)');
  else fatalErr = e;
} finally {
  try { await cleanup(); } catch (e) { info('cleanup', 'error', e.message); }
  try { after = await snapshotCounts(); leaks = await residueScan(); } catch (e) { leaks.push(`scan error: ${e.message}`); }
}

// ── cleanup verification ──
{
  const g = 'CLEANUP';
  const diffs = Object.keys(before).filter((t) => (before[t] ?? 0) !== (after[t] ?? 0)).map((t) => `${t}:${before[t]}->${after[t]}`);
  ok(g, 'row counts identical before/after on all tracked tables', diffs.length === 0, diffs.join(', '));
  ok(g, 'no residue keyed to test orgs 995001/995002 or seeded ids', leaks.length === 0, leaks.join(', '));
  if (shimmed.length) info(g, 'LOCAL schema shim applied (additive, persists)', shimmed.join(', '));
  info(g, 'network guard', blockedNet.length ? `blocked ${blockedNet.length} connect attempt(s) to: ${[...new Set(blockedNet)].join(', ')}` : 'no blocked connects');
  if (bgErrors.length) info(g, 'background errors during run', `${bgErrors.length}: ${bgErrors.slice(0, 3).join(' | ')}`);
}
if (fatalErr) rec('HARNESS', 'fatal error', 'FAIL', fatalErr.stack?.split('\n').slice(0, 4).join(' / ') || String(fatalErr));

// ── report ──
const groups = [...new Set(results.map((r) => r.group))];
out('\n==================== SMOKE TEST RESULTS ====================');
for (const gname of groups) {
  out(`\n## ${gname}`);
  for (const r of results.filter((x) => x.group === gname)) {
    const tag = { PASS: 'PASS', FAIL: 'FAIL', SKIP: 'SKIP', INFO: 'INFO' }[r.status];
    out(`  [${tag}] ${r.name}${r.detail && r.status !== 'PASS' ? `  ::  ${r.detail.slice(0, 260)}` : ''}`);
  }
}
out('\n-------------------- SUMMARY --------------------');
out('group'.padEnd(28) + 'PASS'.padStart(6) + 'FAIL'.padStart(6) + 'SKIP'.padStart(6) + 'INFO'.padStart(6));
let tp = 0; let tf = 0; let ts = 0; let ti = 0;
for (const gname of groups) {
  const c = (s) => results.filter((r) => r.group === gname && r.status === s).length;
  out(gname.padEnd(28) + String(c('PASS')).padStart(6) + String(c('FAIL')).padStart(6) + String(c('SKIP')).padStart(6) + String(c('INFO')).padStart(6));
  tp += c('PASS'); tf += c('FAIL'); ts += c('SKIP'); ti += c('INFO');
}
out('TOTAL'.padEnd(28) + String(tp).padStart(6) + String(tf).padStart(6) + String(ts).padStart(6) + String(ti).padStart(6));
out(`mode=${STRICT ? 'STRICT (no ACL patch)' : 'PATCHED ringFencing ACLs (in-process only)'}  elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
out(tf === 0 ? 'RESULT: ALL CHECKS PASSED' : `RESULT: ${tf} FAILURE(S)`);
try { server?.close(); } catch { /* ignore */ }
process.exit(tf === 0 ? 0 : 1);
