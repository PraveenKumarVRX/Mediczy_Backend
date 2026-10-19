/**
 * CareOS — Hospital Memory (similar solved cases)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

let outcomeColsReady = false;
async function ensureOutcomeColumns() {
  if (outcomeColsReady) return;
  await ensure();
  await pool.query(`
    ALTER TABLE careos_hospital_cases ADD COLUMN IF NOT EXISTS outcome_status VARCHAR(30) DEFAULT 'unknown';
    ALTER TABLE careos_hospital_cases ADD COLUMN IF NOT EXISTS length_of_stay_days NUMERIC;
    ALTER TABLE careos_hospital_cases ADD COLUMN IF NOT EXISTS readmitted_within_30d BOOLEAN DEFAULT FALSE;
  `);
  outcomeColsReady = true;
}

/**
 * Learning Agent: closes the loop between an archived case and what actually
 * happened afterwards. Called when the outcome becomes known — e.g. a
 * readmission is detected on a later admission (see adt.service.js), or a
 * clinician records the outcome manually — so future similarity matches
 * carry a real signal instead of only the diagnosis at time of archiving.
 */
export async function recordCaseOutcome(caseId, { outcomeStatus, readmittedWithin30d, lengthOfStayDays } = {}) {
  await ensureOutcomeColumns();
  const { rows } = await pool.query(
    `UPDATE careos_hospital_cases SET
       outcome_status = COALESCE($2, outcome_status),
       readmitted_within_30d = COALESCE($3, readmitted_within_30d),
       length_of_stay_days = COALESCE($4, length_of_stay_days)
     WHERE id = $1 RETURNING *`,
    [caseId, outcomeStatus || null, readmittedWithin30d ?? null, lengthOfStayDays ?? null]
  );
  return rows[0] || null;
}

/**
 * Learning Agent: on a new admission, check whether this same patient has a
 * recently archived case (discharged within the last 30 days) and flag it
 * readmitted — turning a real outcome event into feedback on the earlier
 * case record, which findSimilarCases below surfaces as a caution signal.
 */
export async function flagReadmissionIfRecent(patientId, organizationId) {
  await ensureOutcomeColumns();
  const { rows } = await pool.query(
    `SELECT * FROM careos_hospital_cases
     WHERE organization_id = $1 AND patient_id = $2
       AND closed_at IS NOT NULL AND closed_at > NOW() - INTERVAL '30 days'
       AND readmitted_within_30d = FALSE
     ORDER BY closed_at DESC LIMIT 1`,
    [organizationId, patientId]
  );
  const priorCase = rows[0];
  if (!priorCase) return null;
  return recordCaseOutcome(priorCase.id, { outcomeStatus: 'readmitted', readmittedWithin30d: true });
}

export async function findSimilarCases(patientId, organizationId, presentationHint = '') {
  await ensureOutcomeColumns();
  const terms = presentationHint.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 5);

  let rows = [];
  try {
    const res = await pool.query(
      `SELECT * FROM careos_hospital_cases
       WHERE organization_id = $1 AND patient_id != $2
       ORDER BY closed_at DESC NULLS LAST LIMIT 50`,
      [organizationId, patientId]
    );
    rows = res.rows;
  } catch {
    rows = [];
  }

  if (!rows.length) {
    return {
      matches: [],
      message: 'Hospital memory building — archive complex cases when closed to enable similarity search.',
    };
  }

  const scored = rows.map((c) => {
    const text = `${c.presentation_summary || ''} ${c.final_diagnosis || ''} ${(c.keywords || []).join(' ')}`.toLowerCase();
    const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    return { ...c, matchScore: score };
  }).filter((c) => c.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

  const top = scored[0];
  return {
    matches: scored.slice(0, 3),
    prompt: top
      ? `Similar to ${top.case_number || `Case #${top.id}`}. ${top.final_diagnosis || 'Review lessons learned.'}` +
        (top.readmitted_within_30d ? ' ⚠️ That prior case was readmitted within 30 days — review discharge criteria before repeating the same plan.' : '')
      : null,
  };
}

export async function archiveCase({ organizationId, patientId, presentationSummary, finalDiagnosis, lessonsLearned, keywords = [], lengthOfStayDays }) {
  await ensureOutcomeColumns();
  const caseNumber = `CASE-${organizationId}-${Date.now().toString(36).toUpperCase()}`;
  const { rows } = await pool.query(
    `INSERT INTO careos_hospital_cases (organization_id, patient_id, case_number, presentation_summary, final_diagnosis, lessons_learned, keywords, closed_at, length_of_stay_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8) RETURNING *`,
    [organizationId, patientId, caseNumber, presentationSummary, finalDiagnosis, lessonsLearned, keywords, lengthOfStayDays ?? null]
  );
  return rows[0];
}

export default { findSimilarCases, archiveCase, recordCaseOutcome, flagReadmissionIfRecent };
