/**
 * Clinical Claim system (P3 of CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md)
 * — every measurement/finding as an atomic subject-predicate-object triple:
 *
 *   { claim_id, subject, predicate, object: {value, unit}, source, confidence, status }
 *
 * Distinct from imaging_evidence_claims (imaging-evidence-graph.service.js,
 * item 6) — that table holds interpretive IMPRESSION statements ("6.2x
 * asymmetry, recommend correlation"), one level up from raw measurements.
 * This is the level below: the atomic, literal fact each impression is
 * built from, in the normalized form a real Fact Checker would need to
 * extract a report sentence's claims and match them against ("the report
 * says the RIGHT ventricle is enlarged — does a claim with subject=
 * right_lateral_ventricle, predicate=volume actually say that?").
 *
 * Deterministic, no LLM — built directly from the Clinical Fact Model
 * (imaging-report-compiler.service.js), same as everything else in this
 * pipeline's evidence layer.
 */
import pool from '../../db/pgPool.js';

import { schemaVerifier, guardedQuery } from '../../utils/schema-guard.js';
const SCHEMA_TABLES = ['imaging_clinical_claims'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureTable = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004600-imaging-ops-governance before using imaging clinical claims',
});

// Queries fail closed on a missing table, and the check above also runs at
// startup so an unmigrated environment shows up in the log rather than only
// when a request arrives.
const guardedPool = guardedQuery(pool, 'Apply migration 20261015004600-imaging-ops-governance before using imaging clinical claims');

const STATE_TO_STATUS = {
  POSITIVE: 'validated',
  NEGATIVE: 'validated',
  UNCERTAIN: 'uncertain',
  ABSTAIN: 'abstained',
  NOT_ASSESSED: 'not_assessed',
};

/** Pure transformation, no LLM, no I/O — every compiled finding becomes one
 * atomic claim. A finding with neither volume_mm3 nor size_mm produces no
 * claim (there is no numeric object to assert — a real gap, not silently
 * defaulted to 0). */
export function buildClinicalClaims(clinicalFactModel, { inferenceBackend = null } = {}) {
  const claims = [];
  for (const f of clinicalFactModel.findings) {
    const value = f.volume_mm3 ?? f.size_mm;
    if (value == null) continue;
    claims.push({
      claim_id: `CLM-${f.fact_id}`,
      fact_id: f.fact_id,
      subject: f.structure,
      predicate: f.volume_mm3 != null ? 'volume' : 'size',
      object: { value, unit: f.volume_mm3 != null ? 'mm3' : 'mm' },
      source: inferenceBackend,
      confidence: f.confidence,
      status: STATE_TO_STATUS[f.certainty] || 'not_assessed',
    });
  }
  return claims;
}

export async function persistClinicalClaims({ draftId, studyId, tenantId, claims }) {
  for (const c of claims) {
    await guardedPool(
      `INSERT INTO imaging_clinical_claims
         (draft_id, study_id, tenant_id, claim_id, fact_id, subject, predicate, object_value, object_unit, source, confidence, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (draft_id, claim_id) DO NOTHING`,
      [draftId, studyId, tenantId, c.claim_id, c.fact_id, c.subject, c.predicate, c.object.value, c.object.unit, c.source, c.confidence, c.status],
    );
  }
}

/** Real query a Fact Checker would run: "what does the evidence actually
 * say about this subject" — used to verify a report sentence's claim
 * against the atomic ground truth, not the other way around. */
export async function getClaimsForSubject(draftId, subject) {
  const { rows } = await guardedPool(
    `SELECT * FROM imaging_clinical_claims WHERE draft_id = $1 AND subject = $2`,
    [draftId, subject],
  );
  return rows;
}
