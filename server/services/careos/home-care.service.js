/**
 * HealthOS Stage 2 — Home care visits and tasks
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import { createTask } from './task-management.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function scheduleHomecareVisit({ organizationId, patientId, caregiverId, caregiverName, visitDate, visitType, tasks, notes }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_homecare_visits
      (organization_id, patient_id, caregiver_id, caregiver_name, visit_date, visit_type, tasks, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
    [organizationId, patientId, caregiverId, caregiverName, visitDate, visitType || 'routine', JSON.stringify(tasks || []), notes]
  );
  const visit = rows[0];
  await appendClinicalEvent({
    organizationId, patientId,
    eventType: 'homecare_visit',
    title: `Home care visit scheduled`,
    body: `${caregiverName || 'Caregiver'} — ${new Date(visitDate).toLocaleDateString()}`,
    actorType: 'system', actorName: 'Care Home',
    severity: 'info',
    metadata: { visitId: visit.id },
  });
  for (const t of (tasks || [])) {
    await createTask({ organizationId, patientId, title: t.title || t, ownerRole: 'homecare' });
  }
  return visit;
}

export async function completeHomecareVisit(visitId, notes) {
  await ensure();
  const { rows } = await pool.query(
    `UPDATE healthos_homecare_visits SET status = 'completed', completed_at = NOW(), notes = COALESCE($2, notes) WHERE id = $1 RETURNING *`,
    [visitId, notes]
  );
  return rows[0];
}

export async function listHomecareVisits(patientId, organizationId) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT * FROM healthos_homecare_visits WHERE patient_id = $1 AND ($2::bigint IS NULL OR organization_id = $2)
     ORDER BY visit_date DESC LIMIT 30`,
    [patientId, organizationId || null]
  );
  return rows;
}

export default { scheduleHomecareVisit, completeHomecareVisit, listHomecareVisits };
