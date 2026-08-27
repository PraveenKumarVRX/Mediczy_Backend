/**
 * Evidence Graph (item 6) — persists the compiled Clinical Fact Model
 * (imaging-report-compiler.service.js) and matched rules
 * (imaging-clinical-rules.service.js) as real, queryable, linked rows —
 * not another JSON blob. imaging_report_provenance (item 1) already stores
 * a flat snapshot of measurements/knowledge used; this is the differentiator:
 * genuine graph traversal ("what facts support this claim", "what claims
 * does this fact support") via real SQL joins, matching the "Postgres can
 * get you surprisingly far, you don't need Neo4j yet" guidance this was
 * built against.
 *
 * Nodes: imaging_evidence_facts (observations/measurements)
 *        imaging_evidence_claims (impression statements / clinical claims)
 * Edges: imaging_evidence_claim_facts (which facts support which claim —
 *        this is also how a bilateral comparison's two sides link to its
 *        asymmetry claim, and how a rule's triggering fact links to the
 *        claim it informed via claim.matched_rule_id)
 */
import pool from '../../db/pgPool.js';

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imaging_evidence_facts (
      id             BIGSERIAL PRIMARY KEY,
      draft_id       BIGINT NOT NULL,
      study_id       BIGINT NOT NULL,
      tenant_id      BIGINT,
      fact_id        VARCHAR(50) NOT NULL,
      structure      VARCHAR(255),
      kind           VARCHAR(20),
      location       VARCHAR(255),
      volume_mm3     NUMERIC,
      size_mm        NUMERIC,
      certainty      VARCHAR(20),
      confidence     NUMERIC,
      certainty_reason TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (draft_id, fact_id)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_evidence_facts_draft ON imaging_evidence_facts (draft_id);
    CREATE INDEX IF NOT EXISTS idx_imaging_evidence_facts_study ON imaging_evidence_facts (study_id);
    -- Item 9/QA-3 spatial evidence, added after the table already existed in
    -- production (item 6 deployed first) — CREATE TABLE IF NOT EXISTS above
    -- is a no-op against the live table, so these columns need their own
    -- ALTER TABLE ADD COLUMN IF NOT EXISTS, same as every other table this
    -- session that grew columns after its first deployment (imaging_knowledge_base
    -- is the other example). Found by actually running this end-to-end
    -- against the live, already-deployed table, not just syntax-checking.
    ALTER TABLE imaging_evidence_facts ADD COLUMN IF NOT EXISTS centroid_voxel JSONB;
    ALTER TABLE imaging_evidence_facts ADD COLUMN IF NOT EXISTS bounding_box_voxel JSONB;

    CREATE TABLE IF NOT EXISTS imaging_evidence_claims (
      id              BIGSERIAL PRIMARY KEY,
      draft_id        BIGINT NOT NULL,
      study_id        BIGINT NOT NULL,
      tenant_id       BIGINT,
      statement_id    VARCHAR(50) NOT NULL,
      statement_type  VARCHAR(30),
      subject         VARCHAR(255),
      certainty       VARCHAR(20),
      matched_rule_id VARCHAR(50),
      pathway         VARCHAR(100),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (draft_id, statement_id)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_evidence_claims_draft ON imaging_evidence_claims (draft_id);

    CREATE TABLE IF NOT EXISTS imaging_evidence_claim_facts (
      id           BIGSERIAL PRIMARY KEY,
      draft_id     BIGINT NOT NULL,
      statement_id VARCHAR(50) NOT NULL,
      fact_id      VARCHAR(50) NOT NULL,
      UNIQUE (draft_id, statement_id, fact_id)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_evidence_claim_facts_draft ON imaging_evidence_claim_facts (draft_id);
    CREATE INDEX IF NOT EXISTS idx_imaging_evidence_claim_facts_fact ON imaging_evidence_claim_facts (draft_id, fact_id);
  `);
};
ensureTable().catch((e) => console.error('[ImagingEvidenceGraph] Table init error:', e.message));

/** Persists the compiled model + matched rules as linked rows. Called after
 * the draft row itself exists (needs a real draft_id/study_id). Best-effort
 * — a persistence failure here shouldn't block report generation, same
 * resilience pattern as recordProvenance. */
export async function persistEvidenceGraph({ draftId, studyId, tenantId, model, matchedRules = [] }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const f of model.findings) {
      await client.query(
        `INSERT INTO imaging_evidence_facts
           (draft_id, study_id, tenant_id, fact_id, structure, kind, location, volume_mm3, size_mm, certainty, confidence, certainty_reason, centroid_voxel, bounding_box_voxel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
         ON CONFLICT (draft_id, fact_id) DO NOTHING`,
        [
          draftId, studyId, tenantId, f.fact_id, f.structure, f.kind, f.location, f.volume_mm3, f.size_mm, f.certainty, f.confidence, f.certainty_reason,
          f.centroid_voxel ? JSON.stringify(f.centroid_voxel) : null,
          f.bounding_box_voxel ? JSON.stringify(f.bounding_box_voxel) : null,
        ],
      );
    }
    // Narrative items (N-*) are facts too — non-measurement AI observations
    // an impression statement could in principle cite, even though today's
    // compiler doesn't generate impression statements from them.
    for (const n of model.narrative_items) {
      await client.query(
        `INSERT INTO imaging_evidence_facts
           (draft_id, study_id, tenant_id, fact_id, structure, kind, certainty)
         VALUES ($1,$2,$3,$4,$5,'narrative',$6)
         ON CONFLICT (draft_id, fact_id) DO NOTHING`,
        [draftId, studyId, tenantId, n.fact_id, n.label, n.present ? 'POSITIVE' : 'NEGATIVE'],
      );
    }

    // Map each claim to the rule (if any) that fired on the same underlying
    // evidence. A rule's triggeredBy holds either comparison_ids (asymmetry
    // rules — the compiler names that statement "I-${comparison_id}", so
    // compare against the statement_id) or fact_ids (single-finding rules —
    // those appear directly in the statement's own evidence_ids). Checking
    // both is required: the two rule types return different id spaces, and
    // matching only one silently drops the link for the other (found by
    // running this against real ventricle-asymmetry data and seeing
    // matched_rule_id come back null despite MRI-BRAIN-VENT-001 matching).
    for (const s of model.impression) {
      const rule = matchedRules.find((r) =>
        r.triggeredBy?.some((id) => s.statement_id === `I-${id}` || s.evidence_ids?.includes(id)));
      await client.query(
        `INSERT INTO imaging_evidence_claims
           (draft_id, study_id, tenant_id, statement_id, statement_type, subject, certainty, matched_rule_id, pathway)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (draft_id, statement_id) DO NOTHING`,
        [draftId, studyId, tenantId, s.statement_id, s.statement_type, s.subject, s.certainty, rule?.ruleId || null, rule?.pathway || null],
      );
      for (const factId of s.evidence_ids || []) {
        await client.query(
          `INSERT INTO imaging_evidence_claim_facts (draft_id, statement_id, fact_id)
           VALUES ($1,$2,$3) ON CONFLICT (draft_id, statement_id, fact_id) DO NOTHING`,
          [draftId, s.statement_id, factId],
        );
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Full graph for one draft, reconstructed from the linked rows — not the
 * original in-memory object, a genuine round-trip through Postgres. */
export async function getEvidenceGraphForDraft(draftId) {
  const [facts, claims, edges] = await Promise.all([
    pool.query(`SELECT * FROM imaging_evidence_facts WHERE draft_id = $1 ORDER BY fact_id`, [draftId]),
    pool.query(`SELECT * FROM imaging_evidence_claims WHERE draft_id = $1 ORDER BY statement_id`, [draftId]),
    pool.query(`SELECT statement_id, fact_id FROM imaging_evidence_claim_facts WHERE draft_id = $1`, [draftId]),
  ]);
  const factsByClaim = new Map();
  for (const e of edges.rows) {
    if (!factsByClaim.has(e.statement_id)) factsByClaim.set(e.statement_id, []);
    factsByClaim.get(e.statement_id).push(e.fact_id);
  }
  return {
    facts: facts.rows,
    claims: claims.rows.map((c) => ({ ...c, supporting_fact_ids: factsByClaim.get(c.statement_id) || [] })),
  };
}

/** Reverse traversal — "why does the report say this?" for a specific
 * fact: every claim it supports, and (through the claim) every rule
 * pathway that fact fed into. This is the backend half of the master
 * doc's "Evidence Click-through" UI concept (§38) — no UI built here,
 * just the query it would call. */
export async function getClaimsSupportedByFact(draftId, factId) {
  const { rows } = await pool.query(
    `SELECT c.* FROM imaging_evidence_claims c
     JOIN imaging_evidence_claim_facts e ON e.draft_id = c.draft_id AND e.statement_id = c.statement_id
     WHERE c.draft_id = $1 AND e.fact_id = $2`,
    [draftId, factId],
  );
  return rows;
}
