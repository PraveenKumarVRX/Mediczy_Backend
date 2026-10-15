import pool from '../db/pgPool.js';

/** Migration-owned imaging evidence, validation, knowledge and provenance schema. */
export async function up() {
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

CREATE TABLE IF NOT EXISTS imaging_validation_cases (
      id            BIGSERIAL PRIMARY KEY,
      study_id      BIGINT NOT NULL,
      tenant_id     BIGINT,
      case_status   VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (case_status IN ('pending','annotated','adjudicated','excluded')),
      added_by      BIGINT,
      added_by_name VARCHAR(255),
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (study_id)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_validation_cases_status ON imaging_validation_cases (case_status);

    CREATE TABLE IF NOT EXISTS imaging_validation_annotations (
      id              BIGSERIAL PRIMARY KEY,
      case_id         BIGINT NOT NULL REFERENCES imaging_validation_cases(id) ON DELETE CASCADE,
      reader_id       BIGINT NOT NULL,
      reader_name     VARCHAR(255),
      -- Free-form per case type (a findings list, measurements, an accept/
      -- reject of the AI draft, etc.) — deliberately not over-specified
      -- before a real validation protocol defines what a reader actually
      -- records.
      annotation_data JSONB NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (case_id, reader_id)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_validation_annotations_case ON imaging_validation_annotations (case_id);

    CREATE TABLE IF NOT EXISTS imaging_validation_adjudications (
      id                BIGSERIAL PRIMARY KEY,
      case_id           BIGINT NOT NULL REFERENCES imaging_validation_cases(id) ON DELETE CASCADE,
      adjudicator_id    BIGINT NOT NULL,
      adjudicator_name  VARCHAR(255),
      gold_label        JSONB NOT NULL,
      agreement_notes   TEXT,
      reader_agreement  BOOLEAN,
      adjudicated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (case_id)
    );

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS imaging_knowledge_base (
      id               BIGSERIAL PRIMARY KEY,
      canonical_id     VARCHAR(100) NOT NULL UNIQUE,
      kind             VARCHAR(20) NOT NULL CHECK (kind IN ('anatomy','pathology')),
      preferred_name   VARCHAR(255) NOT NULL,
      modality         TEXT[] NOT NULL DEFAULT '{}',
      anatomy_tags     TEXT[] NOT NULL DEFAULT '{}',
      content          TEXT NOT NULL,
      source_title     TEXT NOT NULL,
      source_url       TEXT NOT NULL,
      source_type      VARCHAR(40) NOT NULL,
      retrieved_at     TIMESTAMPTZ NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_kb_tags ON imaging_knowledge_base USING GIN (anatomy_tags);
    ALTER TABLE imaging_knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIM});
    ALTER TABLE imaging_knowledge_base ADD COLUMN IF NOT EXISTS content_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', preferred_name || ' ' || content)) STORED;
    CREATE INDEX IF NOT EXISTS idx_imaging_kb_tsv ON imaging_knowledge_base USING GIN (content_tsv);
    -- Item 8 — structural anatomy/pathology relationships (laterality,
    -- parent structure, differentials). Only populated where the source
    -- material genuinely supports it, not added preemptively for structures
    -- this pipeline doesn't detect (see module docstring).
    ALTER TABLE imaging_knowledge_base ADD COLUMN IF NOT EXISTS laterality VARCHAR(20);
    ALTER TABLE imaging_knowledge_base ADD COLUMN IF NOT EXISTS parent_structure VARCHAR(100);
    ALTER TABLE imaging_knowledge_base ADD COLUMN IF NOT EXISTS differentials TEXT[] NOT NULL DEFAULT '{}';
    -- Generation-safe summary: a separate, curated representation of this
    -- row's clinical content for the report-GENERATION prompt only. content
    -- (above) and differentials stay intact as the real retrieval/provenance
    -- record — never edited to hide anything — but content/differentials
    -- prose can itself contain the exact phrases a matched rule's
    -- prohibitedInferences forbids (e.g. this row's own differentials array
    -- contains "obstructive hydrocephalus"), and showing that raw text to
    -- the LLM primes it to echo those words regardless of any "do not
    -- conclude X" instruction placed next to it — the real, observed cause
    -- of study 11's captured bad output. A row with a non-empty summary here
    -- has that summary rendered to the generation prompt INSTEAD of
    -- content/differentials; a row without one keeps today's raw-content
    -- behavior unchanged (most rows — curating this is real, reviewed work,
    -- not done in bulk).
    ALTER TABLE imaging_knowledge_base ADD COLUMN IF NOT EXISTS generation_safe_summary TEXT[] NOT NULL DEFAULT '{}';

    -- Item 3 — real ontology layer. parent_structure (above) is a flat
    -- string; this is a genuine graph: typed, directional edges between KB
    -- entries, queryable both ways ("what is X part of" / "what relates to
    -- X"). Only two relationship types exist because only two are actually
    -- sourced below — anatomical containment (parent_of) and CSF-flow
    -- communication (communicates_with, e.g. lateral ventricle -> third
    -- ventricle via the foramen of Monro). Not a general-purpose ontology
    -- vocabulary; extend the CHECK constraint only when a new relationship
    -- type has real sourced content behind it.
    CREATE TABLE IF NOT EXISTS imaging_anatomy_relationships (
      id                    BIGSERIAL PRIMARY KEY,
      parent_canonical_id   VARCHAR(100) NOT NULL REFERENCES imaging_knowledge_base(canonical_id) ON DELETE CASCADE,
      child_canonical_id    VARCHAR(100) NOT NULL REFERENCES imaging_knowledge_base(canonical_id) ON DELETE CASCADE,
      relationship_type     VARCHAR(30) NOT NULL CHECK (relationship_type IN ('parent_of', 'communicates_with')),
      source_title          TEXT,
      source_url            TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (parent_canonical_id, child_canonical_id, relationship_type)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_anatomy_rel_parent ON imaging_anatomy_relationships (parent_canonical_id);
    CREATE INDEX IF NOT EXISTS idx_imaging_anatomy_rel_child ON imaging_anatomy_relationships (child_canonical_id);

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
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS imaging_report_provenance CASCADE;
    DROP TABLE IF EXISTS imaging_anatomy_relationships CASCADE;
    DROP TABLE IF EXISTS imaging_knowledge_base CASCADE;
    DROP TABLE IF EXISTS imaging_validation_adjudications CASCADE;
    DROP TABLE IF EXISTS imaging_validation_annotations CASCADE;
    DROP TABLE IF EXISTS imaging_validation_cases CASCADE;
    DROP TABLE IF EXISTS imaging_evidence_claim_facts CASCADE;
    DROP TABLE IF EXISTS imaging_evidence_claims CASCADE;
    DROP TABLE IF EXISTS imaging_evidence_facts CASCADE;
  `);
}
