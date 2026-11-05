/**
 * One-off: cancel the 4 visible junk prescriptions on the demo account (user@mediczy.com, id 19)
 * so MyPrescriptions is clean. They are empty/test templates ("To be filled by doctor", "dsf",
 * "Smoke test diagnosis"). 'cancelled' is excluded by GET /prescriptions/patient. Reversible.
 * prescriptions enforces FORCE RLS, so this runs under a platform-admin RLS context.
 *
 * Run:  node server/scripts/ssm-env-loader.mjs server/scripts/clear-demo-prescriptions.mjs
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

const tx = await postgresSequelize.transaction();
try {
  await setRlsContext(tx, { orgId: 0, userId: 19, isPlatformAdmin: true });
  let newStatus = 'cancelled';
  let updated;
  try {
    [, updated] = await postgresSequelize.query(
      `UPDATE prescriptions SET status='cancelled', "updatedAt"=NOW() WHERE "patientId"=19 AND id = ANY(ARRAY[83,71,49,27])`,
      { transaction: tx }
    );
  } catch {
    newStatus = 'draft';
    [, updated] = await postgresSequelize.query(
      `UPDATE prescriptions SET status='draft', "updatedAt"=NOW() WHERE "patientId"=19 AND id = ANY(ARRAY[83,71,49,27])`,
      { transaction: tx }
    );
  }
  const [after] = await postgresSequelize.query(
    `SELECT count(*) n FROM prescriptions WHERE "patientId"=19 AND status IN ('issued','active','dispensed','expired')`,
    { transaction: tx }
  );
  await tx.commit();
  console.log(`prescriptions set to '${newStatus}'; visible (non-draft) for demo account now = ${after[0].n}`);
} catch (e) {
  await tx.rollback().catch(() => {});
  console.log('ERROR:', e.message);
  process.exitCode = 1;
}
process.exit();
