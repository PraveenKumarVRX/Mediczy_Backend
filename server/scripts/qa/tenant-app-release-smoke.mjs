/** Read-only checks; invoke with production SSM loader. No credentials are printed. */
import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import { writeFileSync } from 'node:fs';
import { postgresTls } from '../../db/postgres-tls.js';
const output = process.env.TENANT_APP_EVIDENCE;
if (!output) throw new Error('Private evidence output is required.');
const db = new Client({ host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST, database: process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE, user: process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER, password: process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD, ssl: postgresTls() });
const record = { at: new Date().toISOString(), checks: [], productionMutations: 0, loginRetested: false };
let admin, tenant;
const check = (name, passed, details = {}) => { record.checks.push({ name, passed, ...details }); if (!passed) process.exitCode = 1; };
try {
  await db.connect(); await db.query('BEGIN READ ONLY');
  const columns = (await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (table_name='tenants' AND column_name IN ('id','settings','unique_id','status') OR table_name='users' AND column_name='organization_uid' OR table_name='corporates' AND column_name IN ('owned_by_tenant_id','tenant_id','unique_id'))`)).rows;
  check('required tenant and identity columns exist', columns.length === 8, { columns: columns.length });
  record.configuredTenants = (await db.query(`SELECT count(*)::int AS count FROM tenants WHERE settings->'mobileApps' IS NOT NULL`)).rows[0].count;
  admin = (await db.query(`SELECT id,role FROM users WHERE status='active' AND role IN ('admin','super_admin','platform_admin') ORDER BY CASE WHEN role='super_admin' THEN 0 WHEN role='platform_admin' THEN 1 ELSE 2 END,id LIMIT 1`)).rows[0];
  tenant = (await db.query(`SELECT id FROM tenants ORDER BY CASE WHEN metadata->>'demo'='true' THEN 0 ELSE 1 END,id LIMIT 1`)).rows[0];
  check('existing administrator and tenant available', Boolean(admin && tenant));
  await db.query(`SELECT id FROM tenants WHERE settings#>>'{mobileApps,origin}'=$1 LIMIT 1`, ['https://tenant-release-unconfigured.invalid']);
  check('tenant origin JSONB lookup executes', true); await db.query('ROLLBACK');
} finally { await db.end(); }
if (process.env.TENANT_APP_PREFLIGHT_ONLY !== 'true' && admin && tenant) {
  const token = jwt.sign({ id: admin.id, role: admin.role, isAdmin: true, tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: 600 });
  for (const base of ['https://app.mediqzy.com', 'https://mediqzy.com']) {
    async function probe(path, options = {}) {
      const response = await fetch(base + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
      return { response, data: await response.json().catch(() => ({})) };
    }
    let r = await probe('/api/health'); check(`${base} API health`, r.response.ok, { status: r.response.status });
    r = await probe('/api/mobile/discovery'); const first = r;
    check(`${base} discovery fails closed or advertises configured protocol`, r.response.status === 503 || (r.response.ok && r.data.product === 'mediczy-mobile'), { status: r.response.status });
    r = await probe('/api/mobile/discovery', { headers: { 'X-Tenant-ID': '999999999', 'X-Forwarded-Host': 'tenant-release-unconfigured.invalid' } });
    check(`${base} discovery ignores override headers`, r.response.status === first.response.status && r.data.deploymentId === first.data.deploymentId, { status: r.response.status });
    r = await probe(`/api/superadmin/tenants/tenants/${tenant.id}/mobile-apps`);
    check(`${base} config requires authentication`, [401, 403].includes(r.response.status), { status: r.response.status });
    r = await probe(`/api/superadmin/tenants/tenants/${tenant.id}/mobile-apps`, { headers: { Authorization: `Bearer ${token}` } });
    check(`${base} administrator reads app config`, r.response.ok && r.data.success === true && 'configuration' in r.data, { status: r.response.status });
    r = await probe(`/api/superadmin/tenants/tenants/${tenant.id}/mobile-apps/deployment`, { headers: { Authorization: `Bearer ${token}` } });
    check(`${base} administrator exports deployment config`, r.response.ok && typeof r.data.environment === 'object', { status: r.response.status });
    r = await probe('/api/team/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    check(`${base} Smart-Force login validation`, r.response.status === 400, { status: r.response.status });
  }
}
writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ checks: record.checks.length, passed: record.checks.filter(c => c.passed).length, failed: record.checks.filter(c => !c.passed).length, configuredTenants: record.configuredTenants, productionMutations: 0 }));
