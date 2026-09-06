/**
 * Smoke test for the three "app readiness" gaps closed on 2026-09-06:
 *   1. Employee self-selectable wallet tiers
 *   2. Cashless network provider directory
 *   3. Admin corporate quoting calculator + proposal PDF
 *
 * Uses entirely generic, illustrative numbers (not any real prospect's
 * figures) against http://localhost:8888 — a real corporate program is
 * created under Ninjacart (id 49, confirmed to have zero benefit programs
 * before this run) to exercise the tier-selection flow end to end, and is
 * deleted at the end so nothing real is left behind. The quote calculator
 * checks never touch a real corporate at all.
 *
 * Tokens are signed locally with the server JWT_SECRET (HS256, 10m).
 * Usage: node server/scripts/smoke-corporate-quote-readiness.mjs
 */
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

dotenv.config();
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8888/api';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) { console.error('JWT_SECRET missing'); process.exit(1); }

const CORPORATE_ID = 49; // Ninjacart
const EMPLOYEE_USER_ID = 5002;
const EMPLOYEE_EMAIL = 'skanna@ninjacart.com';

let failures = 0;
const record = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON, e.g. a PDF download */ }
  return { status: res.status, json, raw: res };
};

const sign = (payload) => jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '10m' });

let createdProgramId = null;

