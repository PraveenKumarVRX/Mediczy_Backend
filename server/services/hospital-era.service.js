/**
 * Hospital ERA (835) posting — Phase 1
 */
import pool from '../db/pgPool.js';
import * as hospitalBilling from './hospital-billing.service.js';

export async function postEraRemittance(hospitalId, era, actor) {
  const parsed = typeof era === 'string' ? JSON.parse(era) : (era || {});
  const {
    claimNumber, patientId, paidAmount, invoiceId, checkNumber, payerName,
    adjustments = [], claimId,
  } = parsed;

  let claim = null;
  if (claimId) {
    const cr = await pool.query(`SELECT * FROM insurance_claims WHERE id = $1 AND hospital_id = $2`, [claimId, hospitalId]);
    claim = cr.rows[0];
  } else if (claimNumber) {
    const cr = await pool.query(`SELECT * FROM insurance_claims WHERE claim_number = $1 AND hospital_id = $2`, [claimNumber, hospitalId]);
    claim = cr.rows[0];
  }

  const resolvedPatientId = patientId || claim?.patient_id;
  if (!resolvedPatientId) throw new Error('Patient not resolved from ERA');

  const resolvedInvoiceId = invoiceId || claim?.invoice_id || null;
  const insurancePaid = Number(paidAmount ?? parsed.totalPaid ?? 0);
  const adjustmentTotal = adjustments.reduce((s, a) => s + Number(a.amount || 0), 0);

  const eraRow = await pool.query(
    `INSERT INTO era_remittances
       (hospital_id, claim_id, invoice_id, payer_name, check_number, payment_amount, adjustment_amount, patient_responsibility, raw_payload, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING *`,
    [
      hospitalId, claim?.id || null, resolvedInvoiceId,
      payerName || parsed.payerName || null, checkNumber || parsed.checkNumber || null,
      insurancePaid, adjustmentTotal, parsed.patientResponsibility || 0, JSON.stringify(parsed),
    ]
  );

  if (claim?.id && insurancePaid > 0) {
    await pool.query(
      `UPDATE insurance_claims
       SET total_paid = COALESCE(total_paid,0) + $2,
           status = CASE WHEN COALESCE(total_paid,0) + $2 >= COALESCE(total_claimed,0) THEN 'paid' ELSE 'partial' END,
           updated_at = NOW()
       WHERE id = $1`,
      [claim.id, insurancePaid]
    );
  }

  if (insurancePaid > 0 && resolvedInvoiceId) {
    await hospitalBilling.recordPayment(hospitalId, resolvedInvoiceId, {
      paymentMethod: 'insurance',
      amount: insurancePaid,
      referenceNumber: checkNumber || `ERA-${eraRow.rows[0].id}`,
      insuranceClaimId: claim?.id || null,
      notes: `ERA posting claim ${claimNumber || claim?.claim_number || 'N/A'}`,
      receivedBy: actor?.id || actor?.actorId || null,
      receivedByName: actor?.name || 'ERA Auto-post',
    }, { actorId: actor?.id || actor?.actorId, req: actor?.req });
  }

  for (const adj of adjustments) {
    if (!adj.amount || !resolvedInvoiceId) continue;
    await hospitalBilling.createAdjustment(hospitalId, {
      invoiceId: resolvedInvoiceId,
      adjustmentType: adj.type || 'contractual',
      amount: Number(adj.amount),
      reason: adj.reason || 'ERA adjustment',
      approvedByName: actor?.name || 'ERA',
    }, actor);
  }

  await hospitalBilling.logBillingAudit({
    hospitalId,
    actorId: actor?.id || actor?.actorId,
    actorName: actor?.name,
    action: 'era.posted',
    resourceType: 'era_remittance',
    resourceId: String(eraRow.rows[0].id),
    afterState: { insurancePaid, claimNumber, checkNumber },
    req: actor?.req,
  });

  return {
    eraId: eraRow.rows[0].id,
    insurancePaid,
    claimId: claim?.id || null,
    invoiceId: resolvedInvoiceId,
    adjustmentsPosted: adjustments.length,
  };
}

export async function listEraPostings(hospitalId, { limit = 50, patientId } = {}) {
  const r = await pool.query(
    `SELECT e.*, c.patient_id FROM era_remittances e
     LEFT JOIN insurance_claims c ON c.id = e.claim_id
     WHERE e.hospital_id = $1 AND ($2::int IS NULL OR c.patient_id = $2)
     ORDER BY e.posted_at DESC LIMIT $3`,
    [hospitalId, patientId || null, limit]
  );
  return r.rows;
}

export default { postEraRemittance, listEraPostings };
