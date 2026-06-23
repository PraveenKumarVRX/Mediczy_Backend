/** Pure interpretability helpers (no DB). */
export function computeImagingConfidence({ structuredFindings, triage, priorComparison, gateResult }) {
  let score = 0.35;
  const items = structuredFindings?.items || structuredFindings || [];
  if (items.length) score += Math.min(0.25, items.length * 0.05);
  if (triage?.confidence_score) score += Number(triage.confidence_score) * 0.2;
  if (priorComparison?.priorStudy) score += 0.1;
  if (structuredFindings?.measurements?.length) score += 0.1;
  if (gateResult?.passed) score += 0.05;
  const rounded = Math.min(0.98, Math.round(score * 100) / 100);
  return {
    score: rounded,
    percent: Math.round(rounded * 100),
    tier: rounded >= 0.75 ? 'high' : rounded >= 0.5 ? 'moderate' : 'low',
    disclaimer: 'Confidence reflects data completeness — not diagnostic accuracy.',
  };
}

export function buildFeatureAttributions(structuredFindings, triageFindings = [], triageMeta = null) {
  const cvAttributions = structuredFindings?.feature_attributions
    || structuredFindings?.featureAttributions;
  if (Array.isArray(cvAttributions) && cvAttributions.length) {
    return cvAttributions
      .map((a) => ({
        feature: a.feature || a.label,
        attribution: Number(a.attribution ?? a.weight ?? 0.5),
        direction: a.direction || 'positive',
        note: a.note || '',
        source: structuredFindings?.inference_backend || 'cv-model',
      }))
      .sort((a, b) => b.attribution - a.attribution);
  }

  const triageCv = triageMeta?.feature_attributions;
  if (Array.isArray(triageCv) && triageCv.length) {
    return triageCv
      .map((a) => ({
        feature: a.feature || a.label,
        attribution: Number(a.attribution ?? 0.5),
        direction: a.direction || 'screening',
        note: a.note || '',
        source: triageMeta?.inference_backend || 'cv-model',
      }))
      .sort((a, b) => b.attribution - a.attribution);
  }

  const items = structuredFindings?.items || [];
  const attributions = items.map((f, i) => ({
    feature: f.label || f.name || `finding_${i}`,
    attribution: f.severity === 'high' ? 0.9 : f.severity === 'medium' ? 0.6 : 0.35,
    direction: 'positive',
    note: f.note || '',
  }));
  for (const t of triageFindings || []) {
    if (!attributions.find((a) => a.feature === t.label)) {
      attributions.push({
        feature: t.label,
        attribution: t.severity === 'high' ? 0.85 : 0.4,
        direction: 'screening',
        note: t.note || '',
      });
    }
  }
  return attributions.sort((a, b) => b.attribution - a.attribution);
}

export function buildLimeStyleExplanation(attributions, draftText) {
  const top = attributions.slice(0, 5);
  const lines = top.map((a) => `${a.feature} (${Math.round(a.attribution * 100)}% weight): ${a.note || 'review'}`);
  return {
    method: 'LIME-style structured attribution',
    topFeatures: top,
    summary: lines.join('; ') || 'Insufficient structured findings for attribution.',
    draftLength: (draftText || '').length,
  };
}
