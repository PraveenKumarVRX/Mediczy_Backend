#!/usr/bin/env node
/**
 * Post-deploy smoke test for the 2026-09-25 audit remediation. Read-only in effect: every request is either a GET or a
 * request that is REJECTED before any write (role gate, tenant gate, entitlement gate, validation, not-found).
 *
 *   node scripts/qa/audit-smoke.mjs                       # unauthenticated checks only
 *   JWT_SECRET=… node scripts/qa/audit-smoke.mjs          # + authenticated checks with SYNTHETIC tokens
 *   NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod \
 *     node scripts/ssm-env-loader.mjs scripts/qa/audit-smoke.mjs     # secret loaded from SSM, never printed
 *   BASE=https://app.mediqzy.com  (default http://127.0.0.1:8888)
 *
 * Tokens are HS256, expire in 5 minutes, and name a tenant/user that does not exist (org 987001), so they can read
 * nothing real. No dependencies: signing uses node:crypto.
 */
import crypto from 'node:crypto';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const SECRET = process.env.JWT_SECRET;
const ORG = 987001;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const token = (claims) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ ...claims, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
};
const call = async (method, path, { tok, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body && !['GET', 'HEAD'].includes(method) ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
};
const expect = async (name, req, status, code) => {
  const r = await call(...req);
  const codes = code == null ? null : [].concat(code);
  const ok = r.status === status && (codes == null || codes.includes(r.json?.code));
  check(name, ok, `${req[0]} ${req[1]} → ${r.status}${r.json?.code ? ` ${r.json.code}` : ''} (want ${status}${codes ? ` ${codes.join('|')}` : ''})`);
};

// ── 1. Liveness ────────────────────────────────────────────────────────────────────────────────
const health = await call('GET', '/api/health');
check('API health', health.status === 200, `status ${health.status}`);

// ── 2. New/changed routes are mounted and refuse anonymous callers ────────────────────────────────
for (const [m, p] of [
  ['GET', '/api/hospital/finance/accounts'], ['GET', '/api/hospital/finance/reconciliation'],
  ['POST', '/api/hospital/finance/expenses/1/approve'], ['GET', '/api/hospital/practice/mrd/records'],
  ['POST', '/api/hospital/practice/mrd/uhid/assign'], ['POST', '/api/hospital/practice/discharge-summaries/submit'],
  ['POST', '/api/v1/discharge/sign/1'], ['POST', '/api/v1/adt/discharge'], ['POST', '/api/v1/er/register'],
  ['POST', '/api/module-access/entitlements/revoke'],
]) await expect(`anonymous refused: ${m} ${p}`, [m, p, { body: {} }], 401);

// ── 3. Authenticated checks with synthetic tokens (only if a secret is available) ────────────────────
if (!SECRET) {
  console.log('\n(no JWT_SECRET — authenticated checks skipped)');
} else {
  // Tokens in the shape real logins mint (routes/hospital-auth.route.js: { id, role, userType:'hospital', tenant_id,
  // organization_id }), so they pass the platform ring-fence exactly as real staff do.
  const staff = (role, id, org = ORG) => token({ id, role, userType: 'hospital', ...(org ? { tenant_id: org, organization_id: org } : {}) });
  const staffNoOrg = staff('ms', 6203, null);                        // no tenant claim (SEC-01)
  const nurse = staff('hospital_admin', 987011);                      // may sign/override/index
  const receptionist = staff('receptionist', 987012);                 // real role, real token shape
  const mrd = staff('mrd_staff', 987013);                             // the records-department role
  const REFUSED = ['ROLE_NOT_PERMITTED'];
  const clinicalNurse = staff('nurse', 987014);

  // SEC-01: a staff token WITHOUT a tenant must not become "tenant = its user id".
  await expect('SEC-01 tenant-less token is refused, not mapped to its user id', ['GET', '/api/hospital/practice/mrd/records', { tok: staffNoOrg }], 403, 'TENANT_CONTEXT_REQUIRED');
  // …while a token WITH organization_id resolves its tenant (the claim department logins mint).
  await expect('SEC-01 organization_id claim resolves the tenant (empty list for a synthetic org)', ['GET', '/api/hospital/practice/mrd/records', { tok: nurse }], 200);

  // MRD role gate + validation, all before any write.
  await expect('OPS-02 a receptionist cannot index MRD records', ['POST', '/api/hospital/practice/mrd/records', { tok: receptionist, body: { uhid: 'X', recordType: 'IPD' } }], 403, REFUSED);
  await expect('MRD create validates input (400, nothing written)', ['POST', '/api/hospital/practice/mrd/records', { tok: mrd, body: {} }], 400);
  await expect('OPS-03 UHID assign for an unknown patient is a 404 (nothing written)', ['POST', '/api/hospital/practice/mrd/uhid/assign', { tok: mrd, body: { patientId: 999999999 } }], 404, 'PATIENT_NOT_FOUND');

  // Finance fails closed for a tenant with no entitlement.
  await expect('finance fails closed without an entitlement', ['GET', '/api/hospital/finance/accounts', { tok: nurse }], 403, 'MODULE_NOT_ENTITLED');

  // Discharge: role gate first, then packet scoping — a synthetic tenant owns no packet.
  await expect('CLN-02 a receptionist cannot sign a discharge', ['POST', '/api/v1/discharge/sign/1', { tok: receptionist, body: {} }], 403, REFUSED);
  await expect('CLN-03 signing a packet outside the caller\'s hospital is a 404', ['POST', '/api/v1/discharge/sign/1', { tok: nurse, body: {} }], 404, 'DISCHARGE_DRAFT_NOT_FOUND');
  await expect('CLN-01 a forged approver cannot ride along: still 404 for a foreign packet', ['POST', '/api/v1/discharge/sign/1', { tok: nurse, body: { override: { reasonCode: 'x'.repeat(5), approverId: 1, approverRole: 'medical_director' } } }], 404, 'DISCHARGE_DRAFT_NOT_FOUND');

  // ER: triage needs a clinical role; a suggested up-triage needs an explicit decision (both before any insert).
  await expect('CLN-05 a receptionist cannot assign an ESI level', ['POST', '/api/v1/er/register', { tok: receptionist, body: { patientName: 'Smoke', esiLevel: 3 } }], 403, 'TRIAGE_ROLE_REQUIRED');
  await expect('CLN-04 danger-zone vitals demand an up-triage decision (nothing registered)', ['POST', '/api/v1/er/register',
    { tok: nurse, body: { patientName: 'Smoke', age: 40, esiLevel: 3, triageConfirmed: true, triageInputs: { answers: { multipleResources: true }, vitals: { heartRate: 130 } } } }], 409, 'UP_TRIAGE_DECISION_REQUIRED');
  await expect('CLN-04 a level that does not follow from the answers is refused', ['POST', '/api/v1/er/register',
    { tok: nurse, body: { patientName: 'Smoke', age: 40, esiLevel: 5, triageConfirmed: true, triageInputs: { answers: { multipleResources: true }, vitals: {} } } }], 400, 'TRIAGE_INCONSISTENT');

  // Discharge summaries: invalid status / missing patient are rejected before any write.
  await expect('CLN-06 a summary for a patient that is not in this hospital is a 404', ['POST', '/api/hospital/practice/discharge-summaries', { tok: nurse, body: { patientId: 999999999 } }], 404, 'PATIENT_NOT_FOUND');
  await expect('CLN-06 approval cannot be written through the edit route', ['PUT', '/api/hospital/practice/discharge-summaries/1', { tok: nurse, body: { status: 'approved' } }], 400, 'STATUS_NOT_ALLOWED');
}


if (SECRET) {
  // Imaging tenant fallback (doctor 70 = imaging tenant 70). Ids below collide with nothing, so even a regression could
  // not return real data; the collision itself is pinned by unit tests.
  const doctor = token({ id: 987021, role: 'doctor' });
  const hospitalAcct = token({ id: 987022, role: 'hospital', userType: 'hospital' });
  await expect('IMAGING a doctor token without a tenant is refused (no id-as-tenant fallback)', ['GET', '/api/hypergrid/dicom/studies', { tok: doctor }], 403, 'TENANT_CONTEXT_REQUIRED');
  await expect('IMAGING a hospital-account token is not an imaging tenant either', ['GET', '/api/hypergrid/dicom/studies', { tok: hospitalAcct }], 403, 'TENANT_CONTEXT_REQUIRED');
  await expect('IMAGING a tenantId claim that is not a registered lab is refused (an integer cannot mint a tenant)', ['GET', '/api/hypergrid/dicom/studies', { tok: token({ id: 987023, role: 'doctor', tenantId: 987001 }) }], 403, 'TENANT_CONTEXT_REQUIRED');
  await expect('IMAGING an unknown tenantUid is refused', ['GET', '/api/hypergrid/dicom/studies', { tok: token({ id: 987024, role: 'doctor', tenantUid: '11111111-1111-4111-8111-111111111111' }) }], 403, 'TENANT_CONTEXT_REQUIRED');

  // HyperGrid platform routes authenticate through authUser, which looks the user up in the database — a synthetic token
  // for a non-existent user is a 401 before the tenant gate is ever reached, so the tenant gate is pinned by
  // __tests__/hypergrid-tenant.test.js and hypergrid-routes-tenant.test.js instead. Here: each router is mounted and
  // refuses an anonymous caller.
  for (const p of ['/api/hypergrid/terminology/codes', '/api/hypergrid/edge/gateways', '/api/hypergrid/twins', '/api/hypergrid/events', '/api/hypergrid/mqtt/devices', '/api/hypergrid/connectors']) {
    await expect(`HG anonymous refused on GET ${p}`, ['GET', p], 401);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} smoke checks passed`);
process.exit(failed ? 1 : 0);
