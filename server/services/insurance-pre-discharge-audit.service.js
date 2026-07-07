/**
 * Pre-Discharge Audit
 * ===================
 * The insurance-desk sign-off that has to happen before ward staff are told
 * they can discharge a cashless patient. Five checks, each backed by real
 * billing/insurance data already in the system — not a fabricated "policy
 * master" lookup:
 *
 *  1. Advance paid            — hospital_payments vs the admission estimate's patient_liability
 *  2. Non-medical cleared     — hospital_invoice_lines marked insurance_payable=false, vs payments received
 *  3. Excess amount cleared   — invoice patient_liability (or projected shortfall pre-invoice) vs payments received
 *  4. Within credit limit     — hospital_credit_accounts.balance + this approval vs credit_limit
 *  5. Claim admissibility     — reuses claims-rules-engine.service.js against the pre-auth's own data,
 *                               plus requiring the pre-auth itself to be insurer-approved
 *
 * Each check reports 'pass' | 'fail' | 'warning' | 'not_applicable' — 'fail'
 * blocks discharge clearance; 'warning'/'not_applicable' do not. This mirrors
 * the errors/warnings split in claims-rules-engine.service.js.
 */

import pool from '../db/pgPool.js';
import { listInvoices, listPayments, getInvoice } from './hospital-billing.service.js';
import { validateClaimForSubmission } from './claims-rules-engine.service.js';

function money(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
}

function check(key, label, status, detail, extra = {}) {
  return { key, label, status, detail, ...extra };
}

/**
 * Adapts a PreAuthorization's fields into the shape claims-rules-engine.service.js
 * expects, so admissibility is judged with the exact same logic a real claim
 * submission would be — no separate/duplicated rule set to drift out of sync.
 */
function projectPreAuthAsClaim(preAuth) {
  return {
    patientId: preAuth.patientId,
    policyNumber: preAuth.policyNumber,
    insuranceProvider: preAuth.admissionDetails?.insurer || null,
    claimAmount: Number(preAuth.approvedAmount) || Number(preAuth.estimatedAmount) || 0,
    diagnosis: preAuth.diagnosis,
    hospitalizationDetails: preAuth.admissionDetails || {},
    documents: preAuth.documents || [],
    claimType: 'cashless',
    requiredDocuments: null,
    preAuthId: null,
  };
}

