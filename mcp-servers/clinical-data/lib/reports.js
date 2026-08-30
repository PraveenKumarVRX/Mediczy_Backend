/**
 * Deliberately imports only the pure/deterministic compiler, claims, and
 * fact-checker modules — never imaging-report-drafter.service.js itself
 * (the orchestrator), which pulls in the LLM provider, Kafka, email, and
 * WhatsApp config just to read one row. Those three modules have no such
 * dependencies (imaging-report-compiler.service.js and imaging-fact-
 * checker.service.js import nothing but their own logic), so this stays a
 * lightweight, read-only tool surface that can't be affected by whether
 * those other services are configured or reachable.
 */
import pool from '../../../server/db/pgPool.js';
import { compileClinicalFactModel, computeAnalysisStatus, splitReportSections } from '../../../server/services/imaging/imaging-report-compiler.service.js';
import { buildClinicalClaims } from '../../../server/services/imaging/imaging-clinical-claims.service.js';
import { checkClaimsAgainstReport } from '../../../server/services/imaging/imaging-fact-checker.service.js';

async function getLatestDraftRow(studyId, tenantId) {
  const r = await pool.query(
    `SELECT * FROM imaging_ai_report_drafts WHERE study_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [studyId, tenantId],
  );
  return r.rows[0] || null;
}

function noDraftError(studyId) {
  const err = new Error(`No AI report draft exists yet for study ${studyId}`);
  err.status = 404;
  return err;
}

/** Tool 1: the same two-layer split (clinical_report / ai_explanation)
 * built into the real drafter's API response — a radiologist-readable
 * report plus the governance/QA detail, kept separate on purpose. */
export async function getReportDraft(study, tenantId) {
  const draft = await getLatestDraftRow(study.id, tenantId);
  if (!draft) throw noDraftError(study.id);

  const sections = splitReportSections(draft.draft_text);
  return {
    clinical_report: { ...sections, text: draft.draft_text },
    ai_explanation: {
      status: draft.status,
      model_version: draft.model_version,
      confidence: draft.confidence_score,
      gate: draft.gate_result,
      created_at: draft.created_at,
      reviewed_by: draft.reviewed_by,
      reviewed_at: draft.reviewed_at,
    },
  };
}

/** Tool 2: study-level ANALYZED/ABSTAIN status with the real
 * GOVERNANCE_LOCK vs NO_APPLICABLE_MODEL distinction — computed by the
 * exact same computeAnalysisStatus() the live drafter calls, against the
 * same persisted structured_findings, not re-derived. */
export async function getAnalysisStatus(study, tenantId) {
  const draft = await getLatestDraftRow(study.id, tenantId);
  if (!draft) throw noDraftError(study.id);
  return computeAnalysisStatus(draft.structured_findings);
}

/** Tool 3: fact-check an arbitrary candidate report text (e.g. a
 * radiologist's edited version about to be signed) against this study's
 * real persisted evidence — the exact P9 fact-checker pipeline
 * (buildClinicalClaims + checkClaimsAgainstReport), not a fresh LLM call. */
export async function checkReportAgainstEvidence(study, tenantId, reportText) {
  const draft = await getLatestDraftRow(study.id, tenantId);
  if (!draft) throw noDraftError(study.id);

  const clinicalFactModel = compileClinicalFactModel({
    study: { modality: study.modality, body_part: study.body_part },
    findings: draft.structured_findings,
    priorComparison: null,
  });
  const claims = buildClinicalClaims(clinicalFactModel, {
    inferenceBackend: draft.structured_findings?.inference_backend,
  });
  return checkClaimsAgainstReport(reportText, claims);
}
