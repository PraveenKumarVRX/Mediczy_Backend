/**
 * Biomedical Equipment Service — maintenance tickets + calibration tracking
 * =============================================================================
 * Sits alongside the existing hg_equipment_inventory table (unchanged) to
 * give the AI-chat layer in routes/dept/biomedical.route.js a real data
 * model underneath it, per the audit finding.
 */

import pool from '../db/pgPool.js';

class BiomedicalEquipmentService {
  async listEquipment(tenantId) {
    const { rows } = await pool.query(
      `SELECT * FROM hg_equipment_inventory WHERE tenant_id = $1 ORDER BY device_name`,
      [tenantId]
    ).catch(() => ({ rows: [] })); // table is created on-demand by biomedical.route.js; may not exist yet in a fresh tenant
    return rows;
  }

  /**
   * True when the hg_equipment_inventory row belongs to the tenant. That table is
   * created on demand by biomedical.route.js, so a missing table means "not owned".
   */
  async equipmentBelongsToTenant(tenantId, equipmentId) {
    const { rows } = await pool.query(
      `SELECT 1 FROM hg_equipment_inventory WHERE id = $1 AND tenant_id = $2`,
      [equipmentId, tenantId]
    ).catch(() => ({ rows: [] }));
    return rows.length > 0;
  }

  // Returns null when equipmentId is given but is not the tenant's equipment.
  async openTicket({ tenantId, equipmentId, issueDescription, priority = 'routine', reportedBy }) {
    if (equipmentId != null && !(await this.equipmentBelongsToTenant(tenantId, equipmentId))) return null;
    const { rows } = await pool.query(
      `INSERT INTO biomedical_maintenance_ticket (tenant_id, equipment_id, issue_description, priority, reported_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, equipmentId, issueDescription, priority, reportedBy]
    );
    return rows[0];
  }

  async listTickets(tenantId, { status = null } = {}) {
    const params = [tenantId];
    let query = `SELECT * FROM biomedical_maintenance_ticket WHERE tenant_id = $1`;
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    query += ` ORDER BY opened_at DESC`;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  // Returns undefined when the ticket does not exist in this tenant.
  async resolveTicket(tenantId, ticketId, { resolutionNotes, assignedTo }) {
    const { rows } = await pool.query(
      `UPDATE biomedical_maintenance_ticket
       SET status = 'resolved', closed_at = NOW(), resolution_notes = $2, assigned_to = COALESCE($3, assigned_to)
       WHERE id = $1 AND tenant_id = $4
       RETURNING *`,
      [ticketId, resolutionNotes, assignedTo, tenantId]
    );
    return rows[0];
  }

  // Returns null when the equipment is not the tenant's (or the upsert would
  // have touched another tenant's schedule row).
  async scheduleCalibration({ tenantId, equipmentId, calibrationType, nextDueAt, frequencyDays = 365 }) {
    if (!(await this.equipmentBelongsToTenant(tenantId, equipmentId))) return null;
    const { rows } = await pool.query(
      `INSERT INTO biomedical_calibration_schedule (tenant_id, equipment_id, calibration_type, next_due_at, frequency_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (equipment_id, calibration_type) DO UPDATE SET next_due_at = EXCLUDED.next_due_at, frequency_days = EXCLUDED.frequency_days
         WHERE biomedical_calibration_schedule.tenant_id = EXCLUDED.tenant_id
       RETURNING *`,
      [tenantId, equipmentId, calibrationType, nextDueAt, frequencyDays]
    );
    return rows[0] || null;
  }

  // Returns undefined when the schedule row does not exist in this tenant.
  async recordCalibrationCompleted(tenantId, scheduleId) {
    const { rows } = await pool.query(
      `UPDATE biomedical_calibration_schedule
       SET last_calibrated_at = CURRENT_DATE,
           next_due_at = CURRENT_DATE + (frequency_days || ' days')::interval,
           status = 'scheduled'
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [scheduleId, tenantId]
    );
    return rows[0];
  }

  /** Equipment with calibration due within the next N days — feeds a NABH-gap-assessment-ready report. */
  async getCalibrationDueSoon(tenantId, withinDays = 30) {
    const { rows } = await pool.query(
      `SELECT bcs.*, hei.device_name, hei.department
       FROM biomedical_calibration_schedule bcs
       LEFT JOIN hg_equipment_inventory hei ON hei.id = bcs.equipment_id AND hei.tenant_id = bcs.tenant_id
       WHERE bcs.tenant_id = $1 AND bcs.next_due_at <= CURRENT_DATE + ($2 || ' days')::interval
       ORDER BY bcs.next_due_at`,
      [tenantId, withinDays]
    ).catch(() => ({ rows: [] }));
    return rows;
  }
}

export default new BiomedicalEquipmentService();
