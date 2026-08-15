/**
 * Claims Rules Engine
 * ===================
 * Deterministic pre-submission validation for insurance claims — required-field
 * completeness and policy-limit sanity checks, run before a claim is allowed
 * to move from 'draft' to 'submitted'. This is administrative claims
 * automation (matching a payer's documentation requirements), not a clinical
 * decision, so it does not go through the SaMD interpretability/quality-gate
 * pipeline in ai-quality-gates.service.js — that pipeline is reserved for AI
 * outputs that influence a clinical decision (see CLAUDE.md SaMD table).
 *
 * Two severities:
 *  - errors:   block submission outright (missing data payers will reject for)
 *  - warnings: surfaced to staff but do not block (heuristics we can't verify
 *              without a real per-policy master — see ROOM_RENT_ADVISORY below)
 */

const DOCUMENTS_BY_CLAIM_TYPE = {
  cashless: ['discharge_summary', 'bills'],
  reimbursement: ['discharge_summary', 'bills', 'prescription'],
  emergency: ['discharge_summary'],
};

// Health-insurance room-rent capping is real and common in Indian retail
// policies (a % of sum insured, or "no more than X category"), but Mediczy has
// no live per-policy master to check the patient's actual entitlement against.
// These are typical/default advisories per insurer, surfaced as warnings for
// staff judgement — not hard blocks — until real policy-master data exists.
const ROOM_RENT_ADVISORY = {
  'star health': 'Star Health retail policies commonly cap room rent at 1% of sum insured — verify before submission if room category is Deluxe/Suite.',
  'niva bupa': 'Niva Bupa policies may apply proportionate deduction on room rent above the policy sub-limit — verify room category against the patient\'s plan.',
  'care health': 'Care Health (Religare) plans often have no room-rent capping, but verify the specific plan variant.',
  'icici lombard': 'ICICI Lombard policies may cap room rent by plan tier — verify before submission if room category is Deluxe/Suite.',
  'hdfc ergo': 'HDFC Ergo policies may apply room-rent sub-limits on older/entry plans — verify room category.',
};

// insurerCode-keyed variant (matches the values the pre-auth request form and
// pdf-generator.service.js's TPA_CONFIG use) — same underlying business rule
// as ROOM_RENT_ADVISORY above, extended to the full payer list the pre-auth
// form offers, plus a distinct note for government schemes (package-rate
// tariffs, not %-of-sum-insured capping — a different mechanism entirely).
export const ROOM_RENT_ADVISORY_BY_CODE = {
  star_health: 'Retail policies commonly cap room rent at 1% of sum insured — verify before confirming Deluxe/Suite category.',
  niva_bupa: 'May apply proportionate deduction on room rent above the policy sub-limit — verify against the patient\'s plan.',
  care_health: 'Often no room-rent capping, but verify the specific plan variant before confirming a premium category.',
  icici_lombard: 'May cap room rent by plan tier — verify before confirming Deluxe/Suite category.',
  hdfc_ergo: 'May apply room-rent sub-limits on older/entry plans — verify room category before confirming.',
  bajaj_allianz: 'Room-rent eligibility is plan-tier dependent — verify before confirming a premium category.',
  manipal_cigna: 'Some plans apply room-rent sub-limits — verify against the patient\'s plan tier.',
  tata_aig: 'TPA-routed (TTK) — room-rent capping is plan-tier dependent; confirm with TTK before a premium category.',
  reliance: 'TPA-routed (Paramount) — verify room-rent sub-limit with Paramount before confirming a premium category.',
  go_digit: 'TPA-routed (MD India) — verify room-rent sub-limit before confirming a premium category.',
  national: 'TPA-routed (Safeway) — public-sector plans commonly apply room-rent sub-limits; verify before confirming.',
  united_india: 'TPA-routed (Health India) — public-sector plans commonly apply room-rent sub-limits; verify before confirming.',
  new_india: 'TPA-routed (Health India) — public-sector plans commonly apply room-rent sub-limits; verify before confirming.',
  oriental: 'TPA-routed (East West) — public-sector plans commonly apply room-rent sub-limits; verify before confirming.',
  cghs: 'CGHS pays fixed package rates per treatment category, not itemized room/ICU tariffs — the cost breakup below is an internal estimate only; confirm the applicable CGHS package rate before admission.',
  esic: 'ESIC pays fixed package rates per treatment category, not itemized room/ICU tariffs — the cost breakup below is an internal estimate only; confirm the applicable ESIC schedule rate before admission.',
};

export function getRoomRentAdvisory(insurerCode) {
  return ROOM_RENT_ADVISORY_BY_CODE[String(insurerCode || '').trim().toLowerCase()] || null;
}

const HIGH_VALUE_CLAIM_THRESHOLD = 500000; // ₹5,00,000 — typical additional-authorization trigger

function pushError(errors, field, code, message) {
  errors.push({ field, code, message });
}

function pushWarning(warnings, field, code, message) {
  warnings.push({ field, code, message });
}

