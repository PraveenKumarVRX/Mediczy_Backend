/**
 * HealthOS Stage 4 — Research platform (clinical trial matching)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { getOrSyncPassport } from './medical-passport.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function listTrials({ condition, status = 'recruiting' } = {}) {
  await ensure();
  const params = [status];
  let sql = `SELECT * FROM healthos_clinical_trials WHERE status = $1`;
  if (condition) {
    params.push(`%${condition}%`);
    sql += ` AND EXISTS (SELECT 1 FROM unnest(conditions) c WHERE c ILIKE $${params.length})`;
  }
  sql += ` ORDER BY title LIMIT 50`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function matchTrialsForPatient(patientId, organizationId) {
  await ensure();
  const passport = await getOrSyncPassport(patientId, organizationId).catch(() => null);
  const diagnoses = (passport?.diagnoses || []).map((d) => (typeof d === 'string' ? d : d.name || d.code || '')).filter(Boolean);
  const summary = passport?.summary_text || '';

  const { rows: trials } = await pool.query(`SELECT * FROM healthos_clinical_trials WHERE status = 'recruiting'`);
  const matches = [];

  for (const trial of trials) {
    const conds = (trial.conditions || []).map((c) => c.toLowerCase());
    const reasons = [];
    let score = 0;
    for (const dx of diagnoses) {
      if (conds.some((c) => dx.toLowerCase().includes(c) || c.includes(dx.toLowerCase()))) {
        score += 30;
        reasons.push(`Diagnosis match: ${dx}`);
      }
    }
    if (summary && conds.some((c) => summary.toLowerCase().includes(c))) {
      score += 20;
      reasons.push('Summary keyword match');
    }
    if (score > 0) {
      const { rows } = await pool.query(
        `INSERT INTO healthos_trial_matches (patient_id, trial_id, match_score, match_reasons, status)
         VALUES ($1,$2,$3,$4::jsonb,'suggested')
         ON CONFLICT (patient_id, trial_id) DO UPDATE SET match_score = EXCLUDED.match_score, match_reasons = EXCLUDED.match_reasons
         RETURNING *`,
        [patientId, trial.id, Math.min(score, 100), JSON.stringify(reasons)]
      );
      matches.push({ ...trial, match: rows[0] });
    }
  }

  return matches.sort((a, b) => b.match.match_score - a.match.match_score);
}

export async function exportRWE({ organizationId, metricNames, periodStart, periodEnd }) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM healthos_population_metrics
     WHERE organization_id = $1 AND period_start >= $2 AND period_end <= $3
     AND ($4::text[] IS NULL OR metric_name = ANY($4))
     ORDER BY computed_at DESC`,
    [organizationId, periodStart, periodEnd, metricNames || null]
  );
  return {
    disclaimer: 'Governed RWE export — de-identified aggregates only; IRB/ethics approval required for patient-level data',
    recordCount: rows.length,
    metrics: rows,
  };
}

export default { listTrials, matchTrialsForPatient, exportRWE };
