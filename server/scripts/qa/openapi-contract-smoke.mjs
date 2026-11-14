/**
 * Live contract check: calls the running server and validates every response
 * against the app-facing OpenAPI spec (server/openapi/).
 *
 *   node scripts/ssm-env-loader.mjs scripts/qa/openapi-contract-smoke.mjs [--user <id>] [--base http://localhost:8888]
 *
 * LOCALHOST ONLY. It refuses any other base URL: scripts must never call the
 * public app backend (app.mediqzy.com IP-blocked this machine once for request
 * volume). Read-only: GET operations, plus refusals that change nothing.
 * Signs a 10-minute token for the given user (default: QA policy employee 7646).
 */
import { generateToken } from '../../utils/auth.utils.js';
import { buildAppSpec } from '../../openapi/index.js';
import { checkResponse } from '../../openapi/contract.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:8888');
const userId = Number(arg('--user', 7646));
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing ${BASE}: this check only runs against the local server.`);
  process.exit(2);
}

const spec = buildAppSpec();
const token = generateToken({ id: userId, role: 'user', userType: 'user' }, { expiresIn: '10m' });
const results = [];

async function check(method, specPath, url, { body, headers = {}, expectStatus } = {}) {
  const res = await fetch(BASE + url, {
    method: method.toUpperCase(),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  const { documented, errors } = checkResponse(spec, method, specPath, res.status, json);
  const statusOk = expectStatus ? expectStatus.includes(res.status) : true;
  results.push({ ok: documented && errors.length === 0 && statusOk, label: `${method.toUpperCase()} ${url}`, status: res.status, errors: statusOk ? errors : [`unexpected status ${res.status}`, ...errors] });
  return json;
}

const E = '/api/employee';
for (const p of ['/my-corporate', '/context', '/home', '/my-labs', '/my-hospitals', '/my-clinics', '/benefits', '/policies/types', '/policies/coverage-matrix', '/claims', '/claims/eligibility', '/insurance/link']) {
  await check('get', E + p, E + p);
}
const wallet = await check('get', `${E}/policies`, `${E}/policies`);
const policy = wallet?.policies?.[0];
if (policy) {
  await check('get', `${E}/policies/{policyId}`, `${E}/policies/${policy.id}`);
  await check('get', `${E}/policies/{policyId}/claims`, `${E}/policies/${policy.id}/claims`);
  const member = policy.members?.[0];
  if (member && policy.hasECard) await check('get', `${E}/policies/{policyId}/members/{memberId}/e-card`, `${E}/policies/${policy.id}/members/${member.memberId}/e-card`);
}
// Refusals are part of the contract too; none of these change anything.
await check('get', `${E}/enrolment/window`, `${E}/enrolment/window`, { expectStatus: [200, 409, 503] });
await check('post', `${E}/insurance/refresh`, `${E}/insurance/refresh`, { expectStatus: [200, 409, 503] });
await check('get', '/api/addresses/autocomplete', '/api/addresses/autocomplete?input=Chennai%20Anna%20Nagar&country=in', { expectStatus: [200, 503] });

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.status}  ${r.label}`);
  for (const e of r.errors.slice(0, 5)) console.log(`        ${e}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} responses match the contract (spec ${spec.info.version})`);
process.exit(passed === results.length ? 0 : 1);