export async function runPreDischargeAudit(hospitalId, preAuth) {
  const patientId = preAuth.patientId;
  const checks = [];

  // ── 1 & pull billing context up front ──
  const [payments, invoices, estimateRes, creditRes] = await Promise.all([
    listPayments(hospitalId, { patientId, limit: 200 }),
    listInvoices(hospitalId, { patientId, limit: 5 }),
    pool.query(
      `SELECT * FROM billing_estimates WHERE organization_id = $1 AND patient_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [hospitalId, patientId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT * FROM hospital_credit_accounts WHERE hospital_id = $1 AND patient_id = $2`,
      [hospitalId, patientId]
    ).catch(() => ({ rows: [] })),
  ]);

  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const estimate = estimateRes.rows[0] || null;
  const latestInvoiceSummary = invoices[0] || null;
  const latestInvoice = latestInvoiceSummary ? await getInvoice(hospitalId, latestInvoiceSummary.id) : null;

  // ── Check 1: advance paid ──
  if (estimate && Number(estimate.patient_liability) > 0) {
    if (totalPaid >= Number(estimate.patient_liability)) {
      checks.push(check('advance_paid', 'Advance payment collected', 'pass',
        `${money(totalPaid)} received against an estimated patient liability of ${money(estimate.patient_liability)}.`));
    } else {
      checks.push(check('advance_paid', 'Advance payment collected', 'fail',
        `Only ${money(totalPaid)} received so far against an estimated patient liability of ${money(estimate.patient_liability)} — ${money(Number(estimate.patient_liability) - totalPaid)} shortfall.`,
        { shortfall: Number(estimate.patient_liability) - totalPaid }));
    }
  } else if (totalPaid > 0) {
    checks.push(check('advance_paid', 'Advance payment collected', 'pass', `${money(totalPaid)} received. No pre-admission estimate on file to compare against.`));
  } else {
    checks.push(check('advance_paid', 'Advance payment collected', 'warning', 'No payments recorded yet and no pre-admission estimate on file — confirm with the front desk before clearing.'));
  }

  // ── Check 2: non-medical expenses cleared ──
  if (latestInvoice) {
    const nonMedicalAmount = (latestInvoice.lines || [])
      .filter((l) => l.insurance_payable === false)
      .reduce((s, l) => s + Number(l.line_total || 0), 0);
    if (nonMedicalAmount === 0) {
      checks.push(check('non_medical_cleared', 'Non-medical expenses cleared', 'not_applicable', 'No line items on the latest bill are marked non-insurance-payable.'));
    } else if (Number(latestInvoice.amount_paid) >= nonMedicalAmount) {
      checks.push(check('non_medical_cleared', 'Non-medical expenses cleared', 'pass',
        `${money(nonMedicalAmount)} in non-medical/excluded items is covered by the ${money(latestInvoice.amount_paid)} already paid.`));
    } else {
      checks.push(check('non_medical_cleared', 'Non-medical expenses cleared', 'fail',
        `${money(nonMedicalAmount)} in non-medical/excluded items on the bill (bill #${latestInvoice.bill_number}) — only ${money(latestInvoice.amount_paid)} paid so far.`,
        { nonMedicalAmount }));
    }
  } else {
    checks.push(check('non_medical_cleared', 'Non-medical expenses cleared', 'warning', 'No finalized bill yet — non-medical/excluded items cannot be confirmed until billing raises the invoice.'));
  }

  // ── Check 3: excess amount (beyond insurance approval) cleared ──
  const approvedCeiling = Number(preAuth.approvedAmount) || Number(preAuth.estimatedAmount) || 0;
  if (latestInvoice) {
    const excess = Number(latestInvoice.patient_liability) || 0;
    if (excess === 0) {
      checks.push(check('excess_amount_cleared', 'Excess amount beyond insurance approval cleared', 'not_applicable', 'The bill total is fully within the insurance-covered amount — no patient excess.'));
    } else if (Number(latestInvoice.amount_paid) >= excess) {
      checks.push(check('excess_amount_cleared', 'Excess amount beyond insurance approval cleared', 'pass',
        `${money(excess)} excess over insurance is covered by the ${money(latestInvoice.amount_paid)} already paid.`));
    } else {
      checks.push(check('excess_amount_cleared', 'Excess amount beyond insurance approval cleared', 'fail',
        `Bill #${latestInvoice.bill_number} leaves ${money(excess)} as patient liability beyond insurance — only ${money(latestInvoice.amount_paid)} paid so far.`,
        { excess, shortfall: excess - Number(latestInvoice.amount_paid) }));
    }
  } else {
    checks.push(check('excess_amount_cleared', 'Excess amount beyond insurance approval cleared', 'warning',
      `No finalized bill yet — this can only be confirmed once billing raises the final invoice against the ${money(approvedCeiling)} approved amount.`));
  }

  // ── Check 4: within hospital credit limit ──
  const credit = creditRes.rows[0] || null;
  if (!credit || !(Number(credit.credit_limit) > 0)) {
    checks.push(check('credit_limit_ok', 'Insurance approval within hospital credit limit', 'not_applicable', 'No hospital credit account/limit configured for this patient.'));
  } else {
    const projectedBalance = Number(credit.balance || 0) + approvedCeiling;
    if (projectedBalance <= Number(credit.credit_limit)) {
      checks.push(check('credit_limit_ok', 'Insurance approval within hospital credit limit', 'pass',
        `Projected exposure ${money(projectedBalance)} is within the ${money(credit.credit_limit)} credit limit for this patient.`));
    } else {
      checks.push(check('credit_limit_ok', 'Insurance approval within hospital credit limit', 'fail',
        `Projected exposure ${money(projectedBalance)} exceeds the ${money(credit.credit_limit)} credit limit by ${money(projectedBalance - Number(credit.credit_limit))} — get credit-limit enhancement or partial cash settlement before clearing.`,
        { over: projectedBalance - Number(credit.credit_limit) }));
    }
  }

  // ── Check 5: claim admissibility / policy conditions ──
  if (preAuth.status !== 'approved') {
    checks.push(check('claim_admissibility', 'Claim admissibility / policy conditions', 'fail',
      `Pre-authorization status is "${preAuth.status}", not approved — there is no confirmed insurer commitment yet.`));
  } else {
    const validation = validateClaimForSubmission(projectPreAuthAsClaim(preAuth));
    if (validation.errors.length === 0) {
      checks.push(check('claim_admissibility', 'Claim admissibility / policy conditions', validation.warnings.length ? 'warning' : 'pass',
        validation.warnings.length
          ? `Admissible, with ${validation.warnings.length} advisory item(s): ${validation.warnings.map((w) => w.message).join(' ')}`
          : 'All required fields and policy-limit checks pass — no reason on file for the insurer to reject or query this claim.',
        { warnings: validation.warnings }));
    } else {
      checks.push(check('claim_admissibility', 'Claim admissibility / policy conditions', 'fail',
        `${validation.errors.length} admissibility issue(s): ${validation.errors.map((e) => e.message).join(' ')}`,
        { errors: validation.errors }));
    }
  }

  const canClearDischarge = checks.every((c) => c.status !== 'fail');

  return {
    canClearDischarge,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

export default { runPreDischargeAudit };
