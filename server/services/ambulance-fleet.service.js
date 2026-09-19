/**
 * Ambulance Fleet Service — vehicles, crew, maintenance, shifts, alerts
 * =========================================================================
 * One `ambulances` row is one provider login; a provider manages many
 * vehicles and crew members under it. EVERY query here is scoped by
 * ambulance_id (the provider's JWT id) — mutations use
 * `WHERE id = $n AND ambulance_id = $m` so one provider can never read or
 * touch another provider's records. Methods return null when the row does
 * not exist for that provider (routes map that to 404).
 * See migrations/ambulance-fleet.migration.js for the schema.
 */

import pool from '../db/pgPool.js';

export const VEHICLE_TYPES = ['BLS', 'ALS', 'Neonatal', 'Mortuary', 'Other'];
export const VEHICLE_STATUSES = ['available', 'on_trip', 'maintenance', 'off_duty'];
export const CREW_ROLES = ['driver', 'paramedic', 'support'];
export const DUTY_STATUSES = ['on_duty', 'off_duty'];

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
const DEFAULT_SERVICE_INTERVAL_DAYS = 90;

const VEHICLE_COLUMNS = `v.id, v.ambulance_id, v.registration_number, v.vehicle_type, v.status, v.current_location,
       v.last_service_date::text AS last_service_date, v.next_service_due::text AS next_service_due, v.created_at`;

const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

class AmbulanceFleetService {
  // ── Vehicles ─────────────────────────────────────────────────────────────
  async listVehicles(ambulanceId) {
    const { rows } = await pool.query(
      `SELECT ${VEHICLE_COLUMNS}, t.id AS active_trip_id, t.pickup_location AS active_trip_pickup,
              t.drop_location AS active_trip_drop, t.driver_name AS active_trip_driver
       FROM ambulance_vehicle v
       LEFT JOIN LATERAL (
         SELECT id, pickup_location, drop_location, driver_name FROM ambulance_trip
         WHERE vehicle_id = v.id AND ambulance_id = v.ambulance_id AND status IN ('dispatched', 'en_route', 'arrived')
         ORDER BY dispatched_at DESC LIMIT 1
       ) t ON TRUE
       WHERE v.ambulance_id = $1
       ORDER BY v.registration_number`,
      [ambulanceId]
    );
    return rows;
  }

  async createVehicle(ambulanceId, { registrationNumber, vehicleType = 'BLS', status = 'available', currentLocation, lastServiceDate, nextServiceDue }) {
    const { rows } = await pool.query(
      `INSERT INTO ambulance_vehicle AS v (ambulance_id, registration_number, vehicle_type, status, current_location, last_service_date, next_service_due)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${VEHICLE_COLUMNS}`,
      [ambulanceId, registrationNumber, vehicleType, status, currentLocation || null, lastServiceDate || null, nextServiceDue || null]
    );
    return rows[0];
  }

  async updateVehicleStatus(ambulanceId, vehicleId, status) {
    const { rows } = await pool.query(
      `UPDATE ambulance_vehicle v SET status = $3 WHERE v.id = $1 AND v.ambulance_id = $2 RETURNING ${VEHICLE_COLUMNS}`,
      [vehicleId, ambulanceId, status]
    );
    return rows[0] || null;
  }

