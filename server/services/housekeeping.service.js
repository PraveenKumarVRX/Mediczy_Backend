/**
 * Housekeeping Service
 * =================================================================
 * Simple operational task tracker for hospital housekeeping
 * (routine/terminal cleaning, disinfection, linen change, biomedical
 * waste collection, pest control). Not a clinical or SaMD component —
 * administrative/operational workflow only. See
 * server/migrations/housekeeping.migration.js for schema.
 */

import pool from '../db/pgPool.js';

class HousekeepingService {
  async createTask({ organizationId, location, ward, roomNumber, taskType, priority = 'routine', createdBy, notes }) {
    const { rows } = await pool.query(
      `INSERT INTO housekeeping_task (organization_id, location, ward, room_number, task_type, priority, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [organizationId, location, ward || null, roomNumber || null, taskType, priority, createdBy || null, notes || null]
    );
    return rows[0];
  }

  async listTasks(organizationId, { status = null, ward = null, limit = 100 } = {}) {
    const conditions = ['organization_id = $1'];
    const params = [organizationId];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (ward) {
      params.push(ward);
      conditions.push(`ward = $${params.length}`);
    }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM housekeeping_task
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  // Every mutation below is scoped to organizationId and returns undefined
  // (route -> 404) when the task does not exist in that organization.
  async assignTask(organizationId, taskId, assignedTo) {
    const { rows } = await pool.query(
      `UPDATE housekeeping_task SET assigned_to = $3 WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [taskId, organizationId, assignedTo]
    );
    return rows[0];
  }

  // The status precondition is part of the UPDATE's WHERE so two concurrent
  // callers cannot both transition the task. The follow-up SELECT only runs on
  // the failure path to tell "wrong state" (throws, -> 400) from "not found".
  async startTask(organizationId, taskId) {
    const { rows } = await pool.query(
      `UPDATE housekeeping_task SET status = 'in_progress', started_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'pending' RETURNING *`,
      [taskId, organizationId]
    );
    if (rows[0]) return rows[0];
    const { rows: existing } = await pool.query(
      `SELECT 1 FROM housekeeping_task WHERE id = $1 AND organization_id = $2`,
      [taskId, organizationId]
    );
    if (existing.length) throw new Error('Task is not pending');
    return undefined;
  }

  async completeTask(organizationId, taskId, { notes } = {}) {
    const { rows } = await pool.query(
      `UPDATE housekeeping_task
       SET status = 'completed', completed_at = NOW(),
           notes = CASE WHEN $3::text IS NOT NULL THEN COALESCE(notes || E'\n', '') || $3::text ELSE notes END
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [taskId, organizationId, notes || null]
    );
    return rows[0];
  }

  async verifyTask(organizationId, taskId, verifiedBy) {
    const { rows } = await pool.query(
      `UPDATE housekeeping_task SET status = 'verified', verified_by = $3, verified_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'completed' RETURNING *`,
      [taskId, organizationId, verifiedBy]
    );
    if (rows[0]) return rows[0];
    const { rows: existing } = await pool.query(
      `SELECT 1 FROM housekeeping_task WHERE id = $1 AND organization_id = $2`,
      [taskId, organizationId]
    );
    if (existing.length) throw new Error('Task must be completed before verification');
    return undefined;
  }

  async getStats(organizationId) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
         COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE)::int AS "completedToday",
         COUNT(*) FILTER (WHERE status = 'verified' AND verified_at >= CURRENT_DATE)::int AS "verifiedToday"
       FROM housekeeping_task
       WHERE organization_id = $1`,
      [organizationId]
    );
    return rows[0] || { pending: 0, inProgress: 0, completedToday: 0, verifiedToday: 0 };
  }
}

export default new HousekeepingService();
