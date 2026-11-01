/**
 * Biomedical Equipment Service — maintenance tickets + calibration tracking
 * =============================================================================
 * Sits alongside the existing hg_equipment_inventory table (unchanged) to
 * give the AI-chat layer in routes/dept/biomedical.route.js a real data
 * model underneath it, per the audit finding.
 */

import { createHash } from 'node:crypto';
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
       ON CONFLICT (tenant_id, equipment_id, calibration_type) DO UPDATE
         SET next_due_at = EXCLUDED.next_due_at, frequency_days = EXCLUDED.frequency_days
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

  /** A clinical device cannot be considered available while an overdue PPM or calibration task is open. */
  async checkClinicalUse(tenantId, equipmentId) {
    const { rows: equipment } = await pool.query(
      `SELECT id, device_name, integration_status FROM hg_equipment_inventory WHERE id = $1 AND tenant_id = $2`,
      [equipmentId, tenantId]
    ).catch(() => ({ rows: [] }));
    if (!equipment[0]) return { allowed: false, reason: 'equipment_not_found' };
    const { rows: overdue } = await pool.query(
      `SELECT id, task_type, due_at, status, clinical_use_blocked, block_reason
         FROM biomedical_pm_schedule
        WHERE tenant_id = $1 AND equipment_id = $2
          AND status IN ('scheduled', 'overdue')
          AND (clinical_use_blocked = TRUE OR due_at < CURRENT_DATE)
        ORDER BY due_at ASC LIMIT 1`,
      [tenantId, equipmentId]
    ).catch(() => ({ rows: [] }));
    if (overdue[0]) return { allowed: false, reason: 'preventive_maintenance_overdue', task: overdue[0] };
    const { rows: calibration } = await pool.query(
      `SELECT id, calibration_type, next_due_at, status, clinical_use_blocked, block_reason
         FROM biomedical_calibration_schedule
        WHERE tenant_id = $1 AND equipment_id = $2
          AND status IN ('scheduled', 'overdue')
          AND (clinical_use_blocked = TRUE OR next_due_at < CURRENT_DATE)
        ORDER BY next_due_at ASC LIMIT 1`,
      [tenantId, equipmentId]
    ).catch(() => ({ rows: [] }));
    if (calibration[0]) return { allowed: false, reason: 'calibration_overdue', task: calibration[0] };
    return { allowed: true, equipment: equipment[0] };
  }

  /**
   * Persist a cold-chain reading exactly once. A reused idempotency key is
   * allowed only for the identical request; a different measurement is an
   * operational integrity error and must be investigated.
   */
  async recordColdChainReading({ tenantId, sensorId, temperatureC, humidityPercent = null, observedAt = new Date().toISOString(), idempotencyKey }) {
    if (!idempotencyKey) {
      const error = new Error('idempotencyKey is required'); error.status = 422; error.code = 'idempotency_key_required'; throw error;
    }
    const numericTemperature = Number(temperatureC);
    if (!Number.isFinite(numericTemperature)) {
      const error = new Error('temperatureC must be finite'); error.status = 422; error.code = 'invalid_temperature'; throw error;
    }
    const requestHash = createHash('sha256').update(JSON.stringify({ tenantId, sensorId, temperatureC: numericTemperature, humidityPercent, observedAt })).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: sensors } = await client.query(
        `SELECT id, min_temperature_c, max_temperature_c, location
           FROM biomedical_cold_chain_sensors WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE FOR UPDATE`,
        [sensorId, tenantId]
      );
      const sensor = sensors[0];
      if (!sensor) { const error = new Error('sensor not found'); error.status = 404; error.code = 'sensor_not_found'; throw error; }
      const { rows: existing } = await client.query(
        `SELECT id, request_hash, alert_id FROM biomedical_cold_chain_readings WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      if (existing[0]) {
        if (existing[0].request_hash !== requestHash) {
          const error = new Error('idempotency key was already used for a different reading'); error.status = 422; error.code = 'idempotency_key_reuse'; throw error;
        }
        await client.query('COMMIT');
        return { reading: existing[0], alert: existing[0].alert_id ? { id: existing[0].alert_id } : null, duplicate: true };
      }
      const { rows: readings } = await client.query(
        `INSERT INTO biomedical_cold_chain_readings
           (tenant_id, sensor_id, temperature_c, humidity_percent, observed_at, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tenantId, sensorId, numericTemperature, humidityPercent, observedAt, idempotencyKey, requestHash]
      );
      const outOfRange = numericTemperature < Number(sensor.min_temperature_c) || numericTemperature > Number(sensor.max_temperature_c);
      let alert = null;
      if (outOfRange) {
        const { rows } = await client.query(
          `INSERT INTO biomedical_cold_chain_alerts (tenant_id, reading_id, severity, reason)
           VALUES ($1,$2,'critical',$3) RETURNING *`,
          [tenantId, readings[0].id, `Temperature ${numericTemperature}°C outside approved range at ${sensor.location}`]
        );
        alert = rows[0];
      }
      await client.query('COMMIT');
      return { reading: readings[0], alert, outOfRange, duplicate: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async markPreventiveMaintenanceOverdue() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pm = await client.query(
        `UPDATE biomedical_pm_schedule
            SET status = 'overdue', clinical_use_blocked = TRUE, block_reason = 'preventive_maintenance_overdue', updated_at = NOW()
          WHERE status = 'scheduled' AND due_at < CURRENT_DATE`
      );
      const calibration = await client.query(
        `UPDATE biomedical_calibration_schedule
            SET status = 'overdue', clinical_use_blocked = TRUE, block_reason = 'calibration_overdue'
          WHERE status = 'scheduled' AND next_due_at < CURRENT_DATE`
      );
      await client.query('COMMIT');
      return { preventiveMaintenance: pm.rowCount, calibrations: calibration.rowCount };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new BiomedicalEquipmentService();
