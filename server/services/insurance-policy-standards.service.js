const INSURANCE_POLICY_STANDARD_RULE = 'INS-ECARD-VALIDITY-2026-05';
const SUPPORTED_ECARD_POLICY_CATEGORIES = [
  'group_health_insurance',
  'group_health_insurance_with_op_wellness',
  'parents_health_insurance',
  'parents_health_insurance_with_op_wellness',
  'personal_health_insurance',
  'personal_health_insurance_with_op_wellness',
  'op_wellness_only'
];

const SUPPORTED_POLICY_CATEGORIES = [
  ...SUPPORTED_ECARD_POLICY_CATEGORIES,
  'group_personal_accident_gpa',
  'group_term_life_insurance'
];

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === 'string' && DATE_ONLY_RE.test(value.trim())) {
    const [year, month, day] = value.trim().split('-').map((x) => Number.parseInt(x, 10));
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function toDateOnlyString(dateValue) {
  const year = dateValue.getUTCFullYear();
  const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function deriveInclusiveOneYearEnd(startDate) {
  const nextYear = new Date(startDate.getTime());
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  nextYear.setUTCDate(nextYear.getUTCDate() - 1);
  return nextYear;
}

function deriveExactOneYearEnd(startDate) {
  const nextYear = new Date(startDate.getTime());
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  return nextYear;
}

function sameDate(a, b) {
  return a && b && a.getTime() === b.getTime();
}

export function classifyPolicyCategory({ policyName, planName, policyType } = {}) {
  const text = normalizeText([policyName, planName, policyType].filter(Boolean).join(' '));
  if (!text) return null;

  if (
    /(group\s+health\s+insurance)/.test(text) &&
    /(op\s*&\s*wellness|op\s+and\s+wellness|opd\s*&\s*wellness|opd\s+and\s+wellness)/.test(text)
  ) {
    return 'group_health_insurance_with_op_wellness';
  }

  if (
    /(parents?\s+health\s+insurance)/.test(text) &&
    /(op\s*&\s*wellness|op\s+and\s+wellness|opd\s*&\s*wellness|opd\s+and\s+wellness)/.test(text)
  ) {
    return 'parents_health_insurance_with_op_wellness';
  }

  if (
    /(personal\s+health\s+insurance|individual\s+health\s+insurance)/.test(text) &&
    /(op\s*&\s*wellness|op\s+and\s+wellness|opd\s*&\s*wellness|opd\s+and\s+wellness)/.test(text)
  ) {
    return 'personal_health_insurance_with_op_wellness';
  }

  if (/^(op\s*&\s*wellness\s*only|op\s+and\s+wellness\s*only|opd\s*&\s*wellness\s*only|opd\s+and\s+wellness\s*only)$/.test(text)) {
    return 'op_wellness_only';
  }

  if (/(group\s+health\s+insurance|\bghi\b)/.test(text)) return 'group_health_insurance';
  if (/(parents?\s+health\s+insurance|parents?\s+policy)/.test(text)) return 'parents_health_insurance';
  if (/(personal\s+health\s+insurance|individual\s+health\s+insurance)/.test(text)) return 'personal_health_insurance';
  if (/(group\s+personal\s+accident|\bgpa\b)/.test(text)) return 'group_personal_accident_gpa';
  if (/(group\s+term\s+life\s+insurance|\bgtl\b)/.test(text)) return 'group_term_life_insurance';

  return null;
}

export function isECardEligiblePolicy({ policyName, planName, policyType } = {}) {
  const category = classifyPolicyCategory({ policyName, planName, policyType });
  return Boolean(category && SUPPORTED_ECARD_POLICY_CATEGORIES.includes(category));
}

function toPolicyCategoryLabel(category) {
  return String(category || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function supportedPolicyCategoryLabels() {
  return SUPPORTED_POLICY_CATEGORIES.map(toPolicyCategoryLabel).join(', ');
}

export function enforceInsurancePolicyStandards({
  policyNumber,
  policyName,
  planName,
  policyType,
  startDate,
  endDate,
  requestedECardAvailable,
  metadata,
  strictPolicyCategory = true,
  autoAssignStartDate = false,
  autoAssignEndDate = true
} = {}) {
  const normalizedPolicyNumber = String(policyNumber || '').trim();
  if (!normalizedPolicyNumber) {
    return { valid: false, message: 'Policy number is required and must be unique.' };
  }

  let normalizedStart = toDateOnly(startDate);
  let normalizedEnd = toDateOnly(endDate);

  if (!normalizedStart && autoAssignStartDate) {
    const now = new Date();
    normalizedStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  if (!normalizedStart) {
    return { valid: false, message: 'Policy start date is required.' };
  }

  if (!normalizedEnd && autoAssignEndDate) {
    normalizedEnd = deriveInclusiveOneYearEnd(normalizedStart);
  }

  if (!normalizedEnd) {
    return { valid: false, message: 'Policy end date is required.' };
  }

  if (normalizedEnd < normalizedStart) {
    return { valid: false, message: 'Policy end date cannot be before start date.' };
  }

  const expectedInclusiveEnd = deriveInclusiveOneYearEnd(normalizedStart);
  const expectedExactEnd = deriveExactOneYearEnd(normalizedStart);
  const isOneYearValidity = sameDate(normalizedEnd, expectedInclusiveEnd) || sameDate(normalizedEnd, expectedExactEnd);

  if (!isOneYearValidity) {
    return {
      valid: false,
      message: 'Policy validity must be exactly 1 year from policy start date.'
    };
  }

  const policyCategory = classifyPolicyCategory({ policyName, planName, policyType });
  if (strictPolicyCategory && !policyCategory) {
    return {
      valid: false,
      message: `Policy category is not recognized. Allowed categories: ${supportedPolicyCategoryLabels()}.`
    };
  }

  const isSupportedCategory = Boolean(policyCategory && SUPPORTED_POLICY_CATEGORIES.includes(policyCategory));
  if (strictPolicyCategory && !isSupportedCategory) {
    return {
      valid: false,
      message: `Policy category is not recognized. Allowed categories: ${supportedPolicyCategoryLabels()}.`
    };
  }

  const eCardApplicable = Boolean(policyCategory && SUPPORTED_ECARD_POLICY_CATEGORIES.includes(policyCategory));
  if (requestedECardAvailable === true && !eCardApplicable) {
    return {
      valid: false,
      message: 'E-card is not available for this policy type as per standard rule.'
    };
  }

  const eCardAvailable = eCardApplicable;

  return {
    valid: true,
    normalized: {
      policyNumber: normalizedPolicyNumber,
      policyStartDate: toDateOnlyString(normalizedStart),
      policyEndDate: toDateOnlyString(normalizedEnd),
      validFrom: toDateOnlyString(normalizedStart),
      validUpto: toDateOnlyString(normalizedEnd),
      policyCategory,
      eCardApplicable,
      eCardAvailable,
      metadata: {
        ...(metadata || {}),
        policyStandards: {
          ruleCode: INSURANCE_POLICY_STANDARD_RULE,
          policyNumberRequired: true,
          validityYears: 1,
          strictPolicyCategory,
          policyCategory,
          eCardApplicable,
          eCardAvailable
        }
      }
    }
  };
}

export default {
  classifyPolicyCategory,
  isECardEligiblePolicy,
  enforceInsurancePolicyStandards,
  SUPPORTED_ECARD_POLICY_CATEGORIES,
  SUPPORTED_POLICY_CATEGORIES
};