/**
 * @param {object} claim - InsuranceClaim instance or plain object
 * @param {object} [context]
 * @param {object|null} [context.preAuth] - linked PreAuthorization, if claim.preAuthId is set
 * @returns {{ canSubmit: boolean, errors: Array, warnings: Array }}
 */
export function validateClaimForSubmission(claim, context = {}) {
  const errors = [];
  const warnings = [];
  const c = claim?.toJSON ? claim.toJSON() : claim;

  // ── Required fields ──
  if (!c.patientId) pushError(errors, 'patientId', 'REQUIRED', 'Patient is not linked to this claim.');
  if (!c.policyNumber || !String(c.policyNumber).trim()) pushError(errors, 'policyNumber', 'REQUIRED', 'Policy number is required.');
  if (!c.insuranceProvider || !String(c.insuranceProvider).trim()) pushError(errors, 'insuranceProvider', 'REQUIRED', 'Insurer/TPA name is required.');
  if (!(Number(c.claimAmount) > 0)) pushError(errors, 'claimAmount', 'REQUIRED', 'Claim amount must be greater than zero.');
  if (!c.diagnosis || !String(c.diagnosis).trim()) pushError(errors, 'diagnosis', 'REQUIRED', 'Diagnosis is required.');

  const hospDetails = c.hospitalizationDetails || {};
  if (!hospDetails.ward && !hospDetails.roomCategory) {
    pushError(errors, 'hospitalizationDetails.ward', 'REQUIRED', 'Ward/room category is required.');
  }
  if (!hospDetails.admissionDate) {
    pushWarning(warnings, 'hospitalizationDetails.admissionDate', 'MISSING_ADMISSION_DATE', 'Admission date is not recorded — most payers require it.');
  }

  // ── Document completeness ──
  const requiredDocs = Array.isArray(c.requiredDocuments) && c.requiredDocuments.length
    ? c.requiredDocuments
    : (DOCUMENTS_BY_CLAIM_TYPE[c.claimType] || DOCUMENTS_BY_CLAIM_TYPE.cashless);
  const uploadedTypes = new Set((c.documents || []).map((d) => d.type));
  const mandatoryForType = DOCUMENTS_BY_CLAIM_TYPE[c.claimType] || DOCUMENTS_BY_CLAIM_TYPE.cashless;
  const missingMandatory = mandatoryForType.filter((d) => !uploadedTypes.has(d));
  const missingOptional = requiredDocs.filter((d) => !mandatoryForType.includes(d) && !uploadedTypes.has(d));

  missingMandatory.forEach((docType) => {
    pushError(errors, `documents.${docType}`, 'MISSING_DOCUMENT', `${docType.replace(/_/g, ' ')} is required for a ${c.claimType || 'cashless'} claim and has not been uploaded.`);
  });
  missingOptional.forEach((docType) => {
    pushWarning(warnings, `documents.${docType}`, 'MISSING_OPTIONAL_DOCUMENT', `${docType.replace(/_/g, ' ')} is commonly requested by payers and has not been uploaded yet.`);
  });

  // ── Policy-limit checks ──
  const preAuth = context.preAuth;
  if (c.preAuthId && preAuth) {
    const approvedCeiling = Number(preAuth.approvedAmount) || Number(preAuth.estimatedAmount) || null;
    if (approvedCeiling != null) {
      const tolerance = approvedCeiling * 1.1; // 10% tolerance for last-mile bill items
      if (Number(c.claimAmount) > tolerance) {
        pushError(
          errors,
          'claimAmount',
          'EXCEEDS_PREAUTH_APPROVAL',
          `Claim amount (₹${Number(c.claimAmount).toLocaleString('en-IN')}) exceeds the pre-authorized/approved amount (₹${approvedCeiling.toLocaleString('en-IN')}) by more than 10% — the insurer will very likely raise a query or reject on this mismatch alone.`
        );
      } else if (Number(c.claimAmount) > approvedCeiling) {
        pushWarning(
          warnings,
          'claimAmount',
          'ABOVE_PREAUTH_APPROVAL',
          `Claim amount is ₹${(Number(c.claimAmount) - approvedCeiling).toLocaleString('en-IN')} above the pre-authorized amount — keep supporting bills ready in case of a query.`
        );
      }
    }
  }

  if (Number(c.claimAmount) >= HIGH_VALUE_CLAIM_THRESHOLD) {
    pushWarning(
      warnings,
      'claimAmount',
      'HIGH_VALUE_CLAIM',
      `Claim amount is ₹${Number(c.claimAmount).toLocaleString('en-IN')} or above — many payers require additional authorization/medical justification for high-value claims.`
    );
  }

  const insurerKey = String(c.insuranceProvider || '').trim().toLowerCase();
  const roomAdvisory = ROOM_RENT_ADVISORY[insurerKey];
  if (roomAdvisory && (hospDetails.roomCategory || hospDetails.ward)) {
    pushWarning(warnings, 'hospitalizationDetails.roomCategory', 'ROOM_RENT_ADVISORY', roomAdvisory);
  }

  return { canSubmit: errors.length === 0, errors, warnings };
}

export default { validateClaimForSubmission, getRoomRentAdvisory };
