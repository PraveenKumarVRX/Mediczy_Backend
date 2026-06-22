/**
 * GAP-BIL-003 — Discharge billing clearance automation
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

export async function evaluateBillingClearance(admissionId, organizationId) {
  const [estimate] = await sequelize.query(
    `SELECT * FROM billing_estimates WHERE admission_id = :admId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT },
  );

  const [pendingPharmacy] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM pharmacy_dispense_queue
     WHERE admission_id = :admId AND organization_id = :orgId AND status = 'pending'`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT },
  );

  const issues = [];
  if (!estimate) issues.push({ code: 'NO_ESTIMATE', message: 'No billing estimate on file' });
  if (estimate && estimate.status !== 'finalized' && estimate.status !== 'approved') {
    issues.push({ code: 'ESTIMATE_NOT_FINAL', message: 'Final bill not generated' });
  }
  if (pendingPharmacy?.c > 0) {
    issues.push({ code: 'PHARMACY_PENDING', message: `${pendingPharmacy.c} pharmacy dispense(s) pending` });
  }

  const cleared = issues.length === 0;
  return {
    admissionId,
    cleared,
    issues,
    estimateId: estimate?.id ?? null,
    totalAmount: estimate?.total_amount ?? null,
  };
}

export async function autoFinalizeEstimate(admissionId, organizationId, performedBy) {
  const clearance = await evaluateBillingClearance(admissionId, organizationId);
  if (!clearance.cleared) {
    const err = new Error('Billing clearance failed');
    err.issues = clearance.issues;
    throw err;
  }
  await sequelize.query(
    `UPDATE billing_estimates SET status = 'finalized', updated_at = NOW()
     WHERE admission_id = :admId AND organization_id = :orgId`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.UPDATE },
  );
  return { ...clearance, finalized: true, performedBy };
}
