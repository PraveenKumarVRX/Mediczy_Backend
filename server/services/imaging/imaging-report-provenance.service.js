/**
 * Provenance for AI-drafted imaging reports (Layer 1 of the evidence/knowledge
 * fabric): one row per draft, capturing exactly which inference backend,
 * measurements, knowledge-base rows, template, LLM, and QA gate result
 * produced it — so a draft can be reproduced or audited later, not just
 * trusted on faith.
 *
 * Deliberately records only what the pipeline actually knows today (a
 * single inference_backend/model_version per analysis run, not per
 * measurement — engine.py merges CV backends before returning findings, so
 * per-measurement attribution doesn't exist yet). Extend this schema when
 * that granularity is real, not before.
 */
import pool from '../../db/pgPool.js';

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imaging_report_provenance (
      id                      BIGSERIAL PRIMARY KEY,
      draft_id                BIGINT NOT NULL,
      study_id                BIGINT NOT NULL,
      study_instance_uid      VARCHAR(128),
      tenant_id                BIGINT,
      inference_backend        VARCHAR(100),
      findings_source           VARCHAR(150),
      measurements              JSONB NOT NULL DEFAULT '[]',
      knowledge_used            JSONB NOT NULL DEFAULT '[]',
      report_drafter_version    VARCHAR(50),
      template_id               BIGINT,
      llm_model                 VARCHAR(150),
      llm_provider               VARCHAR(100),
      qa_gate_result             JSONB,
      qa_passed                  BOOLEAN,
      qa_severity                 VARCHAR(20),
      confidence_score             NUMERIC,
      created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_report_provenance_draft ON imaging_report_provenance (draft_id);
    CREATE INDEX IF NOT EXISTS idx_imaging_report_provenance_study ON imaging_report_provenance (study_id);
    -- "Why heuristic" — real reason MR inference didn't run a real backend
    -- (governance lock / applicability abstain / fetch gap), from
    -- inference/engine.py::mr_backend_status(). Table pre-existed this
    -- column (see the imaging_evidence_facts lesson from item 9), so this
    -- needs its own ALTER, not just the CREATE TABLE above.
    ALTER TABLE imaging_report_provenance ADD COLUMN IF NOT EXISTS applicability JSONB;
    -- Knowledge Router (P4) decision — real, persisted, inspectable, not a
    -- fact only known transiently inside a retrieval call.
    ALTER TABLE imaging_report_provenance ADD COLUMN IF NOT EXISTS routing_decision JSONB;
  `);
};
ensureTable().catch((e) => console.error('[ImagingProvenance] Table init error:', e.message));

export async function recordProvenance({
  draftId,
  studyId,
  studyInstanceUID,
  tenantId,
  findings,
  knowledgeRows = [],
  reportDrafterVersion,
  templateId,
  llmModel,
  llmProviderName,
  gateResult,
  confidence,
  routingDecision = null,
}) {
  const inferenceBackend = findings?.inference_backend || null;
  const findingsSource = findings?.source || null;
  const measurements = findings?.measurements || [];
  const applicability = findings?.applicability || null;
  const knowledgeUsed = knowledgeRows.map((r) => ({
    canonical_id: r.canonical_id,
    kind: r.kind,
    preferred_name: r.preferred_name,
    source_title: r.source_title,
    source_url: r.source_url,
    source_type: r.source_type,
    retrieved_at: r.retrieved_at,
  }));

  const r = await pool.query(
    `INSERT INTO imaging_report_provenance
       (draft_id, study_id, study_instance_uid, tenant_id, inference_backend, findings_source,
        measurements, knowledge_used, report_drafter_version, template_id, llm_model, llm_provider,
        qa_gate_result, qa_passed, qa_severity, confidence_score, applicability, routing_decision)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17::jsonb,$18::jsonb)
     RETURNING *`,
    [
      draftId,
      studyId,
      studyInstanceUID,
      tenantId,
      inferenceBackend,
      findingsSource,
      JSON.stringify(measurements),
      JSON.stringify(knowledgeUsed),
      reportDrafterVersion,
      templateId || null,
      llmModel || null,
      llmProviderName || null,
      JSON.stringify(gateResult || null),
      gateResult?.passed ?? null,
      gateResult?.severity ?? null,
      confidence ?? null,
      JSON.stringify(applicability),
      JSON.stringify(routingDecision),
    ],
  );
  return r.rows[0];
}

export async function getProvenanceForDraft(draftId) {
  const r = await pool.query(
    `SELECT * FROM imaging_report_provenance WHERE draft_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [draftId],
  );
  return r.rows[0] || null;
}
