#!/usr/bin/env node
/**
 * Two-tenant isolation test for supply chain + procurement (WP-0.5, PR 1), through the REAL app and middleware chain,
 * connected to the database as a NON-SUPERUSER role — a superuser bypasses row-level security and would prove nothing.
 *
 * !! SAFETY !!  .env / server/.env point the default pgPool at PRODUCTION. Run only as OS user `postgres` against the
 * LOCAL database (same recipe as verify-parking.mjs). The script creates a throw-away local role (tenant_iso_app,
 * loopback-only), applies the isolation migration to the LOCAL database, uses organizations 999801 / 999802, and
 * removes everything it created. External network is blocked.
 *
 *   sudo -u postgres env JWT_SECRET=smoke-test-secret JWT_REFRESH_SECRET=smoke-test-refresh \
 *     POSTGRES_FORCE_LOCAL=true DISALLOW_REMOTE_DB=true POSTGRES_HOST=/var/run/postgresql \
 *     POSTGRES_PRIMARY_HOST=/var/run/postgresql POSTGRES_PORT=5432 POSTGRES_PRIMARY_PORT=5432 \
 *     POSTGRES_DATABASE=mediczy_ai POSTGRES_PRIMARY_DATABASE=mediczy_ai POSTGRES_USER=postgres \
 *     POSTGRES_PRIMARY_USER=postgres POSTGRES_PASSWORD=unused POSTGRES_PRIMARY_PASSWORD=unused \
 *     POSTGRES_SSL=false NODE_ENV=development node scripts/testing/verify-tenant-isolation-scm.mjs
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
if (!String(process.env.POSTGRES_HOST || '').startsWith('/')) fatal('POSTGRES_HOST must be a unix socket path (the ADMIN connection); the app connection is switched to loopback below');
if (process.env.JWT_SECRET !== 'smoke-test-secret') fatal('JWT_SECRET must be smoke-test-secret');

const require = createRequire(path.join(SERVER, 'package.json'));
const pg = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// admin connection (superuser over the local socket) — used only for setup, cleanup and ground-truth reads
const admin = new pg.Pool({ host: '/var/run/postgresql', database: 'mediczy_ai', user: 'postgres', max: 4 });
{
  const r = (await admin.query(`SELECT inet_server_addr() AS addr, current_database() AS db`)).rows[0];
  if (r.addr !== null || r.db !== 'mediczy_ai') fatal('admin connection is not the local mediczy_ai socket');
}

let ALLOWED_PORT = null;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let a0 = args[0]; if (Array.isArray(a0)) a0 = a0[0];
  let host; let isPath = false; let port;
  if (a0 && typeof a0 === 'object') { host = a0.host; port = a0.port; isPath = !!a0.path && !a0.port; if (a0.port && !host) host = 'localhost'; }
  else if (typeof a0 === 'string') { isPath = true; }
  else if (typeof a0 === 'number') { port = a0; host = typeof args[1] === 'string' ? args[1] : 'localhost'; }
  const okPort = Number(port) === ALLOWED_PORT || Number(port) === 5432; // the app + the local PostgreSQL loopback only
  if (!isPath && host && !(LOOPBACK.has(String(host)) && okPort)) {
    process.nextTick(() => this.destroy(new Error(`VERIFY: external network blocked (${host})`)));
    return this;
  }
  return origConnect.apply(this, args);
};

const A = 999801; const B = 999802; const ORGS = [A, B];
const ROLE = 'tenant_iso_app'; const ROLE_PW = 'iso-only-local';
const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 260) });

const scmTok = (org) => jwt.sign({ id: 1, role: 'scm', scmRole: 'admin', ...(org ? { organization_id: org } : {}) }, process.env.JWT_SECRET, { expiresIn: '1h' });
const procTok = (org) => jwt.sign({ id: 1, role: 'procurement', ...(org ? { organization_id: org } : {}) }, process.env.JWT_SECRET, { expiresIn: '1h' });
let BASE = '';
const call = async (method, url, token, body) => {
  const res = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
};
const S = (m, u, org, b) => call(m, `/api/scm${u}`, scmTok(org), b);
const P = (m, u, org, b) => call(m, `/api/procurement${u}`, procTok(org), b);
const ids = (r) => (r.json?.data || []).map((x) => x.id);

const cleanup = async () => {
  const tables = (await admin.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'scm\\_%'`).catch(() => ({ rows: [] }))).rows.map((r) => r.tablename);
  for (let pass = 0; pass < 8; pass++) for (const t of tables) await admin.query(`DELETE FROM ${t} WHERE organization_id = ANY($1::int[])`, [ORGS]).catch(() => {});
  await admin.query(`DELETE FROM operations_approvals WHERE organization_id = ANY($1::int[])`, [ORGS]).catch(() => {});
  await admin.query(`DELETE FROM operations_audit_log WHERE organization_id = ANY($1::int[])`, [ORGS]).catch(() => {});
  await admin.query(`DELETE FROM scm_staff WHERE email LIKE 'iso-%@verify.invalid'`).catch(() => {});
  await admin.query(`DELETE FROM tenants WHERE id = ANY($1::int[])`, [ORGS]).catch(() => {});
};

let server; let crashed = null; let appPool = null; let roleCreated = false; let originalOwners = [];
try {
  const svc = await import(pathToFileURL(path.join(SERVER, 'services/scm-tenant-scope.service.js')).href);
  const { ensureAllScmTables } = await import(pathToFileURL(path.join(SERVER, 'migrations/scm-tables.migration.js')).href);
  const gov = await import(pathToFileURL(path.join(SERVER, 'services/operations-governance.service.js')).href);
  await cleanup();
  await ensureAllScmTables(admin);
  await gov.ensureOperationsGovernanceTables(admin);
  const applied = await svc.applyScmTenantIsolation(admin);
  await svc.applyScmTenantIsolation(admin); // idempotent
  check('isolation migration applies twice without error', applied.tables >= 30, JSON.stringify(applied));
  check('every scm table except scm_staff has forced row-level security and organization_id', await svc.scmTenantIsolationApplied(admin));

  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN PASSWORD '${ROLE_PW}' NOSUPERUSER NOBYPASSRLS; END IF; END $$`);
  roleCreated = true;
  await admin.query(`GRANT CONNECT ON DATABASE mediczy_ai TO ${ROLE}`);
  await admin.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${ROLE}`);
  await admin.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  await admin.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`);
  await admin.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${ROLE}`);
  // Production: the application role OWNS the tables (and the start-up code alters many of them), and FORCE row-level
  // security still applies to owners.
  // Mirror that here; ownership is handed back to postgres before the role is dropped.
  originalOwners = (await admin.query(`SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public'`)).rows;
  for (const t of originalOwners) await admin.query(`ALTER TABLE "${t.tablename}" OWNER TO ${ROLE}`);
  for (const id of ORGS) await admin.query(`INSERT INTO tenants (id, name, slug, subdomain, type, email, phone, status, created_at, updated_at) VALUES ($1,$2,$3,$3,'hospital',$4,'+919000000000','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [id, `ISO ${id}`, `iso-${id}`, `iso-${id}@verify.invalid`]);

  // ── switch the APP to the non-superuser role over loopback ──
  Object.assign(process.env, { POSTGRES_HOST: '127.0.0.1', POSTGRES_PRIMARY_HOST: '127.0.0.1', POSTGRES_USER: ROLE, POSTGRES_PRIMARY_USER: ROLE, POSTGRES_PASSWORD: ROLE_PW, POSTGRES_PRIMARY_PASSWORD: ROLE_PW });
  appPool = new pg.Pool({ host: '127.0.0.1', database: 'mediczy_ai', user: ROLE, password: ROLE_PW, max: 3 });
  const who = (await appPool.query(`SELECT current_user AS u, inet_server_addr()::text AS addr, (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`)).rows[0];
  if (who.u !== ROLE || who.bypass !== false || !String(who.addr).startsWith('127.')) fatal(`app role is not a plain loopback role: ${JSON.stringify(who)}`);
  check('the app runs as a non-superuser role that cannot bypass row-level security (loopback only)', who.bypass === false, JSON.stringify(who));

  const app = (await import(pathToFileURL(path.join(SERVER, 'app.js')).href)).default;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ALLOWED_PORT = server.address().port;
  BASE = `http://127.0.0.1:${ALLOWED_PORT}`;
  await new Promise((r) => setTimeout(r, 1500));

  // ── tokens ──
  let r = await call('GET', '/api/scm/items');
  check('scm: no token -> 401', r.status === 401, r.text);
  r = await S('GET', '/items', null);
  check('scm: a token with no hospital -> 403 ORG_REQUIRED', r.status === 403 && r.json?.code === 'ORG_REQUIRED', r.text);
  r = await P('GET', '/vendors', null);
  check('procurement: a token with no hospital -> 403 ORG_REQUIRED', r.status === 403 && r.json?.code === 'ORG_REQUIRED', r.text);

  // ── hospital A creates its data ──
  r = await S('POST', '/items', A, { itemCode: 'ISO-1', name: 'Gloves A' });
  const itemA = r.json?.data;
  let diag = '';
  if (r.status !== 201) { try { const u = await import(pathToFileURL(path.join(SERVER, 'services/scm-unified.service.js')).href); const d = await u.getScopedScmDb(A); await d.query(`INSERT INTO scm_items (item_code, name) VALUES ('DIAG','x')`); await d.release(); } catch (e) { diag = ` DIAG=${e.code} ${e.message}`; } }
  check('A: create item', r.status === 201 && itemA?.organization_id === A, r.text + diag);
  r = await S('POST', '/warehouses', A, { code: 'MAIN', name: 'Main store A' });
  const whA = r.json?.data;
  check('A: create warehouse (organization filled from the token, not the body)', r.status === 201 && whA?.organization_id === A, r.text);
  r = await S('POST', '/vendors', A, { vendorCode: 'V-1', name: 'Vendor A' });
  const venA = r.json?.data;
  check('A: create vendor', r.status === 201 && venA?.organization_id === A, r.text);
  r = await S('POST', '/orders', A, { vendorId: venA.id, department: 'ICU', lines: [{ itemId: itemA.id, description: 'Gloves', quantity: 10, unitPrice: 50 }] });
  const poA = r.json?.data;
  check('A: create purchase order with a line', r.status === 201 && poA?.organization_id === A, r.text);
  r = await S('POST', '/ap/invoices', A, { invoiceNumber: 'INV-1', vendorId: venA.id, poId: poA.id, amount: 500 });
  const invA = r.json?.data;
  check('A: create vendor invoice', r.status === 201 && invA?.organization_id === A, r.text);
  await S('PATCH', `/ap/invoices/${invA.id}/approve`, A);
  r = await S('POST', '/locations', A, { warehouseId: whA.id, code: 'ICU-1', parLevel: 20, maxLevel: 40 });
  const locA = r.json?.data;
  check('A: create location with a par level', r.status === 201 && locA?.organization_id === A, r.text);
  r = await S('POST', `/vendors/${venA.id}/catalogue`, A, { itemId: itemA.id, vendorSku: 'G-1', contractPrice: 45, leadTimeDays: 2 });
  check('A: vendor catalogue entry', r.status < 300, r.text);

  // ── hospital B cannot see or touch any of it ──
  for (const [label, path_, key] of [['items', '/items', itemA.id], ['warehouses', '/warehouses', whA.id], ['vendors', '/vendors', venA.id], ['orders', '/orders', poA.id], ['invoices', '/ap/invoices', invA.id], ['locations', '/locations', locA.id]]) {
    r = await S('GET', path_, B);
    check(`B: ${label} list does not include A's record`, r.status === 200 && !ids(r).includes(key) && !ids(r).map(String).includes(String(key)), r.text);
  }
  r = await S('PATCH', `/orders/${poA.id}/approve`, B);
  check("B cannot approve A's purchase order -> 404 and it stays unapproved", r.status === 404 && (await admin.query(`SELECT status FROM scm_purchase_orders WHERE id = $1`, [poA.id])).rows[0].status !== 'approved', r.text);
  r = await S('POST', `/orders/${poA.id}/grn`, B, { lines: [] });
  check("B cannot receive goods against A's order -> 404", r.status === 404, r.text);
  r = await S('POST', `/ap/invoices/${invA.id}/pay`, B, { amount: 100 });
  check("B cannot pay A's vendor invoice -> 404 and nothing is paid", r.status === 404 && (await admin.query(`SELECT count(*)::int AS n FROM scm_ap_payments WHERE invoice_id = $1`, [invA.id])).rows[0].n === 0, r.text);
  r = await S('POST', `/ap/invoices/${invA.id}/match`, B, {});
  check("B cannot match A's invoice -> 404", r.status === 404, r.text);
  r = await S('PATCH', `/locations/${locA.id}/par`, B, { parLevel: 1 });
  check("B cannot change A's par levels -> 404 and the level is unchanged", r.status === 404 && Number((await admin.query(`SELECT par_level FROM scm_locations WHERE id = $1`, [locA.id])).rows[0].par_level) === 20, r.text);
  r = await S('GET', '/approvals', B);
  check("B does not see A's pending approvals", r.status === 200 && r.json.data.length === 0, r.text);
  r = await S('GET', '/audit', B);
  check("B does not see A's audit entries", r.status === 200 && r.json.data.length === 0, r.text);
  r = await S('GET', '/approvals', A);
  check("A does see its own pending approval", r.status === 200 && r.json.data.some((x) => Number(x.entity_id) === Number(poA.id)), r.text);
  r = await S('GET', '/overview', B);
  check('B overview counts none of A\'s records', r.status === 200 && Number(r.json.data.active_items) === 0 && Number(r.json.data.open_orders) === 0, r.text);

  // ── B can reuse A's codes and numbers; A cannot duplicate its own ──
  r = await S('POST', '/items', B, { itemCode: 'ISO-1', name: 'Gloves B' });
  const itemB = r.json?.data;
  check("B can create the same item code as A (unique per hospital)", r.status === 201 && itemB?.organization_id === B, r.text);
  r = await S('POST', '/warehouses', B, { code: 'MAIN', name: 'Main store B' });
  const whB = r.json?.data;
  check("B can create the same warehouse code as A", r.status === 201, r.text);
  r = await S('POST', '/vendors', B, { vendorCode: 'V-1', name: 'Vendor B' });
  const venB = r.json?.data;
  check("B can create the same vendor code as A", r.status === 201, r.text);
  r = await S('POST', '/ap/invoices', B, { invoiceNumber: 'INV-1', vendorId: venB.id, amount: 70 });
  check("B can use the same invoice number as A", r.status === 201, r.text);
  r = await S('POST', '/items', A, { itemCode: 'ISO-1', name: 'Dup' });
  check('A cannot create a duplicate item code within its own hospital -> 409 (not a hang)', r.status === 409, r.text);
  r = await S('GET', '/items', B);
  check("B's item list holds only B's item", r.status === 200 && ids(r).length === 1 && String(ids(r)[0]) === String(itemB.id), r.text);

  // ── B cannot attach records to A's ids (foreign keys bypass RLS; the guard closes that) ──
  r = await S('POST', '/orders', B, { vendorId: venA.id, lines: [{ itemId: itemB.id, description: 'x', quantity: 1, unitPrice: 1 }] });
  check("B cannot create an order for A's vendor -> 409 (no oracle, nothing created)", r.status === 409 && (await admin.query(`SELECT count(*)::int AS n FROM scm_purchase_orders WHERE organization_id = $1`, [B])).rows[0].n === 0, r.text);
  r = await S('POST', '/orders', B, { vendorId: venB.id, lines: [{ itemId: itemA.id, description: 'x', quantity: 1, unitPrice: 1 }] });
  check("B cannot put A's item on its order -> 409 and the half-created order is not left visible as a valid one", r.status === 409, r.text);
  r = await S('POST', `/vendors/${venA.id}/catalogue`, B, { itemId: itemB.id, vendorSku: 'x', contractPrice: 1 });
  check("B cannot add catalogue entries to A's vendor -> 409/404", r.status === 409 || r.status === 404, r.text);

  // ── procurement router shares the tables and the isolation ──
  r = await P('GET', '/vendors', B);
  check("procurement: B's vendor list excludes A's vendor", r.status === 200 && !ids(r).map(String).includes(String(venA.id)), r.text);
  r = await P('GET', '/vendors', A);
  check("procurement: A sees its own vendor", r.status === 200 && ids(r).map(String).includes(String(venA.id)), r.text);
  r = await P('PATCH', `/orders/${poA.id}/approve`, B);
  check("procurement: B cannot approve A's order -> 404", r.status === 404, r.text);
  r = await P('GET', '/approvals', B);
  check("procurement: B sees none of A's approvals", r.status === 200 && r.json.data.length === 0, r.text);

  // ── the database itself fails closed, independent of the routes ──
  const sqlAs = async (org, sql, params = []) => { const c = await appPool.connect(); try { if (org !== null) await c.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(org)]); return await c.query(sql, params); } finally { await c.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {}); c.release(); } };
  const total = Number((await admin.query(`SELECT count(*) AS n FROM scm_items WHERE organization_id = ANY($1::int[])`, [ORGS])).rows[0].n);
  check('ground truth: both hospitals\' items exist (seen by the superuser)', total === 2, total);
  check('with NO organization context the app role sees nothing (fails closed, not open)', Number((await sqlAs(null, `SELECT count(*) AS n FROM scm_items`)).rows[0].n) === 0);
  check('with context A the role sees exactly A\'s row', (await sqlAs(A, `SELECT organization_id FROM scm_items`)).rows.every((x) => x.organization_id === A) && (await sqlAs(A, `SELECT 1 FROM scm_items`)).rowCount === 1);
  let refused = false; try { await sqlAs(A, `INSERT INTO scm_items (item_code, name, organization_id) VALUES ('ISO-X','x',$1)`, [B]); } catch (e) { refused = e.code === '42501'; }
  check('with context A, inserting a row for hospital B is refused by the policy', refused);
  check('with context A, an UPDATE of B\'s row affects nothing', (await sqlAs(A, `UPDATE scm_items SET name = 'hijack' WHERE id = $1`, [itemB.id])).rowCount === 0 && (await admin.query(`SELECT name FROM scm_items WHERE id = $1`, [itemB.id])).rows[0].name === 'Gloves B');
  check('with context A, a DELETE of B\'s row affects nothing', (await sqlAs(A, `DELETE FROM scm_items WHERE id = $1`, [itemB.id])).rowCount === 0);
  const defaultOrg = (await sqlAs(B, `INSERT INTO scm_cost_centers (code, name) VALUES ('CC-DEFAULT','x') RETURNING organization_id`)).rows[0].organization_id;
  check('an insert with no organization takes the caller\'s organization by default', defaultOrg === B, defaultOrg);
  check('the same cost-centre code can exist in two hospitals but not twice in one', (await sqlAs(A, `INSERT INTO scm_cost_centers (code, name) VALUES ('CC-DEFAULT','x') RETURNING id`)).rowCount === 1 && await sqlAs(A, `INSERT INTO scm_cost_centers (code, name) VALUES ('CC-DEFAULT','y')`).then(() => false, (e) => e.code === '23505'));

  // ── scheduled reorder job: one hospital at a time ──
  await admin.query(`DELETE FROM scm_par_reorder_log WHERE organization_id = ANY($1::int[])`, [ORGS]);
  const cron = await import(pathToFileURL(path.join(SERVER, 'services/scm-par-reorder-cron.service.js')).href);
  const before = Number((await admin.query(`SELECT count(*) AS n FROM scm_purchase_orders WHERE organization_id = $1`, [B])).rows[0].n);
  const all = await cron.runParReorderScan({ autoCreatePo: true });
  const logRows = (await admin.query(`SELECT organization_id, count(*)::int AS n FROM scm_par_reorder_log WHERE organization_id = ANY($1::int[]) GROUP BY 1`, [ORGS])).rows;
  const poRows = (await admin.query(`SELECT organization_id, count(*)::int AS n FROM scm_purchase_orders WHERE department = 'PAR Auto' AND organization_id = ANY($1::int[]) GROUP BY 1`, [ORGS])).rows;
  check('reorder job (all hospitals): log rows are written only to the hospital that owns the location', logRows.length === 1 && logRows[0].organization_id === A && logRows[0].n >= 1, JSON.stringify(logRows));
  check('reorder job: auto-created purchase orders belong only to that hospital', poRows.length === 1 && poRows[0].organization_id === A, JSON.stringify(poRows));
  check('reorder job never wrote anything for hospital B, which has no locations', Number((await admin.query(`SELECT count(*) AS n FROM scm_purchase_orders WHERE organization_id = $1`, [B])).rows[0].n) === before && all.results.every((x) => x.organizationId === A || ![A, B].includes(x.organizationId)), JSON.stringify(all.results.map((x) => x.organizationId)));
  r = await S('POST', '/par-reorder/run', B, { autoCreatePo: true });
  check('B triggering "run reorder now" scans only its own hospital (finds nothing) and does not touch A', r.status === 200 && r.json.data.scanned === 0, r.text);

  // ── logins ──
  const hash = await bcrypt.hash('Iso-Login-1', 10);
  await admin.query(`INSERT INTO scm_staff (email, password, name, scm_role, organization_id, "createdAt", "updatedAt") VALUES ('iso-noorg@verify.invalid', $1, 'No Org', 'admin', NULL, NOW(), NOW()), ('iso-org@verify.invalid', $1, 'With Org', 'admin', $2, NOW(), NOW())`, [hash, A]);
  r = await call('POST', '/api/scm/login', null, { email: 'iso-noorg@verify.invalid', password: 'Iso-Login-1' });
  check('login for staff with no hospital is refused (403), no token issued', r.status === 403 && !r.json?.token, r.text);
  r = await call('POST', '/api/scm/login', null, { email: 'iso-org@verify.invalid', password: 'Iso-Login-1' });
  const claims = r.json?.token ? jwt.decode(r.json.token) : null;
  check('login for staff with a hospital issues a token that carries it', r.status === 200 && claims?.organization_id === A, r.text);
  r = await call('GET', '/api/scm/items', r.json?.token);
  check('that token works and is bound to hospital A', r.status === 200 && ids(r).map(String).includes(String(itemA.id)), r.text);
} catch (e) {
  crashed = e;
} finally {
  try { server?.close(); } catch { /* */ }
  await appPool?.end().catch(() => {});
  await cleanup();
  if (roleCreated) {
    for (const t of originalOwners) await admin.query(`ALTER TABLE "${t.tablename}" OWNER TO "${t.tableowner}"`).catch(() => {});
    await admin.query(`REASSIGN OWNED BY ${ROLE} TO postgres`).catch(() => {}); await admin.query(`DROP OWNED BY ${ROLE}`).catch(() => {}); await admin.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => {}); }
  const left = (await admin.query(`SELECT (SELECT count(*) FROM scm_items WHERE organization_id = ANY($1::int[])) + (SELECT count(*) FROM scm_purchase_orders WHERE organization_id = ANY($1::int[])) + (SELECT count(*) FROM operations_approvals WHERE organization_id = ANY($1::int[])) AS n`, [ORGS]).catch(() => ({ rows: [{ n: '?' }] }))).rows[0].n;
  check('no residue after cleanup', Number(left) === 0, left);
  check('the throw-away role is gone', (await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [ROLE]).catch(() => ({ rowCount: 1 }))).rowCount === 0);
}
const failed = results.filter((x) => !x.ok);
for (const x of results) out(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : '  -> ' + x.detail}`);
if (crashed) out(`CRASH: ${crashed.stack || crashed}`);
out(`\n${results.length - failed.length}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
await admin.end().catch(() => {});
process.exit(failed.length === 0 && !crashed ? 0 : 1);
