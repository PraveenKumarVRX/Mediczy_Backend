/**
 * SaMD interpretability for imaging AI — attributions + confidence on drafts/triage.
 */
import pool from '../../db/pgPool.js';
import {
  computeImagingConfidence,
  buildFeatureAttributions,
  buildLimeStyleExplanation,
} from './imaging-interpretability-lib.js';

export { computeImagingConfidence, buildFeatureAttributions, buildLimeStyleExplanation };

export async function persistImagingInterpretation({
  studyId,
  studyInstanceUID,
  tenantId,
  source,
  structuredFindings,
  triage,
  priorComparison,
  gateResult,
  draftText,
}) {
  const confidence = computeImagingConfidence({ structuredFindings, triage, priorComparison, gateResult });
  const attributions = buildFeatureAttributions(structuredFindings, triage?.findings);
  const explanation = buildLimeStyleExplanation(attributions, draftText);

  const r = await pool.query(
    `INSERT INTO imaging_report_interpretations
       (study_id, study_instance_uid, tenant_id, source, confidence_score, confidence_tier,
        feature_attributions, explanation, gate_result)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
     RETURNING *`,
    [
      studyId,
      studyInstanceUID,
      tenantId,
      source,
      confidence.score,
      confidence.tier,
      JSON.stringify(attributions),
      JSON.stringify(explanation),
      JSON.stringify(gateResult || {}),
    ],
  ).catch(() => ({ rows: [{ confidence, attributions, explanation }] }));

  return { confidence, attributions, explanation, row: r.rows?.[0] };
}

export async function getInterpretationForStudy(studyId, tenantId) {
  const r = await pool.query(
    `SELECT * FROM imaging_report_interpretations
     WHERE study_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [studyId, tenantId],
  );
  return r.rows[0] || null;
}
