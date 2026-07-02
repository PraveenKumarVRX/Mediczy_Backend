/**
 * GAP-BIL-003 — Discharge billing clearance + auto final bill
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import pool from '../db/pgPool.js';

const FINAL_ESTIMATE_STATUSES = new Set(['accepted', 'finalized', 'approved', 'shared']);

export async function evaluateBillingClearance(admissionId, organizationId) {
  const [estimate] = await sequelize.query(
    `SELECT * FROM billing_estimates
     WHERE admission_id = :admId AND organization_id = :orgId
     ORDER BY created_at DESC LIMIT 1`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );

  const [adm] = await sequelize.query(
    `SELECT patient_id, status FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );

  const [pendingPharmacy] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM pharmacy_dispense_queue
     WHERE admission_id = :admId AND organization_id = :orgId AND status = 'pending'`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  ).catch(() => [{ c: 0 }]);

  const openInvoices = await pool.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_due),0) AS due
     FROM hospital_invoices
     WHERE hospital_id = $1 AND admission_id = $2 AND status IN ('issued','partial','draft') AND voided_at IS NULL`,
    [organizationId, admissionId]
  );

  const issues = [];
  if (!adm) issues.push({ code: 'NO_ADMISSION', message: 'Admission not found' });
  if (!estimate) issues.push({ code: 'NO_ESTIMATE', message: 'No billing estimate on file' });
  if (estimate && !FINAL_ESTIMATE_STATUSES.has(estimate.status)) {
    issues.push({ code: 'ESTIMATE_NOT_FINAL', message: `Estimate status is ${estimate.status}` });
  }
  if (pendingPharmacy?.c > 0) {
    issues.push({ code: 'PHARMACY_PENDING', message: `${pendingPharmacy.c} pharmacy dispense(s) pending` });
  }
  if (Number(openInvoices.rows[0]?.due || 0) > 0) {
    issues.push({
      code: 'BALANCE_DUE',
      message: `Outstanding balance ₹${openInvoices.rows[0].due}`,
      amountDue: Number(openInvoices.rows[0].due)
    });
  }

  const cleared = issues.length === 0;
  return {
    admissionId,
    patientId: adm?.patient_id ?? estimate?.patient_id ?? null,
    cleared,
    issues,
    estimateId: estimate?.id ?? null,
    totalAmount: estimate?.total_estimate ?? null,
    openInvoiceCount: openInvoices.rows[0]?.c || 0,
    amountDue: Number(openInvoices.rows[0]?.due || 0)
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
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.UPDATE }
  );
  return { ...clearance, finalized: true, performedBy };
}

export async function ensureFinalBillForDischarge(admissionId, organizationId, performedBy) {
  const [adm] = await sequelize.query(
    `SELECT patient_id FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  if (!adm?.patient_id) throw new Error('Admission not found');

  const existing = await pool.query(
    `SELECT id FROM hospital_invoices
     WHERE hospital_id = $1 AND admission_id = $2 AND status NOT IN ('void','cancelled') AND voided_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [organizationId, admissionId]
  );
  if (existing.rows[0]) {
    return { invoiceId: existing.rows[0].id, created: false };
  }

  const { createInvoice } = await import('./hospital-billing.service.js');
  const result = await createInvoice(organizationId, {
    patientId: adm.patient_id,
    admissionId,
    billType: 'ipd_final',
    autoPgi: false,
    createdBy: performedBy
  }, { actorId: performedBy });

  await sequelize.query(
    `UPDATE billing_estimates SET status = 'finalized', updated_at = NOW()
     WHERE admission_id = :admId AND organization_id = :orgId`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.UPDATE }
  );

  return { invoiceId: result.invoice.id, billNumber: result.invoice.bill_number, created: true };
}

export async function runDischargeBillingGate(admissionId, organizationId, performedBy) {
  await ensureFinalBillForDischarge(admissionId, organizationId, performedBy);
  const clearance = await evaluateBillingClearance(admissionId, organizationId);
  if (!clearance.cleared) {
    const err = new Error('Billing clearance failed after final bill');
    err.issues = clearance.issues;
    throw err;
  }
  return clearance;
}
