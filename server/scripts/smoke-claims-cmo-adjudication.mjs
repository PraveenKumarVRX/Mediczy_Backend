/**
 * Smoke test for corporate clinical-staff adjudication — the CMO and OHC
 * (a day-care clinic owned/run by the corporate) roles' access to:
 *   - POST /api/corporate/claims/management/:id/scrutinize
 *   - POST /api/corporate/benefit-wallet/authorizations/:id/settle
 *   - POST /api/v1/occupational-health/fitness-certificate (role gate only)
 * against the LIVE running server (http://localhost:8888).
 *
 * READ-ONLY / NO-SIDE-EFFECTS by design — insurance_claims and
 * corporate_benefit_authorizations have zero/near-zero real rows in
 * production as of this writing, so every authenticated check below
 * deliberately targets a non-existent id (expect 404/400 "not found",
 * nothing to mutate) or an invalid/empty body (expect 400/403). This
 * validates the auth/role gate and the SQL path without ever touching real
 * data or creating a real fitness certificate.
 *
 * Tokens are signed locally with the server JWT_SECRET (HS256, 10m).
 * Usage: node server/scripts/smoke-claims-cmo-adjudication.mjs
 */
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8888/api';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) { console.error('JWT_SECRET missing'); process.exit(1); }

const CORPORATE_ID = 49; // Ninjacart

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

const NONEXISTENT_CLAIM = 'CLM-SMOKE-DOES-NOT-EXIST';