try {
  const health = await call('GET', '/health');
  record('GET /health returns 200', health.status === 200, `status=${health.status}`);

  const [programCountRows] = await postgresSequelize.query(
    'SELECT COUNT(*)::int AS n FROM corporate_benefit_programs WHERE corporate_id = :cid',
    { replacements: { cid: CORPORATE_ID }, type: QueryTypes.SELECT }
  );
  record('safety: corporate has no benefit programs before this run', programCountRows.n === 0, `count=${programCountRows.n}`);
  if (programCountRows.n !== 0) { console.log('⛔ Aborting: pre-flight safety check failed'); process.exit(1); }

  const hrToken = sign({ id: CORPORATE_ID, corporateId: CORPORATE_ID, userType: 'corporate', role: 'corporate', email: 'smoke-hr@test.local' });
  const employeeToken = sign({ id: EMPLOYEE_USER_ID, email: EMPLOYEE_EMAIL, role: 'user' });
  const adminToken = sign({ id: 20, email: 'smoke-admin@test.local', role: 'admin', isAdmin: true });

  // ── 1. Create a tiered program (illustrative numbers, not a real deal) ──
  const createResp = await call('POST', '/corporate/benefit-wallet/programs', {
    token: hrToken,
    body: {
      name: 'Smoke Test OPD Wallet',
      category: 'opd',
      perEmployeeLimit: 1000,
      tierOptions: [
        { key: 'base', label: 'Base', allocatedLimit: 1000, isDefault: true },
        { key: 'tier1', label: 'Tier 1', allocatedLimit: 5000 },
        { key: 'tier2', label: 'Tier 2', allocatedLimit: 8000 },
      ],
    },
  });
  record('HR create tiered program → 201', createResp.status === 201 && Array.isArray(createResp.json?.data?.program?.tierOptions),
    `status=${createResp.status} tiers=${createResp.json?.data?.program?.tierOptions?.length}`);
  createdProgramId = createResp.json?.data?.program?.id;

  // Mismatched default-tier vs perEmployeeLimit must be rejected.
  const badCreate = await call('POST', '/corporate/benefit-wallet/programs', {
    token: hrToken,
    body: {
      name: 'Bad Tier Program', category: 'opd', perEmployeeLimit: 1000,
      tierOptions: [{ key: 'base', label: 'Base', allocatedLimit: 4000, isDefault: true }],
    },
  });
  record('mismatched default tier vs perEmployeeLimit → 400', badCreate.status === 400, `status=${badCreate.status} msg=${badCreate.json?.message}`);

  // ── 2. Enroll the test employee at the base tier ────────────────────────
  const enrollResp = await call('POST', `/corporate/benefit-wallet/programs/${createdProgramId}/enroll`, {
    token: hrToken,
    body: { employeeIds: ['NC24651'], allocatedLimit: 1000 },
  });
  record('HR enroll employee at base tier → 200', enrollResp.status === 200 && enrollResp.json?.data?.enrolled === 1,
    `status=${enrollResp.status} enrolled=${enrollResp.json?.data?.enrolled}`);

  // ── 3. Employee views wallet, sees tierOptions, upgrades to tier1 ───────
  const walletBefore = await call('GET', '/corporate/my-benefit-wallet', { token: employeeToken });
  const matchedWallet = walletBefore.json?.data?.wallets?.find((w) => Number(w.programId) === Number(createdProgramId));
  const walletId = matchedWallet?.id;
  record('employee sees the new wallet with tierOptions', Array.isArray(matchedWallet?.tierOptions) && matchedWallet.tierOptions.length === 3,
    `walletId=${walletId} tiers=${matchedWallet?.tierOptions?.length}`);

  const upgradeResp = await call('POST', `/corporate/my-benefit-wallet/${walletId}/select-tier`, {
    token: employeeToken,
    body: { tierKey: 'tier1' },
  });
  record('employee self-upgrades to tier1 → 200, allocatedLimit=5000', upgradeResp.status === 200 && upgradeResp.json?.data?.wallet?.allocatedLimit === 5000,
    `status=${upgradeResp.status} allocatedLimit=${upgradeResp.json?.data?.wallet?.allocatedLimit}`);

  const unknownTier = await call('POST', `/corporate/my-benefit-wallet/${walletId}/select-tier`, {
    token: employeeToken,
    body: { tierKey: 'does-not-exist' },
  });
  record('unknown tier key → 400', unknownTier.status === 400, `status=${unknownTier.status} msg=${unknownTier.json?.message}`);

  // Downgrade attempt below zero usage should succeed (nothing utilized/reserved yet).
  const downgradeResp = await call('POST', `/corporate/my-benefit-wallet/${walletId}/select-tier`, {
    token: employeeToken,
    body: { tierKey: 'base' },
  });
  record('employee downgrades back to base (no usage yet) → 200', downgradeResp.status === 200 && downgradeResp.json?.data?.wallet?.allocatedLimit === 1000,
    `status=${downgradeResp.status} allocatedLimit=${downgradeResp.json?.data?.wallet?.allocatedLimit}`);

  // ── 4. Network provider directory (global list, empty is fine — proves the route works) ──
  const providersResp = await call('GET', '/corporate/benefit-wallet/network-providers?category=dental', { token: hrToken });
  record('HR GET network providers → 200 + array', providersResp.status === 200 && Array.isArray(providersResp.json?.data?.providers),
    `status=${providersResp.status} count=${providersResp.json?.data?.providers?.length}`);

  // ── 5. Admin quote calculator — fully generic, illustrative numbers ─────
  const quoteResp = await call('POST', '/admin/corporate-quotes', {
    token: adminToken,
    body: {
      prospectName: 'Smoke Test Prospect Pvt Ltd',
      employeeCount: 100,
      categories: ['opd', 'dental', 'vision', 'vaccination'],
      tierOptions: [
        { key: 'base', label: 'Base', allocatedLimit: 3000, isDefault: true },
        { key: 'tier1', label: 'Tier 1', allocatedLimit: 12000 },
      ],
      assumedUptake: { tier1: 10 },
      adminFeePercent: 8,
      categoryLoadingPerEmployee: 100,
    },
  });
  const quoteId = quoteResp.json?.data?.quote?.id;
  const calc = quoteResp.json?.data?.quote?.calculation;
  record('admin create quote → 201 with calculation', quoteResp.status === 201 && calc?.estimatedTotalAnnualCost > 0,
    `status=${quoteResp.status} total=${calc?.estimatedTotalAnnualCost}`);
  // 100 employees x 3000 base = 300,000 guaranteed. 10% uptake to tier1 = 10 employees x (12000-3000) = 90,000. Total wallet = 390,000.
  record('quote math: guaranteedWalletFunding = 300000', calc?.guaranteedWalletFunding === 300000, `got=${calc?.guaranteedWalletFunding}`);
  record('quote math: totalWalletFunding = 390000', calc?.totalWalletFunding === 390000, `got=${calc?.totalWalletFunding}`);

  const listResp = await call('GET', '/admin/corporate-quotes', { token: adminToken });
  record('admin list quotes → 200 + array', listResp.status === 200 && Array.isArray(listResp.json?.data?.quotes), `status=${listResp.status}`);

  const teamToken = sign({ id: 21, email: 'smoke-team@test.local', role: 'team', isTeam: true });
  const teamListResp = await call('GET', '/admin/corporate-quotes', { token: teamToken });
  record('team role can also access quote tool → 200', teamListResp.status === 200, `status=${teamListResp.status}`);

  const employeeDenied = await call('GET', '/admin/corporate-quotes', { token: employeeToken });
  record('plain employee token denied on quote tool → 403', employeeDenied.status === 403, `status=${employeeDenied.status}`);

  const pdfResp = await call('GET', `/admin/corporate-quotes/${quoteId}/pdf`, { token: adminToken });
  const contentType = pdfResp.raw?.headers?.get('content-type') || '';
  record('admin download quote PDF → 200 application/pdf', pdfResp.status === 200 && contentType.includes('pdf'),
    `status=${pdfResp.status} contentType=${contentType}`);

} catch (err) {
  failures += 1;
  console.error('💥 Smoke test crashed:', err);
} finally {
  // ── Cleanup: remove every trace of the test program from Ninjacart ──────
  if (createdProgramId) {
    await postgresSequelize.query('DELETE FROM corporate_benefit_wallet_transactions WHERE wallet_id IN (SELECT id FROM employee_benefit_wallets WHERE program_id = :pid)', { replacements: { pid: createdProgramId } }).catch(() => {});
    await postgresSequelize.query('DELETE FROM corporate_benefit_authorizations WHERE wallet_id IN (SELECT id FROM employee_benefit_wallets WHERE program_id = :pid)', { replacements: { pid: createdProgramId } }).catch(() => {});
    await postgresSequelize.query('DELETE FROM employee_benefit_wallets WHERE program_id = :pid', { replacements: { pid: createdProgramId } }).catch(() => {});
    await postgresSequelize.query('DELETE FROM corporate_benefit_programs WHERE id = :pid', { replacements: { pid: createdProgramId } }).catch(() => {});
    console.log(`🧹 Cleaned up test program ${createdProgramId} and its wallets/transactions`);
  }
  await postgresSequelize.query('DELETE FROM corporate_quotes WHERE prospect_name = :name', { replacements: { name: 'Smoke Test Prospect Pvt Ltd' } }).catch(() => {});
  console.log('🧹 Cleaned up test quote(s)');

  await postgresSequelize.close().catch(() => {});
  console.log(failures === 0 ? '\n🎉 SMOKE TEST PASSED' : `\n💥 ${failures} SMOKE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
