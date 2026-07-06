/** Shared confidence scoring for imaging report drafts. */
export function computeDraftConfidence(findings, triage, priorComparison) {
  let score = 0.4;
  if (findings?.items?.length || (Array.isArray(findings) && findings.length)) score += 0.2;
  if (triage?.confidence_score) score += Number(triage.confidence_score) * 0.2;
  if (priorComparison?.priorStudy) score += 0.1;
  if (findings?.measurements?.length) score += 0.1;
  return Math.min(0.95, Math.round(score * 100) / 100);
}
