/** Smart-Force end-to-end check (run via /mnt/medstar/smoke.sh) through the public URL, exactly as the app calls it.
 * Creates a temporary Sales Rep in tenant 70 with a random password, then removes it and its data. */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'node:crypto';
import pool from '../../db/pgPool.js';

const BASE = 'https://app.medstarhospitals.com';
const T = 70;
const out = [];
const check = (name, ok, detail = '') => out.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 150) });
async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
const stamp = randomUUID().slice(0, 8);
const email = `sf-e2e-${stamp}@example.invalid`;
const password = randomBytes(18).toString('base64url');
let userId, viewerId, agentId;
try {
  const hash = await bcrypt.hash(password, 10);
  const mk = async (mail, role) => (await pool.query(
    `INSERT INTO users ("firstName","lastName",email,password,"phoneNumber",role,status,"isAdmin","isTeam",tenant_id,organization_id,organization_type,metadata,"createdAt","updatedAt")
     VALUES ('SmartForce','E2E',$1,$2,'0000000000','team','active',false,false,$3,$3,'hospital',$4,now(),now()) RETURNING id`,
    [mail, hash, T, JSON.stringify({ isCRM: true, crmRole: role, tenantId: T })])).rows[0].id;
  userId = await mk(email, 'sales_rep');
  viewerId = await mk(`sf-e2e-mkt-${stamp}@example.invalid`, 'marketing');
  agentId = await mk(`sf-e2e-agent-${stamp}@example.invalid`, 'telecaller');

  // Sign-in
  let r = await call('/api/team/login', { method: 'POST', body: { email, password: 'wrong-password' } });
  check('wrong password rejected', r.status === 401 && r.data?.error, `${r.status} ${r.data?.error}`);
  r = await call('/api/team/login', { method: 'POST', body: { email: `sf-e2e-mkt-${stamp}@example.invalid`, password } });
  check('role without app access refused', r.status === 403, `${r.status} ${r.data?.error}`);
  r = await call('/api/team/login', { method: 'POST', body: { email: `sf-e2e-agent-${stamp}@example.invalid`, password } });
  check('call centre agent signs in to agent mode', r.status === 200 && JSON.stringify(r.data?.user?.modes) === '["agent"]' && !r.data?.user?.permissions?.includes('Field Force'), `${r.status} ${JSON.stringify(r.data?.user?.modes || r.data?.error)}`);
  r = await call('/api/team/login', { method: 'POST', body: { email, password } });
  const { accessToken, refreshToken, user } = r.data || {};
  check('sales rep signs in', r.status === 200 && accessToken && refreshToken, r.status);
  check('app permission check passes ("Field Force")', user?.permissions?.includes('Field Force'), JSON.stringify(user?.permissions));
  check('rep is not a manager', !user?.permissions?.includes('Field Force Manager'));

  // Field API
  r = await call('/api/field/attendance/today', { token: accessToken }); check('attendance today', r.status === 200, r.status);
  r = await call('/api/field/attendance/clock-in', { method: 'POST', token: accessToken, body: { lat: 16.5062, lng: 80.648, accuracy_m: 12, address: 'Vijayawada (E2E test)' } });
  check('GPS clock-in', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.data).slice(0, 90)}`);
  r = await call('/api/field/visits', { method: 'POST', token: accessToken, body: { entity_type: 'doctor', entity_name: 'Dr. E2E Test', visit_type: 'regular', planned_at: new Date().toISOString() } });
  check('plan a visit', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.data).slice(0, 90)}`);
  for (const p of ['/api/field/visits', '/api/field/my/day-plan', '/api/field/my/targets', '/api/field/my/scorecard', '/api/field/leads', '/api/field/doctor-crm', '/api/field/camps', '/api/field/notifications', '/api/field/expenses', '/api/field/tour-plans', '/api/field/cme-events', '/api/field/territory']) {
    r = await call(p, { token: accessToken }); check(`GET ${p}`, r.status === 200, `${r.status} ${r.status !== 200 ? JSON.stringify(r.data).slice(0, 100) : ''}`);
  }
  r = await call('/api/field/attendance/clock-out', { method: 'PATCH', token: accessToken, body: { lat: 16.5062, lng: 80.648 } });
  check('clock-out', r.status === 200, `${r.status} ${JSON.stringify(r.data).slice(0, 90)}`);
  r = await call('/api/field/team/attendance', { token: accessToken });
  check('manager-only endpoint refused for rep', r.status === 403, r.status);

  // Session handling
  r = await call('/api/team/refresh-token', { method: 'POST', body: { refreshToken } });
  check('refresh issues new access token', r.status === 200 && r.data?.accessToken, r.status);
  const forged = jwt.sign({ id: userId, scope: 'smart-force', tenantId: 999, tokenType: 'access', jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: 60 });
  r = await call('/api/field/visits', { token: forged }); check('token for another tenant refused', r.status === 401, r.status);
  const crmStyle = jwt.sign({ id: userId, isCRM: true, tokenType: 'access', tenantId: T, jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: 60 });
  r = await call('/api/field/visits', { token: crmStyle }); check('CRM web token not accepted on field API', r.status === 401, r.status);
  r = await call('/api/team/logout', { method: 'POST', token: accessToken }); check('logout', r.status === 200, r.status);
  r = await call('/api/field/visits', { token: accessToken }); check('token dead after logout', r.status === 401, r.status);
  r = await call('/api/team/refresh-token', { method: 'POST', body: { refreshToken } }); check('refresh dead after logout', r.status === 401, r.status);

  // Manager view in the CRM sees the rep's day
  const admin = (await pool.query(`SELECT id, role, metadata FROM users WHERE tenant_id=$1 AND status='active' AND email NOT LIKE 'sf-e2e-%' ORDER BY id LIMIT 1`, [T])).rows[0];
  const crmToken = jwt.sign({ id: admin.id, role: admin.role, isCRM: true, userType: 'crm', tenantId: T, crmRole: admin.metadata?.crmRole || 'admin', tokenType: 'access', jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: 300 });
  for (const p of ['/api/crm/field-force/summary', '/api/crm/field-force/attendance', '/api/crm/field-force/visits', '/api/crm/field-force/team', '/api/crm/field-force/approvals']) {
    r = await call(p, { token: crmToken }); check(`CRM ${p.replace('/api/crm/field-force', 'field-force')}`, r.status === 200, `${r.status} ${r.status !== 200 ? JSON.stringify(r.data).slice(0, 100) : ''}`);
  }
  r = await call('/api/crm/field-force/attendance', { token: crmToken });
  check('CRM attendance shows the rep', JSON.stringify(r.data).includes(String(userId)) || JSON.stringify(r.data).includes('SmartForce'), '');
  r = await call('/api/crm/ui-config', { token: crmToken });
  check('Field Force menu no longer hidden', r.status === 200 && !r.data.data.disabledPaths.includes('/crm/field-force'), r.data?.data?.disabledPaths?.join(' '));
} finally {
  const ids = [userId, viewerId, agentId].filter(Boolean);
  if (ids.length) {
    const tables = (await pool.query(`SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN pg_tables t ON t.tablename=c.table_name AND t.schemaname='public'
      WHERE c.table_schema='public' AND (c.table_name LIKE 'field\\_%' OR c.table_name='daily_field_reports') AND c.column_name IN ('user_id','created_by','assigned_to','field_exec_id','exec_id')`)).rows;
    for (const { table_name, column_name } of tables) await pool.query(`DELETE FROM ${table_name} WHERE ${column_name} = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM api_v2_refresh_tokens WHERE user_id = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM crm_login_attempts WHERE email LIKE 'sf-e2e-%'`).catch(() => {});
    await pool.query(`DELETE FROM crm_audit_log WHERE entity_type='smart_force_session' AND entity_id = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    const left = (await pool.query(`SELECT count(*)::int n FROM users WHERE email LIKE 'sf-e2e-%'`)).rows[0].n;
    check('test users and data removed', left === 0, `left=${left}`);
  }
  await pool.end();
  for (const x of out) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}  ${x.detail}`);
  console.log(`TOTAL ${out.filter(x => x.ok).length}/${out.length}`);
  if (out.some(x => !x.ok)) process.exitCode = 1;
}
