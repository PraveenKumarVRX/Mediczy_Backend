/**
 * Shape an ai_health_risk_scores row for the client (MED-MIND-001, gap G-9).
 *
 * `GET /v3/ai-intelligence/risk-score/me` returned the raw row, whose only score
 * payload is the `subscores` JSONB. The client's HealthRiskScore interface
 * instead declares FLAT top-level fields — `mental_health_score`,
 * `cardiovascular_risk`, `diabetes_risk`, `respiratory_risk`, `lifestyle_score`
 * — none of which exist on the row, so every row of the patient's
 * "Risk Analysis" panel rendered as `--` with an empty bar. It failed silently
 * because the component reads `{metric.value ?? '--'}`.
 *
 * Note `respiratory` is NOT provided: nothing in the platform computes it. A row
 * that cannot be computed is omitted rather than shown as a dash, so the panel
 * never implies a measurement that does not exist.
 *
 * Both shapes are returned: the flat fields the client expects, and `subscores`
 * untouched for anything already reading it.
 */

/** Subscore key -> the flat field name the client already expects. */
const FLAT_FIELD_BY_SUBSCORE = Object.freeze({
  cardiovascular: 'cardiovascular_risk',
  diabetes: 'diabetes_risk',
  hypertension: 'hypertension_risk',
  medication_adherence: 'adherence_score',
  lifestyle: 'lifestyle_score',
  mental_health: 'mental_health_score',
});

/** Subscores where a HIGH value is good; the rest are risks where high is bad. */
export const HIGHER_IS_BETTER_FIELDS = Object.freeze([
  'adherence_score', 'lifestyle_score', 'mental_health_score',
]);

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null} row an ai_health_risk_scores row
 * @returns {object|null} the row plus flat subscore fields (null where absent)
 */
export function normalizeRiskScoreRow(row) {
  if (!row || typeof row !== 'object') return row ?? null;

  let subscores = row.subscores ?? {};
  if (typeof subscores === 'string') {
    try { subscores = JSON.parse(subscores); } catch { subscores = {}; }
  }
  if (!subscores || typeof subscores !== 'object' || Array.isArray(subscores)) subscores = {};

  const flat = {};
  for (const [key, field] of Object.entries(FLAT_FIELD_BY_SUBSCORE)) {
    flat[field] = numberOrNull(subscores[key]);
  }

  return {
    ...row,
    subscores,
    ...flat,
    overall_score: numberOrNull(row.overall_score),
    confidence_score: numberOrNull(row.confidence_score),
    // Lets the client label a value as derived from real data rather than a
    // placeholder, and omit what is absent.
    available_subscores: Object.entries(flat)
      .filter(([, v]) => v !== null)
      .map(([field]) => field),
  };
}

export default { normalizeRiskScoreRow, HIGHER_IS_BETTER_FIELDS };
