/**
 * Family coverage tiers for benefit plans.
 *
 * Owner decision (My SmartHealth, 2026-11-15): a corporate benefit plan covers
 * its members by COVERAGE TIER, not by a head count:
 *   employee                          - the employee only, no dependents
 *   employee_spouse_children          - at most 1 spouse and 2 children (son/daughter)
 *   employee_spouse_children_parents  - additionally at most 2 parents, taken EITHER
 *                                       from the employee's own parents (father/mother)
 *                                       OR from the parents-in-law, never a mix
 *
 * The tier is stored on the plan as metadata.familyCoverage (membership_plans and
 * subscription_plans). metadata is used rather than features because features is a
 * JSON array on several live plans and the team plan editors rewrite it. A tier in
 * features.familyCoverage (when features is an object) is read as a fallback.
 */

export const FAMILY_COVERAGE_TIERS = Object.freeze({
  employee: Object.freeze({
    label: 'Employee only',
    spouse: 0,
    children: 0,
    parents: 0
  }),
  employee_spouse_children: Object.freeze({
    label: 'Employee + spouse + 2 children',
    spouse: 1,
    children: 2,
    parents: 0
  }),
  employee_spouse_children_parents: Object.freeze({
    label: 'Employee + spouse + 2 children + 2 parents or parents-in-law',
    spouse: 1,
    children: 2,
    parents: 2
  })
});

export const FAMILY_COVERAGE_VALUES = Object.freeze(Object.keys(FAMILY_COVERAGE_TIERS));

/** Stored relationship values in each coverage group. */
export const RELATION_GROUPS = Object.freeze({
  spouse: Object.freeze(['spouse']),
  children: Object.freeze(['son', 'daughter']),
  parents: Object.freeze(['father', 'mother']),
  parentsInLaw: Object.freeze(['father_in_law', 'mother_in_law'])
});

export const IN_LAW_RELATIONSHIPS = RELATION_GROUPS.parentsInLaw;

/** 'spouse' | 'children' | 'parents' | 'parentsInLaw' | null for a stored relationship. */
export function relationGroupOf(relationship) {
  for (const [group, relations] of Object.entries(RELATION_GROUPS)) {
    if (relations.includes(relationship)) return group;
  }
  return null;
}

/**
 * A tier key for `value`; null when blank (no tier); undefined when it is not a tier.
 */
export function normalizeFamilyCoverage(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase().replace(/[\s+-]+/g, '_').replace(/_+/g, '_');
  if (!key) return null;
  return FAMILY_COVERAGE_VALUES.includes(key) ? key : undefined;
}

const parseJsonSafe = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * The plan's coverage tier key, or null when the plan defines none (an invalid
 * stored value counts as none).
 */
export function familyCoverageOf(plan) {
  if (!plan) return null;
  const metadata = parseJsonSafe(plan.metadata);
  const fromMetadata = metadata && !Array.isArray(metadata)
    ? normalizeFamilyCoverage(metadata.familyCoverage)
    : null;
  if (fromMetadata) return fromMetadata;
  const features = parseJsonSafe(plan.features);
  const fromFeatures = features && !Array.isArray(features)
    ? normalizeFamilyCoverage(features.familyCoverage)
    : null;
  return fromFeatures || null;
}

export function familyCoverageLabel(tier) {
  return FAMILY_COVERAGE_TIERS[tier]?.label || null;
}

/**
 * Validates a familyCoverage value sent by a plan editor.
 * { ok: true, value: <key|null> } or { ok: false, message }.
 */
export function parseFamilyCoverageInput(value) {
  const normalized = normalizeFamilyCoverage(value);
  if (normalized === undefined) {
    return {
      ok: false,
      message: `familyCoverage must be one of: ${FAMILY_COVERAGE_VALUES.join(', ')} (or empty for no tier)`
    };
  }
  return { ok: true, value: normalized };
}

/**
 * Reads and validates the tier from a plan-editor request body: a top-level
 * `familyCoverage`, `metadata.familyCoverage` or (object) `features.familyCoverage`.
 * Returns { present: false } when none was sent, { present: true, value } when one
 * was, or { error } when it is not a tier.
 */
export function familyCoverageFromPlanBody(body = {}) {
  const candidates = [];
  if (body && Object.prototype.hasOwnProperty.call(body, 'familyCoverage')) {
    candidates.push(body.familyCoverage);
  }
  const metadata = body?.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      && Object.prototype.hasOwnProperty.call(metadata, 'familyCoverage')) {
    candidates.push(metadata.familyCoverage);
  }
  const features = body?.features;
  if (features && typeof features === 'object' && !Array.isArray(features)
      && Object.prototype.hasOwnProperty.call(features, 'familyCoverage')) {
    candidates.push(features.familyCoverage);
  }
  if (candidates.length === 0) return { present: false };

  const parsed = candidates.map(parseFamilyCoverageInput);
  const bad = parsed.find((p) => !p.ok);
  if (bad) return { error: bad.message };
  const values = new Set(parsed.map((p) => p.value));
  if (values.size > 1) {
    return { error: 'familyCoverage was sent with conflicting values' };
  }
  return { present: true, value: parsed[0].value };
}

/** `metadata` (an object) with familyCoverage set to `value`, or removed when null. */
export function withFamilyCoverage(metadata, value) {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  if (value) base.familyCoverage = value;
  else delete base.familyCoverage;
  return base;
}

/** `features` without a familyCoverage key (the tier is kept in metadata only). */
export function withoutFamilyCoverage(features) {
  if (!features || typeof features !== 'object' || Array.isArray(features)
      || !Object.prototype.hasOwnProperty.call(features, 'familyCoverage')) {
    return features;
  }
  const { familyCoverage, ...rest } = features;
  return rest;
}
