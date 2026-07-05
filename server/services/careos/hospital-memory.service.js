/**
 * CareOS — Hospital Memory (similar solved cases)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function findSimilarCases(patientId, organizationId, presentationHint = '') {
  await ensure();
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

  return {
    matches: scored.slice(0, 3),
    prompt: scored[0]
      ? `Similar to ${scored[0].case_number || `Case #${scored[0].id}`}. ${scored[0].final_diagnosis || 'Review lessons learned.'}`
      : null,
  };
}

export async function archiveCase({ organizationId, patientId, presentationSummary, finalDiagnosis, lessonsLearned, keywords = [] }) {
  await ensure();
  const caseNumber = `CASE-${organizationId}-${Date.now().toString(36).toUpperCase()}`;
  const { rows } = await pool.query(
    `INSERT INTO careos_hospital_cases (organization_id, patient_id, case_number, presentation_summary, final_diagnosis, lessons_learned, keywords, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [organizationId, patientId, caseNumber, presentationSummary, finalDiagnosis, lessonsLearned, keywords]
  );
  return rows[0];
}

export default { findSimilarCases, archiveCase };
