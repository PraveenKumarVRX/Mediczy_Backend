/**
 * E2E test for provider cashless settlement against the LOCAL mediczy_ai DB.
 *
 * Flow: create program -> enroll EMP002 (user 5438) -> request authorization
 * (reserve) -> PARTIAL settle (reserved -> utilized + release delta) ->
 * request second authorization -> cancel (reserve released). Verifies wallet
 * balances, ledger entries, and settlement/cancellation audit columns, then
 * cleans up all test rows.
 *
 * Usage: node server/scripts/test-benefit-wallet-settlement.mjs
 */

// Point at the local sandbox DB BEFORE importing any server module.
process.env.POSTGRES_HOST = '127.0.0.1';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_DATABASE = 'mediczy_ai';
process.env.POSTGRES_USER = 'mediczy_helper';
process.env.POSTGRES_PASSWORD = 'Mediczy2024Helper';
process.env.POSTGRES_SSL = 'false';
process.env.NODE_ENV = 'test';

const {
  createCorporateBenefitProgram,
  enrollEmployeesInBenefitProgram,
  requestBenefitAuthorization,
  settleBenefitAuthorization,
  cancelBenefitAuthorization,
  listCorporateBenefitAuthorizations,
} = await import('../services/corporate-benefit-wallet.service.js');
const { postgresSequelize } = await import('../db/postgres-sequelize.js');
const { QueryTypes } = await import('sequelize');

const CORPORATE_ID = 2;
const USER_ID = 5438;
const EMPLOYEE_ID = 'EMP002';
const ACTOR_ID = 9999;
const PROGRAM_NAME = `E2E-SETTLE-TEST-${Date.now()}`;

