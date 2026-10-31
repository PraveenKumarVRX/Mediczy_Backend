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