  async getFleetSummary(ambulanceId) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'available')::int   AS available,
         COUNT(*) FILTER (WHERE status = 'on_trip')::int     AS on_trip,
         COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance,
         COUNT(*)::int                                       AS total
       FROM ambulance_vehicle WHERE ambulance_id = $1`,
      [ambulanceId]
    );
    const r = rows[0] || {};
    return { available: r.available || 0, onTrip: r.on_trip || 0, maintenance: r.maintenance || 0, total: r.total || 0 };
  }

  // ── Crew ─────────────────────────────────────────────────────────────────
  async listCrew(ambulanceId, { role = null } = {}) {
    const params = [ambulanceId];
    let query = `SELECT * FROM ambulance_crew WHERE ambulance_id = $1`;
    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }
    query += ` ORDER BY name`;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async createCrew(ambulanceId, { name, role, licenseNumber, phone, dutyStatus = 'off_duty' }) {
    const { rows } = await pool.query(
      `INSERT INTO ambulance_crew (ambulance_id, name, role, license_number, phone, duty_status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [ambulanceId, name, role, licenseNumber || null, phone || null, dutyStatus]
    );
    return rows[0];
  }

  async setCrewDuty(ambulanceId, crewId, dutyStatus) {
    const { rows } = await pool.query(
      `UPDATE ambulance_crew SET duty_status = $3 WHERE id = $1 AND ambulance_id = $2 RETURNING *`,
      [crewId, ambulanceId, dutyStatus]
    );
    return rows[0] || null;
  }

  // ── Maintenance ──────────────────────────────────────────────────────────
  async listMaintenance(ambulanceId, { status = null } = {}) {
    const params = [ambulanceId];
    let query = `SELECT m.id, m.ambulance_id, m.vehicle_id, m.maintenance_type, m.scheduled_date::text AS scheduled_date,
                        m.status, m.notes, m.completed_at, m.created_at, v.registration_number
                 FROM ambulance_maintenance m
                 JOIN ambulance_vehicle v ON v.id = m.vehicle_id
                 WHERE m.ambulance_id = $1`;
    if (status) {
      params.push(status);
      query += ` AND m.status = $${params.length}`;
    }
    query += ` ORDER BY m.scheduled_date, m.id`;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async createMaintenance(ambulanceId, { vehicleId, maintenanceType, scheduledDate, notes }) {
    // The vehicle must belong to this provider — never trust a client-supplied vehicleId.
    const owned = await pool.query(`SELECT 1 FROM ambulance_vehicle WHERE id = $1 AND ambulance_id = $2`, [vehicleId, ambulanceId]);
    if (!owned.rows.length) return null;
    const { rows } = await pool.query(
      `INSERT INTO ambulance_maintenance (ambulance_id, vehicle_id, maintenance_type, scheduled_date, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ambulance_id, vehicle_id, maintenance_type, scheduled_date::text AS scheduled_date, status, notes, completed_at, created_at`,
      [ambulanceId, vehicleId, maintenanceType, scheduledDate, notes || null]
    );
    return rows[0];
  }

  async startMaintenance(ambulanceId, maintenanceId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT id, vehicle_id, status FROM ambulance_maintenance WHERE id = $1 AND ambulance_id = $2 FOR UPDATE`,
        [maintenanceId, ambulanceId]
      );
      if (!cur.rows.length) { await client.query('ROLLBACK'); return null; }
      if (cur.rows[0].status !== 'scheduled') throw conflict(`Maintenance is already ${cur.rows[0].status}`);
      const { rows } = await client.query(
        `UPDATE ambulance_maintenance SET status = 'in_progress' WHERE id = $1 AND ambulance_id = $2
         RETURNING id, ambulance_id, vehicle_id, maintenance_type, scheduled_date::text AS scheduled_date, status, notes, completed_at, created_at`,
        [maintenanceId, ambulanceId]
      );
      await client.query(
        `UPDATE ambulance_vehicle SET status = 'maintenance' WHERE id = $1 AND ambulance_id = $2`,
        [cur.rows[0].vehicle_id, ambulanceId]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Completes a maintenance job and rolls the vehicle's service dates forward.
   * last_service_date defaults to today; next_service_due defaults to
   * last_service_date + 90 days when not given. A vehicle that was in
   * 'maintenance' returns to 'available'; other statuses are left alone.
   */
  async completeMaintenance(ambulanceId, maintenanceId, { lastServiceDate, nextServiceDue } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT id, vehicle_id, status FROM ambulance_maintenance WHERE id = $1 AND ambulance_id = $2 FOR UPDATE`,
        [maintenanceId, ambulanceId]
      );
      if (!cur.rows.length) { await client.query('ROLLBACK'); return null; }
      if (cur.rows[0].status === 'completed') throw conflict('Maintenance is already completed');
      const { rows } = await client.query(
        `UPDATE ambulance_maintenance SET status = 'completed', completed_at = NOW() WHERE id = $1 AND ambulance_id = $2
         RETURNING id, ambulance_id, vehicle_id, maintenance_type, scheduled_date::text AS scheduled_date, status, notes, completed_at, created_at`,
        [maintenanceId, ambulanceId]
      );
      await client.query(
        `UPDATE ambulance_vehicle
         SET last_service_date = COALESCE($3::date, CURRENT_DATE),
             next_service_due  = COALESCE($4::date, COALESCE($3::date, CURRENT_DATE) + $5::int),
             status            = CASE WHEN status = 'maintenance' THEN 'available' ELSE status END
         WHERE id = $1 AND ambulance_id = $2`,
        [cur.rows[0].vehicle_id, ambulanceId, lastServiceDate || null, nextServiceDue || null, DEFAULT_SERVICE_INTERVAL_DAYS]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Shifts ───────────────────────────────────────────────────────────────
  async listShifts(ambulanceId, { from = null, to = null } = {}) {
    const params = [ambulanceId];
    let query = `SELECT s.id, s.ambulance_id, s.crew_id, s.vehicle_id, s.shift_date::text AS shift_date,
                        to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time, s.created_at,
                        c.name AS crew_name, c.role AS crew_role, v.registration_number
                 FROM ambulance_shift s
                 JOIN ambulance_crew c ON c.id = s.crew_id
                 LEFT JOIN ambulance_vehicle v ON v.id = s.vehicle_id
                 WHERE s.ambulance_id = $1`;
    if (from) {
      params.push(from);
      query += ` AND s.shift_date >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      query += ` AND s.shift_date <= $${params.length}::date`;
    }
    query += ` ORDER BY s.shift_date, s.start_time, s.id`;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async createShift(ambulanceId, { crewId, vehicleId = null, shiftDate, startTime, endTime }) {
    // Both the crew member and (optional) vehicle must belong to this provider.
    const crew = await pool.query(`SELECT 1 FROM ambulance_crew WHERE id = $1 AND ambulance_id = $2`, [crewId, ambulanceId]);
    if (!crew.rows.length) return null;
    if (vehicleId != null) {
      const veh = await pool.query(`SELECT 1 FROM ambulance_vehicle WHERE id = $1 AND ambulance_id = $2`, [vehicleId, ambulanceId]);
      if (!veh.rows.length) return null;
    }
    const { rows } = await pool.query(
      `INSERT INTO ambulance_shift (ambulance_id, crew_id, vehicle_id, shift_date, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, ambulance_id, crew_id, vehicle_id, shift_date::text AS shift_date,
                 to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, created_at`,
      [ambulanceId, crewId, vehicleId, shiftDate, startTime, endTime]
    );
    return rows[0];
  }

  // ── Alerts (computed, no table) ──────────────────────────────────────────
  async getAlerts(ambulanceId) {
    const [tripsRes, vehiclesRes, overdueRes] = await Promise.all([
      pool.query(
        `SELECT id, urgency, patient_name, pickup_location, status, dispatched_at
         FROM ambulance_trip
         WHERE ambulance_id = $1 AND status IN ('dispatched', 'en_route', 'arrived') AND urgency IN ('Critical', 'High')`,
        [ambulanceId]
      ),
      pool.query(
        `SELECT id, registration_number, next_service_due::text AS next_service_due, (next_service_due < CURRENT_DATE) AS is_overdue
         FROM ambulance_vehicle
         WHERE ambulance_id = $1 AND next_service_due IS NOT NULL AND next_service_due <= CURRENT_DATE + 7 AND status <> 'maintenance'`,
        [ambulanceId]
      ),
      pool.query(
        `SELECT id, patient_name, fare_amount, COALESCE(completed_at, dispatched_at) AS at
         FROM ambulance_trip WHERE ambulance_id = $1 AND payment_status = 'overdue'`,
        [ambulanceId]
      ),
    ]);

    const alerts = [];
    for (const t of tripsRes.rows) {
      alerts.push({
        id: `trip-${t.id}`,
        severity: t.urgency === 'Critical' ? 'critical' : 'warning',
        category: 'emergency',
        message: `${t.urgency} urgency trip #${t.id} (${String(t.status).replace('_', ' ')})${t.patient_name ? ` — ${t.patient_name}` : ''} from ${t.pickup_location}`,
        at: t.dispatched_at,
      });
    }
    for (const v of vehiclesRes.rows) {
      alerts.push({
        id: `vehicle-${v.id}`,
        severity: v.is_overdue ? 'critical' : 'warning',
        category: 'maintenance',
        message: v.is_overdue
          ? `Vehicle ${v.registration_number} service was due on ${v.next_service_due} and is overdue`
          : `Vehicle ${v.registration_number} is due for service on ${v.next_service_due}`,
        at: new Date(`${v.next_service_due}T00:00:00Z`).toISOString(),
      });
    }
    for (const p of overdueRes.rows) {
      alerts.push({
        id: `payment-${p.id}`,
        severity: 'warning',
        category: 'billing',
        message: `Payment overdue for trip #${p.id}${p.patient_name ? ` (${p.patient_name})` : ''}${p.fare_amount != null ? ` — ₹${p.fare_amount}` : ''}`,
        at: p.at,
      });
    }

    alerts.sort((a, b) =>
      (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || (new Date(b.at).getTime() - new Date(a.at).getTime())
    );
    return alerts;
  }
}

export default new AmbulanceFleetService();
