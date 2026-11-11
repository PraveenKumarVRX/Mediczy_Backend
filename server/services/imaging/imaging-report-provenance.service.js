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

import { schemaVerifier, guardedQuery } from '../../utils/schema-guard.js';
const SCHEMA_TABLES = ['imaging_report_provenance'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureTable = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004500-imaging-evidence-governance before using imaging report provenance',
});

// Queries fail closed on a missing table, and the check above also runs at
// startup so an unmigrated environment shows up in the log rather than only
// when a request arrives.
const guardedPool = guardedQuery(pool, 'Apply migration 20261015004500-imaging-evidence-governance before using imaging report provenance');

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

  const r = await guardedPool(
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
  const r = await guardedPool(
    `SELECT * FROM imaging_report_provenance WHERE draft_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [draftId],
  );
  return r.rows[0] || null;
}