let failures = 0;
const check = (label, actual, expected) => {
  const pass = Number(actual) === Number(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? '✅' : '❌'} ${label}: expected ${expected}, got ${actual}`);
};
const checkTrue = (label, condition) => {
  if (!condition) failures += 1;
  console.log(`${condition ? '✅' : '❌'} ${label}`);
};

const getWallet = async (programId) => {
  const rows = await postgresSequelize.query(
    `SELECT id, allocated_limit, utilized_amount, reserved_amount
       FROM employee_benefit_wallets
      WHERE program_id = :programId AND corporate_id = :corporateId
      LIMIT 1`,
    { replacements: { programId, corporateId: CORPORATE_ID }, type: QueryTypes.SELECT }
  );
  return rows[0];
};

const getAuth = async (authId) => {
  const rows = await postgresSequelize.query(
    `SELECT id, status, settlement_amount, settled_at, settled_by, cancelled_at, cancelled_by
       FROM corporate_benefit_authorizations WHERE id = :authId`,
    { replacements: { authId }, type: QueryTypes.SELECT }
  );
  return rows[0];
};

const countLedger = async (walletId, type, amount) => {
  const rows = await postgresSequelize.query(
    `SELECT COUNT(*)::int AS n FROM corporate_benefit_wallet_transactions
      WHERE wallet_id = :walletId AND transaction_type = CAST(:type AS corporate_benefit_transaction_type)
        AND (:amount::numeric IS NULL OR amount = :amount::numeric)`,
    { replacements: { walletId, type, amount: amount ?? null }, type: QueryTypes.SELECT }
  );
  return rows[0].n;
};
let programId = null;
try {
  // 1. Create test program
  const program = await createCorporateBenefitProgram(CORPORATE_ID, {
    name: PROGRAM_NAME,
    category: 'opd',
    fundingType: 'cashless',
    annualBudget: 50000,
    perEmployeeLimit: 5000,
    description: 'E2E settlement test program (auto-cleaned)',
  }, ACTOR_ID);
  programId = program.id;
  checkTrue(`program created (id=${programId})`, Boolean(programId));

  // 2. Enroll the test employee
  const enroll = await enrollEmployeesInBenefitProgram(CORPORATE_ID, programId, {
    employeeIds: [EMPLOYEE_ID],
    allocatedLimit: 5000,
  }, ACTOR_ID);
  check('employees enrolled', enroll.enrolled, 1);

  let wallet = await getWallet(programId);
  check('wallet allocated', wallet.allocated_limit, 5000);
  check('wallet utilized after allocation', wallet.utilized_amount, 0);
  check('wallet reserved after allocation', wallet.reserved_amount, 0);
  check('allocation ledger entries', await countLedger(wallet.id, 'allocation', 5000), 1);

  // 3. Authorization #1 -> reserve 1500
  const auth1 = await requestBenefitAuthorization(USER_ID, {
    amount: 1500,
    category: 'opd',
    providerName: 'E2E Test Clinic',
    serviceType: 'OPD Consultation',
  });
  check('auth1 status approved', auth1.status === 'approved' ? 1 : 0, 1);
  wallet = await getWallet(programId);
  check('reserved after auth1', wallet.reserved_amount, 1500);
  check('utilized after auth1', wallet.utilized_amount, 0);
  check('reservation ledger entries', await countLedger(wallet.id, 'reservation', 1500), 1);

  // 4. PARTIAL settlement of auth1: settle 1200 of 1500 approved
  const settlement = await settleBenefitAuthorization(CORPORATE_ID, auth1.id, {
    settlementAmount: 1200,
    invoiceNumber: 'INV-E2E-001',
    notes: 'e2e partial settlement',
  }, ACTOR_ID);
  check('settlement returned amount', settlement.settlementAmount, 1200);
  check('settlement released delta', settlement.releasedAmount, 300);
  wallet = await getWallet(programId);
  check('utilized after settle', wallet.utilized_amount, 1200);
  check('reserved after settle', wallet.reserved_amount, 0);
  const auth1Row = await getAuth(auth1.id);
  checkTrue('auth1 status settled', auth1Row.status === 'settled');
  check('auth1 settlement_amount', auth1Row.settlement_amount, 1200);
  checkTrue('auth1 settled_at set', Boolean(auth1Row.settled_at));
  check('auth1 settled_by', auth1Row.settled_by, ACTOR_ID);
  check('settlement ledger entry', await countLedger(wallet.id, 'settlement', 1200), 1);
  check('release ledger entry (300)', await countLedger(wallet.id, 'reservation_release', 300), 1);
  // 5. Authorization #2 -> reserve 800, then cancel
  const auth2 = await requestBenefitAuthorization(USER_ID, {
    amount: 800,
    category: 'opd',
    providerName: 'E2E Test Clinic',
    serviceType: 'Follow-up',
  });
  wallet = await getWallet(programId);
  check('reserved after auth2', wallet.reserved_amount, 800);

  const cancellation = await cancelBenefitAuthorization(CORPORATE_ID, auth2.id, {
    notes: 'e2e cancellation',
  }, ACTOR_ID);
  check('cancellation released amount', cancellation.releasedAmount, 800);
  wallet = await getWallet(programId);
  check('reserved after cancel', wallet.reserved_amount, 0);
  check('utilized unchanged after cancel', wallet.utilized_amount, 1200);
  const auth2Row = await getAuth(auth2.id);
  checkTrue('auth2 status cancelled', auth2Row.status === 'cancelled');
  checkTrue('auth2 cancelled_at set', Boolean(auth2Row.cancelled_at));
  check('auth2 cancelled_by', auth2Row.cancelled_by, ACTOR_ID);
  check('release ledger entry (800)', await countLedger(wallet.id, 'reservation_release', 800), 1);

  // 6. Guard rail: settling a cancelled authorization must fail
  let guardError = null;
  try { await settleBenefitAuthorization(CORPORATE_ID, auth2.id, { settlementAmount: 100 }, ACTOR_ID); }
  catch (err) { guardError = err.message; }
  checkTrue('cannot settle cancelled auth', /Only approved/i.test(String(guardError)));

  // 7. HR list view returns both with expected shapes
  const listed = await listCorporateBenefitAuthorizations(CORPORATE_ID, { limit: 50 });
  const listed1 = listed.find((a) => a.id === auth1.id);
  const listed2 = listed.find((a) => a.id === auth2.id);
  checkTrue('list contains auth1 (settled, 1200)', listed1?.status === 'settled' && Number(listed1?.settlementAmount) === 1200);
  checkTrue('list contains auth2 (cancelled)', listed2?.status === 'cancelled');
  checkTrue('list exposes employee name/id', Boolean(listed1?.employeeName || listed1?.employeeId));

  console.log(failures === 0 ? '\n🎉 ALL SETTLEMENT E2E CHECKS PASSED' : `\n💥 ${failures} CHECK(S) FAILED`);
} catch (error) {
  failures += 1;
  console.error('💥 E2E flow error:', error);
} finally {
  // Cleanup all test artifacts
  try {
    if (programId) {
      const walletRows = await postgresSequelize.query(
        'SELECT id FROM employee_benefit_wallets WHERE program_id = :programId',
        { replacements: { programId }, type: QueryTypes.SELECT }
      );
      const walletIds = walletRows.map((w) => w.id);
      if (walletIds.length) {
        await postgresSequelize.query(
          'DELETE FROM corporate_benefit_wallet_transactions WHERE wallet_id IN (:walletIds)',
          { replacements: { walletIds } }
        );
        await postgresSequelize.query(
          'DELETE FROM corporate_benefit_authorizations WHERE wallet_id IN (:walletIds)',
          { replacements: { walletIds } }
        );
        await postgresSequelize.query(
          'DELETE FROM employee_benefit_wallets WHERE id IN (:walletIds)',
          { replacements: { walletIds } }
        );
      }
      await postgresSequelize.query(
        'DELETE FROM corporate_benefit_programs WHERE id = :programId AND name LIKE :marker',
        { replacements: { programId, marker: 'E2E-SETTLE-TEST-%' } }
      );
      console.log('🧹 Test data cleaned up');
    }
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError.message);
  }
  await postgresSequelize.close();
  process.exit(failures === 0 ? 0 : 1);
}

