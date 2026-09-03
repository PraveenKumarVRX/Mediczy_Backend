/**
 * Smoke test for the Corporate Benefit Wallet + Cashless Settlement APIs
 * against the LIVE running server (http://localhost:8888).
 *
 * READ-ONLY / NO-SIDE-EFFECTS by design:
 *  - unauthenticated checks (expect 401)
 *  - HR (authCorporate) reads: summary / programs / authorizations / employee wallet
 *  - HR settle/cancel against a NON-EXISTENT id (expect 400 guard, nothing mutated)
 *  - employee (authUser) wallet read + authorization request expected to be
 *    rejected 400 because the corporate has no programs (verified beforehand)
 *
 * Tokens are signed locally with the server JWT_SECRET (HS256, 10m, no jti).
 * Usage: node server/scripts/smoke-benefit-wallet-settlement.mjs
 */
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

dotenv.config();
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8888/api';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) { console.error('JWT_SECRET missing'); process.exit(1); }

const CORPORATE_ID = 49;       // Ninjacart (Active in prod)
const EMPLOYEE_USER_ID = 5002; // active corporate_employees row for corp 49 + active membership plan
const EMPLOYEE_CODE = 'NC24651';
const EMPLOYEE_EMAIL = 'skanna@ninjacart.com';

let failures = 0;
const record = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};

const sign = (payload) => jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '10m' });

