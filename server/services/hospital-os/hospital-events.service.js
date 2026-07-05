/**
 * Hospital OS — clinical + operational event bus
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';

let ready = false;

async function ensureTables() {
  if (ready) return;
  await migrate();
  ready = true;
}

export async function publishEvent({
  tenantId = 'default',
  eventType,
  source,
  entityType,
  entityId,
  payload = {},
}) {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO hospital_os_events (tenant_id, event_type, source, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [tenantId, eventType, source || null, entityType || null, entityId ? String(entityId) : null, JSON.stringify(payload)]
  );
  return rows[0];
}

export async function listEvents({ tenantId = 'default', eventType, entityType, entityId, limit = 50 } = {}) {
  await ensureTables();
  const clauses = ['tenant_id = $1'];
  const params = [tenantId];
  if (eventType) { params.push(eventType); clauses.push(`event_type = $${params.length}`); }
  if (entityType) { params.push(entityType); clauses.push(`entity_type = $${params.length}`); }
  if (entityId) { params.push(String(entityId)); clauses.push(`entity_id = $${params.length}`); }
  params.push(Math.min(limit, 200));
  const { rows } = await pool.query(
    `SELECT * FROM hospital_os_events WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export default { publishEvent, listEvents };
