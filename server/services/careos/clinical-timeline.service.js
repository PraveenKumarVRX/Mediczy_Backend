/**
 * CareOS — Clinical Timeline (structured events, not chat)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function appendClinicalEvent({
  organizationId,
  patientId,
  admissionId,
  eventType,
  title,
  body,
  actorType = 'system',
  actorId,
  actorName,
  severity = 'info',
  metadata = {},
  eventAt,
}) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_clinical_events
      (organization_id, patient_id, admission_id, event_type, title, body, actor_type, actor_id, actor_name, severity, metadata, event_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
     RETURNING *`,
    [
      organizationId, patientId, admissionId || null, eventType, title, body || null,
      actorType, actorId || null, actorName || null, severity,
      JSON.stringify(metadata), eventAt || new Date(),
    ]
  );
  return rows[0];
}

export async function getClinicalTimeline(patientId, { organizationId, limit = 200, search, eventType } = {}) {
  await ensure();
  const params = [patientId];
  let sql = `SELECT * FROM careos_clinical_events WHERE patient_id = $1`;
  if (organizationId) { params.push(organizationId); sql += ` AND organization_id = $${params.length}`; }
  if (eventType) { params.push(eventType); sql += ` AND event_type = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (title ILIKE $${params.length} OR body ILIKE $${params.length})`;
  }
  params.push(Math.min(limit, 500));
  sql += ` ORDER BY event_at DESC LIMIT $${params.length}`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export default { appendClinicalEvent, getClinicalTimeline };
