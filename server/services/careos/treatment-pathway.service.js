/**
 * CareOS — Living Treatment Pathway
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

const DEFAULT_STEPS = [
  { id: 'stabilize', label: 'Stabilize vitals', status: 'in_progress' },
  { id: 'treat', label: 'Active treatment', status: 'pending' },
  { id: 'mobilize', label: 'Mobilization', status: 'pending' },
  { id: 'discharge', label: 'Discharge planning', status: 'pending' },
  { id: 'home', label: 'Home monitoring', status: 'pending' },
];

export async function getPathway(patientId, organizationId, admissionId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM careos_treatment_pathways WHERE patient_id = $1 AND ($2::bigint IS NULL OR admission_id = $2)`,
    [patientId, admissionId || null]
  );
  if (rows[0]) return rows[0];

  const ins = await pool.query(
    `INSERT INTO careos_treatment_pathways (organization_id, patient_id, admission_id, current_goal, current_progress, steps)
     VALUES ($1,$2,$3,'Stabilize clinical status',20,$4::jsonb) RETURNING *`,
    [organizationId, patientId, admissionId || null, JSON.stringify(DEFAULT_STEPS)]
  );
  return ins.rows[0];
}

export async function updatePathway(patientId, { organizationId, admissionId, currentGoal, currentProgress, steps }) {
  await ensure();
  const existing = await getPathway(patientId, organizationId, admissionId);
  const { rows } = await pool.query(
    `UPDATE careos_treatment_pathways
     SET current_goal = COALESCE($2, current_goal),
         current_progress = COALESCE($3, current_progress),
         steps = COALESCE($4::jsonb, steps),
         updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [existing.id, currentGoal, currentProgress, steps ? JSON.stringify(steps) : null]
  );
  return rows[0];
}

export default { getPathway, updatePathway };
