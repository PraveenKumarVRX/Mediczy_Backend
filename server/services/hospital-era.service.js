/**
 * Hospital ERA (835) posting — Phase 1
 */
import pool from '../db/pgPool.js';
import * as hospitalBilling from './hospital-billing.service.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

export async function postEraRemittance(hospitalId, era, actor) {
  const parsed = typeof era === 'string' ? JSON.parse(era) : (era || {});
  const {
    claimNumber, patientId, paidAmount, invoiceId, checkNumber, payerName,
    adjustments = [], claimId,
  } = parsed;

  // insurance_claims has row-level security (organization_id); era_remittances
  // does not. Run the whole posting on one client with RLS context set once —
  // it's a no-op for the non-RLS table and required for the claim lookup/update
  // below, which were previously silent no-ops (RLS-blocked SELECT always
  // returned zero rows) and, worse, referenced total_paid/total_claimed
  // columns that don't exist on insurance_claims at all.
  const { claim, eraRow, insurancePaid } = await withRlsTransaction(
    pool,
    { orgId: hospitalId, userId: actor?.id || actor?.actorId || 0, isPlatformAdmin: false },
    async (client) => {
      let claimRow = null;
      if (claimId) {
        const cr = await client.query(`SELECT * FROM insurance_claims WHERE id = $1 AND hospital_id = $2`, [claimId, hospitalId]);
        claimRow = cr.rows[0];
      } else if (claimNumber) {
        const cr = await client.query(`SELECT * FROM insurance_claims WHERE claim_number = $1 AND hospital_id = $2`, [claimNumber, hospitalId]);
        claimRow = cr.rows[0];
      }

      const resolvedPatientId = patientId || claimRow?.patient_id;
      if (!resolvedPatientId) throw new Error('Patient not resolved from ERA');

      const resolvedInvoiceId = invoiceId || claimRow?.invoice_id || null;
      const paid = Number(paidAmount ?? parsed.totalPaid ?? 0);
      const adjustmentTotal = adjustments.reduce((s, a) => s + Number(a.amount || 0), 0);

      const era = await client.query(
        `INSERT INTO era_remittances
           (hospital_id, claim_id, invoice_id, payer_name, check_number, payment_amount, adjustment_amount, patient_responsibility, raw_payload, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING *`,
        [
          hospitalId, claimRow?.id || null, resolvedInvoiceId,
          payerName || parsed.payerName || null, checkNumber || parsed.checkNumber || null,
          paid, adjustmentTotal, parsed.patientResponsibility || 0, JSON.stringify(parsed),
        ]
      );

      if (claimRow?.id && paid > 0) {
        await client.query(
          `UPDATE insurance_claims
           SET settled_amount = COALESCE(settled_amount,0) + $2,
               status = CASE WHEN COALESCE(settled_amount,0) + $2 >= COALESCE(claim_amount,0) THEN 'paid' ELSE status END,
               settlement_status = CASE WHEN COALESCE(settled_amount,0) + $2 >= COALESCE(claim_amount,0) THEN 'settled' ELSE 'partial' END,
               updated_at = NOW()
           WHERE id = $1`,
          [claimRow.id, paid]
        );
      }

      return { claim: claimRow, eraRow: era, insurancePaid: paid };
    }
  );

  const resolvedInvoiceId = invoiceId || claim?.invoice_id || null;

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

export async function listEraPostings(hospitalId, { limit = 50, patientId, userId = 0 } = {}) {
  // The LEFT JOIN touches insurance_claims (RLS), so without context this
  // always came back with c.patient_id = NULL — silently defeating the
  // patientId filter and losing claim linkage in the response.
  return withRlsTransaction(pool, { orgId: hospitalId, userId, isPlatformAdmin: false }, async (client) => {
    const r = await client.query(
      `SELECT e.*, c.patient_id, c.claim_number FROM era_remittances e
       LEFT JOIN insurance_claims c ON c.id = e.claim_id
       WHERE e.hospital_id = $1 AND ($2::int IS NULL OR c.patient_id = $2)
       ORDER BY e.posted_at DESC LIMIT $3`,
      [hospitalId, patientId || null, limit]
    );
    return r.rows;
  });
}

export default { postEraRemittance, listEraPostings };
