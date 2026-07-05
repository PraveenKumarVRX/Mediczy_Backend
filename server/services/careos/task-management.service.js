/**
 * CareOS — Task management tied to patient workspace
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function listTasks(patientId, { organizationId, status } = {}) {
  await ensure();
  const params = [patientId];
  let sql = `SELECT * FROM careos_tasks WHERE patient_id = $1`;
  if (organizationId) { params.push(organizationId); sql += ` AND organization_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  sql += ` ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at DESC LIMIT 100`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function createTask({
  organizationId,
  patientId,
  teamId,
  title,
  ownerRole,
  ownerUserId,
  priority = 'normal',
  dueAt,
  sourceEventId,
}) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_tasks
      (organization_id, patient_id, team_id, title, owner_role, owner_user_id, priority, due_at, source_event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [organizationId, patientId, teamId || null, title, ownerRole || null, ownerUserId || null, priority, dueAt || null, sourceEventId || null]
  );
  const task = rows[0];
  await appendClinicalEvent({
    organizationId,
    patientId,
    eventType: 'task',
    title: `Task: ${title}`,
    body: ownerRole ? `Assigned to ${ownerRole}` : 'New care task',
    actorType: 'system',
    severity: priority === 'urgent' ? 'warning' : 'info',
    metadata: { taskId: task.id },
  });
  return task;
}

export async function updateTaskStatus(taskId, status, completedBy) {
  await ensure();
  const { rows } = await pool.query(
    `UPDATE careos_tasks
     SET status = $2, completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [taskId, status]
  );
  const task = rows[0];
  if (task && status === 'completed') {
    await appendClinicalEvent({
      organizationId: task.organization_id,
      patientId: task.patient_id,
      eventType: 'task',
      title: `Task completed: ${task.title}`,
      actorType: 'clinician',
      actorId: completedBy,
      severity: 'info',
      metadata: { taskId: task.id },
    });
  }
  return task;
}

export default { listTasks, createTask, updateTaskStatus };
