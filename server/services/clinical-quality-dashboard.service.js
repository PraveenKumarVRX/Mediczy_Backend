/**
 * Clinical Quality Dashboard — real readmission/complication rate for the
 * MS (Medical Superintendent) executive dashboard. Added 2026-09-18 to
 * replace part of the hardcoded numbers the audit found in
 * routes/hospital/executive-dashboard.route.js's /ms/clinical.
 *
 * Honesty note: mortalityRate, haiRate, nabhScore, and adverseEventsOpen
 * are returned as null with dataAvailable:false — no mortality-review,
 * infection-control, NABH-scoring, or patient-safety-incident table exists
 * in this schema (verified: only `ai_adverse_events`, which tracks AI
 * governance incidents specifically, not general clinical adverse events —
 * using it here would be semantically wrong). Building those tables and
 * the clinical workflow to populate them honestly is real, separate work,
 * not something to fake with plausible-looking numbers.
 */

import pool from '../db/pgPool.js';

export async function getMsDashboard(organizationId, { days = 90 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE readmission = true)::int AS readmits,
       COUNT(*) FILTER (WHERE complication_flag = true)::int AS complications
     FROM outcome_records
     WHERE organization_id = $1 AND outcome_date >= $2`,
    [organizationId, since]
  ).catch(() => ({ rows: [{ total: 0, readmits: 0, complications: 0 }] }));

  const { total, readmits, complications } = rows[0] || { total: 0, readmits: 0, complications: 0 };

  return {
    readmissionRate: total > 0 ? Math.round((readmits / total) * 1000) / 10 : null,
    complicationRate: total > 0 ? Math.round((complications / total) * 1000) / 10 : null,
    outcomesRecorded: total,
    // Not computable from current schema — no dedicated table exists yet.
    mortalityRate: null,
    haiRate: null,
    nabhScore: null,
    adverseEventsOpen: null,
    dataAvailable: { readmissionRate: true, complicationRate: true, mortalityRate: false, haiRate: false, nabhScore: false, adverseEventsOpen: false },
  };
}

export default { getMsDashboard };