try {
  // ── Pre-flight sanity ────────────────────────────────────────────────
  const health = await call('GET', '/health');
  record('GET /health returns 200', health.status === 200, `status=${health.status}`);

    // Pre-flight safety: pick a user who is an eligible corporate employee so the
  // membership gate is satisfied WITHOUT mutating any real records, and whose
  // corporate has no benefit programs so no writes can happen on the POST test.
  const [programCountRows, userRows, walletRows, authRows] = await Promise.all([
    postgresSequelize.query('SELECT COUNT(*)::int AS n FROM corporate_benefit_programs WHERE corporate_id = :cid', { replacements: { cid: CORPORATE_ID }, type: QueryTypes.SELECT }),
    postgresSequelize.query('SELECT id, email FROM users WHERE id = :uid', { replacements: { uid: EMPLOYEE_USER_ID }, type: QueryTypes.SELECT }),
    postgresSequelize.query('SELECT COUNT(*)::int AS n FROM employee_benefit_wallets WHERE user_id = :uid AND corporate_id = :cid', { replacements: { uid: EMPLOYEE_USER_ID, cid: CORPORATE_ID }, type: QueryTypes.SELECT }),
    postgresSequelize.query('SELECT COUNT(*)::int AS n FROM corporate_benefit_authorizations WHERE user_id = :uid', { replacements: { uid: EMPLOYEE_USER_ID }, type: QueryTypes.SELECT }),
  ]);
  record('safety: corporate has no benefit programs (POST test stays side-effect-free)', programCountRows[0].n === 0, `count=${programCountRows[0].n}`);
  record('safety: employee user exists in prod', userRows.length === 1, userRows[0]?.email || 'missing');
  record('safety: employee has no pre-existing wallets', walletRows[0].n === 0, `count=${walletRows[0].n}`);
  record('safety: employee has no pre-existing benefit auths', authRows[0].n === 0, `count=${authRows[0].n}`);
  if (programCountRows[0].n !== 0 || userRows.length !== 1 || walletRows[0].n !== 0 || authRows[0].n !== 0) {
    console.log('⛔ Aborting authenticated smoke: pre-flight safety checks failed');
    process.exit(1);
  }


  // ── 1. Unauthenticated suite (all must be 401) ──────────────────────
  const unauthCases = [
    ['GET', '/corporate/benefit-wallet/summary'],
    ['GET', '/corporate/benefit-wallet/programs'],
    ['GET', '/corporate/benefit-wallet/authorizations'],
    ['GET', `/corporate/benefit-wallet/employees/${EMPLOYEE_CODE}`],
    ['GET', '/corporate/my-benefit-wallet'],
    ['POST', '/corporate/benefit-wallet/authorizations/999999/settle'],
    ['POST', '/corporate/benefit-wallet/authorizations/999999/cancel'],
  ];
  for (const [method, path] of unauthCases) {
    const r = await call(method, path);
    record(`no-token ${method} ${path} → 401`, r.status === 401, `status=${r.status}`);
  }

  // ── 2. Wrong-role token must be rejected (403) ──────────────────────
  const employeeToken = sign({ id: EMPLOYEE_USER_ID, email: userRows[0].email, role: 'user' });
  const forbidden = await call('GET', '/corporate/benefit-wallet/summary', { token: employeeToken });
  record('employee token on HR endpoint → 403', forbidden.status === 403, `status=${forbidden.status}`);
  // ── 3. HR (authCorporate) read suite ─────────────────────────────────
  const hrToken = sign({
    id: CORPORATE_ID,
    corporateId: CORPORATE_ID,
    role: 'corporate',
    userType: 'corporate',
    email: 'smoke-hr@test.local',
    companyName: 'Smoke HR',
  });

  const summary = await call('GET', '/corporate/benefit-wallet/summary', { token: hrToken });
  record('HR GET summary → 200 + payload', summary.status === 200 && summary.json?.success === true && summary.json?.data?.programCount !== undefined,
    `status=${summary.status} programs=${summary.json?.data?.programCount ?? 'n/a'} openAuths=${summary.json?.data?.openAuthorizations ?? 'n/a'}`);

  const programs = await call('GET', '/corporate/benefit-wallet/programs', { token: hrToken });
  record('HR GET programs → 200 + array', programs.status === 200 && Array.isArray(programs.json?.data?.programs),
    `status=${programs.status} count=${programs.json?.data?.programs?.length ?? 'n/a'}`);

  const auths = await call('GET', '/corporate/benefit-wallet/authorizations?limit=5', { token: hrToken });
  record('HR GET authorizations → 200 + array', auths.status === 200 && Array.isArray(auths.json?.data?.authorizations),
    `status=${auths.status} count=${auths.json?.data?.authorizations?.length ?? 'n/a'}`);

  const authsFiltered = await call('GET', '/corporate/benefit-wallet/authorizations?status=approved', { token: hrToken });
  record('HR GET authorizations?status=approved → 200', authsFiltered.status === 200 && Array.isArray(authsFiltered.json?.data?.authorizations), `status=${authsFiltered.status}`);

  const empWallet = await call('GET', `/corporate/benefit-wallet/employees/${EMPLOYEE_CODE}`, { token: hrToken });
  record('HR GET employee wallet → 200', empWallet.status === 200 && empWallet.json?.success === true, `status=${empWallet.status}`);

  // ── 4. HR settle/cancel guards on non-existent id (expect 400, no mutation)
  const settleGuard = await call('POST', '/corporate/benefit-wallet/authorizations/999999/settle', { token: hrToken, body: { settlementAmount: 100 } });
  record('HR settle non-existent → 400 guard', settleGuard.status === 400 && /not found/i.test(settleGuard.json?.message || ''), `status=${settleGuard.status} msg=${settleGuard.json?.message}`);

  const cancelGuard = await call('POST', '/corporate/benefit-wallet/authorizations/999999/cancel', { token: hrToken, body: {} });
  record('HR cancel non-existent → 400 guard', cancelGuard.status === 400 && /not found/i.test(cancelGuard.json?.message || ''), `status=${cancelGuard.status} msg=${cancelGuard.json?.message}`);

  const badId = await call('POST', '/corporate/benefit-wallet/authorizations/abc/settle', { token: hrToken, body: {} });
  record('HR settle invalid id → 400', badId.status === 400, `status=${badId.status}`);

  // ── 5. Employee (authUser) suite ─────────────────────────────────────
  const myWallet = await call('GET', '/corporate/my-benefit-wallet', { token: employeeToken });
  record('employee GET my-benefit-wallet → 200 + corporate flag',
    myWallet.status === 200 && myWallet.json?.success === true && myWallet.json?.data?.isCorporateEmployee === true,
    `status=${myWallet.status} isCorporateEmployee=${myWallet.json?.data?.isCorporateEmployee ?? 'n/a'} wallets=${myWallet.json?.data?.wallets?.length ?? 'n/a'}`);

  const authRequest = await call('POST', '/corporate/benefit-wallet/authorizations', {
    token: employeeToken,
    body: { amount: 100, category: 'opd', providerName: 'Smoke Provider', serviceType: 'Smoke OPD' },
  });
  record('employee auth request w/o program → 400 (validation path live, nothing created)',
    authRequest.status === 400 && /No active|benefit wallet/i.test(authRequest.json?.message || ''),
    `status=${authRequest.status} msg=${authRequest.json?.message}`);

  const invalidBody = await call('POST', '/corporate/benefit-wallet/authorizations', { token: employeeToken, body: { amount: -5 } });
  record('employee auth request with invalid amount → 400', invalidBody.status === 400, `status=${invalidBody.status} msg=${invalidBody.json?.message}`);

} catch (err) {
  failures += 1;
  console.error('💥 Smoke test crashed:', err);
} finally {
  await postgresSequelize.close().catch(() => {});
  console.log(failures === 0 ? '\n🎉 SMOKE TEST PASSED' : `\n💥 ${failures} SMOKE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
