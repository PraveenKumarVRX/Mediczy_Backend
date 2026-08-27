/**
 * Validation factory schema (item 10) — SCAFFOLDING ONLY.
 *
 * This is database structure for a future multi-reader annotation +
 * adjudication pipeline. It is NOT a functioning validation program: there
 * is no dataset loaded here, no readers assigned, no gold-standard cases,
 * and nothing in this codebase populates these tables automatically. A
 * validation program needs real clinicians reading real (de-identified)
 * cases and a real adjudication process when they disagree — none of that
 * exists yet, and building this schema does not create it.
 *
 * What this genuinely provides: the tables a real validation program would
 * need on day one, so that when real cases/readers exist, there's somewhere
 * real to put them rather than another ad-hoc spreadsheet. Do not report
 * this as "the validation factory is built" — report it as "the schema a
 * validation factory would need is ready."
 *
 * case_status lifecycle: pending -> annotated -> adjudicated
 */
import pool from '../../db/pgPool.js';

const ensureTable = async () => {
  await pool.query(`
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
  `);
};
ensureTable().catch((e) => console.error('[ImagingValidationFactory] Table init error:', e.message));

export async function registerCase({ studyId, tenantId, addedBy, addedByName, notes }) {
  const { rows } = await pool.query(
    `INSERT INTO imaging_validation_cases (study_id, tenant_id, added_by, added_by_name, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (study_id) DO NOTHING
     RETURNING *`,
    [studyId, tenantId, addedBy || null, addedByName || null, notes || null],
  );
  return rows[0] || null;
}

export async function recordAnnotation({ caseId, readerId, readerName, annotationData }) {
  const { rows } = await pool.query(
    `INSERT INTO imaging_validation_annotations (case_id, reader_id, reader_name, annotation_data)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (case_id, reader_id) DO UPDATE SET annotation_data = EXCLUDED.annotation_data, created_at = NOW()
     RETURNING *`,
    [caseId, readerId, readerName || null, JSON.stringify(annotationData)],
  );
  await pool.query(
    `UPDATE imaging_validation_cases SET case_status = 'annotated' WHERE id = $1 AND case_status = 'pending'`,
    [caseId],
  );
  return rows[0];
}

export async function recordAdjudication({ caseId, adjudicatorId, adjudicatorName, goldLabel, agreementNotes, readerAgreement }) {
  const { rows } = await pool.query(
    `INSERT INTO imaging_validation_adjudications (case_id, adjudicator_id, adjudicator_name, gold_label, agreement_notes, reader_agreement)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT (case_id) DO UPDATE SET gold_label = EXCLUDED.gold_label, agreement_notes = EXCLUDED.agreement_notes, reader_agreement = EXCLUDED.reader_agreement, adjudicated_at = NOW()
     RETURNING *`,
    [caseId, adjudicatorId, adjudicatorName || null, JSON.stringify(goldLabel), agreementNotes || null, readerAgreement ?? null],
  );
  await pool.query(`UPDATE imaging_validation_cases SET case_status = 'adjudicated' WHERE id = $1`, [caseId]);
  return rows[0];
}

export async function getCaseWithAnnotations(caseId) {
  const [caseRow, annotations, adjudication] = await Promise.all([
    pool.query(`SELECT * FROM imaging_validation_cases WHERE id = $1`, [caseId]),
    pool.query(`SELECT * FROM imaging_validation_annotations WHERE case_id = $1 ORDER BY created_at`, [caseId]),
    pool.query(`SELECT * FROM imaging_validation_adjudications WHERE case_id = $1`, [caseId]),
  ]);
  if (!caseRow.rows[0]) return null;
  return { ...caseRow.rows[0], annotations: annotations.rows, adjudication: adjudication.rows[0] || null };
}

/** Real query, real result — but "0 pending / 0 annotated / 0 adjudicated"
 * on a fresh deployment is the honest, correct answer, not a bug. This
 * function existing is not evidence a validation program is running. */
export async function getValidationFactoryStatus(tenantId) {
  const { rows } = await pool.query(
    `SELECT case_status, COUNT(*)::int AS count
     FROM imaging_validation_cases
     WHERE tenant_id = $1
     GROUP BY case_status`,
    [tenantId],
  );
  const counts = { pending: 0, annotated: 0, adjudicated: 0, excluded: 0 };
  for (const r of rows) counts[r.case_status] = r.count;
  return counts;
}
