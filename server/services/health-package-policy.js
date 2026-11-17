export const BENEFICIARY_RELATIONS = Object.freeze(['self', 'spouse', 'child', 'parent', 'parent_in_law', 'sibling']);
export function eligibleRelations(metadata = {}) {
  const configured = metadata.eligibleRelations;
  return configured === undefined ? ['self'] : (Array.isArray(configured) ? [...new Set(configured.filter(r => BENEFICIARY_RELATIONS.includes(r)))] : []);
}
export function validRelations(relations) {
  return Array.isArray(relations) && relations.length > 0 && relations.every(r => BENEFICIARY_RELATIONS.includes(r));
}

/** 'Lifetime' | '<n> Year(s)' | '<n> Day(s)' — day-granularity added for short-window
 * corporate benefits (e.g. a 45-day deadline to use a one-time health checkup). */
const VALIDITY_PERIOD_RE = /^([1-9]\d*)\s*(Year|Years|Day|Days)$/i;

export function isValidValidityPeriod(validityPeriod) {
  return validityPeriod === 'Lifetime' || VALIDITY_PERIOD_RE.test(String(validityPeriod || '').trim());
}

/**
 * Converts a package's validityPeriod into the { years, days } replacements expected by
 * `CASE WHEN :years = 0 AND :days = 0 THEN NULL ELSE CURRENT_DATE+make_interval(years=>:years,days=>:days) END`.
 * 'Lifetime' (or anything unparseable, defensively) yields {0,0} -> NULL -> never expires.
 */
export function validityPeriodToInterval(validityPeriod) {
  const match = VALIDITY_PERIOD_RE.exec(String(validityPeriod || '').trim());
  if (!match) return { years: 0, days: 0 };
  const amount = parseInt(match[1], 10);
  return match[2].toLowerCase().startsWith('year') ? { years: amount, days: 0 } : { years: 0, days: amount };
}

/**
 * Which employee workflow a corporate health package belongs to. The employee app lists only
 * 'annual_benefit' packages as bookable check-ups (routes/health-checkup.route.js). The class is read
 * from metadata.workflowClass, or from the legacy features.type ('annual', 'pre_employment', 'periodic').
 */
export const WORKFLOW_CLASSES = Object.freeze(['annual_benefit', 'pre_employment_service', 'periodic_service']);
const LEGACY_WORKFLOW = { annual: 'annual_benefit', pre_employment: 'pre_employment_service', periodic: 'periodic_service' };
const asObject = (v) => { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const x = JSON.parse(v); return x && typeof x === 'object' ? x : {}; } catch { return {}; } };
export function packageWorkflowClass(row = {}) {
  const metadata = asObject(row.metadata);
  const features = asObject(row.features);
  const raw = String(metadata.workflowClass || metadata.workflow_class || features.workflowClass || features.workflow_class || features.type || '').trim().toLowerCase();
  return WORKFLOW_CLASSES.includes(raw) ? raw : (LEGACY_WORKFLOW[raw] || null);
}