try {
  const health = await call('GET', '/health');
  record('GET /health returns 200', health.status === 200, `status=${health.status}`);

  // ── 1. Unauthenticated ─────────────────────────────────────────────────
  const noToken = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    body: { decision: 'approved', approvedAmount: 100 },
  });
  record('no-token POST /scrutinize → 401', noToken.status === 401, `status=${noToken.status}`);

  // ── 2. hr_staff (not an adjudicator) must be rejected (403) ─────────────
  const hrStaffToken = sign({
    id: 999901, userType: 'corporate', role: 'hr_staff',
    organization_id: CORPORATE_ID, email: 'smoke-hr-staff@test.local',
  });
  const hrStaffAttempt = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: hrStaffToken,
    body: { decision: 'approved', approvedAmount: 100 },
  });
  record('hr_staff token → 403 (not an adjudicator)', hrStaffAttempt.status === 403, `status=${hrStaffAttempt.status} msg=${hrStaffAttempt.json?.message}`);

  // hr_staff must also be blocked from the plain status PUT (tightened alongside /scrutinize).
  const hrStaffPut = await call('PUT', `/corporate/claims/management/${NONEXISTENT_CLAIM}`, {
    token: hrStaffToken,
    body: { status: 'approved' },
  });
  record('hr_staff token on PUT status → 403', hrStaffPut.status === 403, `status=${hrStaffPut.status} msg=${hrStaffPut.json?.message}`);

  // ── 3. corporate_cmo IS an adjudicator — reaches the claim lookup (404, not 403)
  const cmoToken = sign({
    id: 999902, userType: 'corporate', role: 'corporate_cmo',
    organization_id: CORPORATE_ID, email: 'smoke-cmo@test.local',
  });
  const cmoOnMissingClaim = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: cmoToken,
    body: { decision: 'approved', approvedAmount: 100 },
  });
  record('corporate_cmo token on missing claim → 404 (role gate passed)',
    cmoOnMissingClaim.status === 404, `status=${cmoOnMissingClaim.status} msg=${cmoOnMissingClaim.json?.message}`);

  // ── 4. corporate_admin (super-HR) is also an adjudicator ────────────────
  const adminToken = sign({
    id: 999903, userType: 'corporate', role: 'corporate_admin',
    organization_id: CORPORATE_ID, email: 'smoke-admin@test.local',
  });
  const adminOnMissingClaim = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: adminToken,
    body: { decision: 'approved', approvedAmount: 100 },
  });
  record('corporate_admin token on missing claim → 404 (role gate passed)',
    adminOnMissingClaim.status === 404, `status=${adminOnMissingClaim.status} msg=${adminOnMissingClaim.json?.message}`);

  // ── 5. Root corporate account (role: 'corporate') is also an adjudicator ─
  const rootToken = sign({
    id: CORPORATE_ID, corporateId: CORPORATE_ID, userType: 'corporate', role: 'corporate',
    email: 'smoke-root@test.local',
  });
  const rootOnMissingClaim = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: rootToken,
    body: { decision: 'approved', approvedAmount: 100 },
  });
  record('root corporate token on missing claim → 404 (role gate passed)',
    rootOnMissingClaim.status === 404, `status=${rootOnMissingClaim.status} msg=${rootOnMissingClaim.json?.message}`);

  // ── 6. Validation guards (CMO token, still no real claim touched) ───────
  const badDecision = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: cmoToken,
    body: { decision: 'maybe', approvedAmount: 100 },
  });
  record('invalid decision value → 400', badDecision.status === 400, `status=${badDecision.status} msg=${badDecision.json?.message}`);

  const missingAmount = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: cmoToken,
    body: { decision: 'approved' },
  });
  record('approval without approvedAmount → 400', missingAmount.status === 400, `status=${missingAmount.status} msg=${missingAmount.json?.message}`);

  const rejectionNoAmountRequired = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: cmoToken,
    body: { decision: 'rejected', notes: 'smoke test — not a real claim' },
  });
  record('rejection without amount reaches claim lookup (404, not 400)',
    rejectionNoAmountRequired.status === 404, `status=${rejectionNoAmountRequired.status} msg=${rejectionNoAmountRequired.json?.message}`);

  // ── 7. corporate_ohc (OHC — corporate-owned day-care clinic) is also an
  // adjudicator, added alongside corporate_cmo ─────────────────────────────
  const ohcToken = sign({
    id: 999904, userType: 'corporate', role: 'corporate_ohc',
    organization_id: CORPORATE_ID, email: 'smoke-ohc@test.local',
  });
  const ohcOnMissingClaim = await call('POST', `/corporate/claims/management/${NONEXISTENT_CLAIM}/scrutinize`, {
    token: ohcToken,
    body: { decision: 'approved', approvedAmount: 100 },
  });
  record('corporate_ohc token on missing claim → 404 (role gate passed)',
    ohcOnMissingClaim.status === 404, `status=${ohcOnMissingClaim.status} msg=${ohcOnMissingClaim.json?.message}`);

  // ── 8. Benefit-wallet settle/cancel: now also role-gated the same way ────
  const NONEXISTENT_AUTH = 999999;
  const hrStaffSettle = await call('POST', `/corporate/benefit-wallet/authorizations/${NONEXISTENT_AUTH}/settle`, {
    token: hrStaffToken,
    body: { settlementAmount: 100 },
  });
  record('hr_staff on benefit-wallet settle → 403 (new gate)', hrStaffSettle.status === 403, `status=${hrStaffSettle.status} msg=${hrStaffSettle.json?.message}`);

  const ohcSettle = await call('POST', `/corporate/benefit-wallet/authorizations/${NONEXISTENT_AUTH}/settle`, {
    token: ohcToken,
    body: { settlementAmount: 100 },
  });
  record('corporate_ohc on benefit-wallet settle → reaches lookup (400 "not found", not 403)',
    ohcSettle.status === 400 && /not found/i.test(ohcSettle.json?.message || ''), `status=${ohcSettle.status} msg=${ohcSettle.json?.message}`);

  // ── 9. Occupational-health fitness-certificate. Route mounts at
  // /api/v1/occupational-health, a different top-level prefix from
  // /api/corporate — ringFencingMiddleware's "corporate" portal allowlist
  // must explicitly include it or EVERY corporate-portal token (OHC/CMO
  // included) gets a generic 403 from ring-fencing itself before ever
  // reaching requireClinicalIssuer. Both checks below distinguish the two:
  // hr_staff must get requireClinicalIssuer's own message (proves it got
  // past ring-fencing and was rejected by the role check specifically),
  // and corporate_ohc must get PAST both to the real service function —
  // asserted via the DB-level error a genuinely empty body produces
  // (patientId is NOT NULL / has no replacement entry), never a 403 or 500
  // from ring-fencing. Neither call creates a real fitness certificate.
  const hrStaffFitness = await call('POST', '/v1/occupational-health/fitness-certificate', {
    token: hrStaffToken,
    body: {},
  });
  record('hr_staff on fitness-certificate → 403 from requireClinicalIssuer (not ring-fencing)',
    hrStaffFitness.status === 403 && /OHC\/CMO/i.test(hrStaffFitness.json?.message || ''),
    `status=${hrStaffFitness.status} msg=${hrStaffFitness.json?.message}`);

  const ohcFitness = await call('POST', '/v1/occupational-health/fitness-certificate', {
    token: ohcToken,
    body: {},
  });
  record('corporate_ohc on fitness-certificate → past ring-fencing AND role gate (400 from empty body, not 403)',
    ohcFitness.status === 400, `status=${ohcFitness.status} msg=${ohcFitness.json?.message}`);

} catch (err) {
  failures += 1;
  console.error('💥 Smoke test crashed:', err);
} finally {
  console.log(failures === 0 ? '\n🎉 SMOKE TEST PASSED' : `\n💥 ${failures} SMOKE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
