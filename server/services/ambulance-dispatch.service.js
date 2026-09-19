/**
 * Ambulance Dispatch Service — real trip persistence
 * ======================================================
 * Backs the currently-mocked AmbulanceDashboard.tsx. See
 * migrations/ambulance-dispatch.migration.js for schema.
 */

import pool from '../db/pgPool.js';

class AmbulanceDispatchService {
  async dispatchTrip({ ambulanceId, patientId, patientName, patientPhone, pickupLocation, dropLocation, tripType = 'emergency', urgency, driverName }) {
    const { rows } = await pool.query(
      `INSERT INTO ambulance_trip (ambulance_id, patient_id, patient_name, patient_phone, pickup_location, drop_location, trip_type, urgency, driver_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [ambulanceId, patientId, patientName, patientPhone, pickupLocation, dropLocation, tripType, urgency, driverName]
    );
    return rows[0];
  }

  // Ownership-scoped: returns undefined when the trip does not exist or
  // belongs to a different provider.
  async updateTripStatus(tripId, ambulanceId, status) {
    const timestampCol = status === 'arrived' ? 'arrived_at' : status === 'completed' ? 'completed_at' : null;
    const { rows } = await pool.query(
      `UPDATE ambulance_trip
       SET status = $2 ${timestampCol ? `, ${timestampCol} = NOW()` : ''}
       WHERE id = $1 AND ambulance_id = $3
       RETURNING *`,
      [tripId, status, ambulanceId]
    );
    return rows[0];
  }

  async listTrips(ambulanceId, { status = null, limit = 50 } = {}) {
    const params = [ambulanceId];
    let query = `SELECT * FROM ambulance_trip WHERE ambulance_id = $1`;
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY dispatched_at DESC LIMIT $${params.length}`;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async getActiveTrips(ambulanceId) {
    const { rows } = await pool.query(
      `SELECT * FROM ambulance_trip WHERE ambulance_id = $1 AND status IN ('dispatched', 'en_route', 'arrived') ORDER BY dispatched_at`,
      [ambulanceId]
    );
    return rows;
  }

  async getCompletedTrips(ambulanceId, { limit = 50 } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM ambulance_trip WHERE ambulance_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT $2`,
      [ambulanceId, limit]
    );
    return rows;
  }

  /**
   * Real dashboard stats — replaces the hardcoded {activeTrips, todayTrips,
   * avgResponseTime, successRate} object in AmbulanceDashboard.tsx.
   * avgResponseTime is measured as dispatched_at -> arrived_at, in minutes,
   * over completed trips in the last 30 days (a real proxy, not identical
   * to "time to reach patient" if arrived_at is recorded at drop-off
   * instead — the column doc in ambulance-dispatch.migration.js should be
   * the source of truth for what arrived_at means as usage settles).
   */
  async getStats(ambulanceId) {
    const [activeRes, todayRes, avgResponseRes, successRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS cnt FROM ambulance_trip WHERE ambulance_id = $1 AND status IN ('dispatched','en_route','arrived')`, [ambulanceId]),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM ambulance_trip WHERE ambulance_id = $1 AND status = 'completed' AND completed_at::date = CURRENT_DATE`, [ambulanceId]),
      pool.query(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (arrived_at - dispatched_at)) / 60)::numeric, 1) AS avg_minutes
         FROM ambulance_trip WHERE ambulance_id = $1 AND arrived_at IS NOT NULL AND dispatched_at >= NOW() - INTERVAL '30 days'`,
        [ambulanceId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*)::int AS total
         FROM ambulance_trip WHERE ambulance_id = $1 AND status NOT IN ('dispatched','en_route','arrived') AND dispatched_at >= NOW() - INTERVAL '30 days'`,
        [ambulanceId]
      ),
    ]);
    const totalNonActive = successRes.rows[0]?.total || 0;
    const completed = successRes.rows[0]?.completed || 0;
    return {
      activeTrips: activeRes.rows[0]?.cnt || 0,
      todayTrips: todayRes.rows[0]?.cnt || 0,
      avgResponseTime: avgResponseRes.rows[0]?.avg_minutes != null ? `${avgResponseRes.rows[0].avg_minutes} mins` : null,
      successRate: totalNonActive > 0 ? `${Math.round((completed / totalNonActive) * 100)}%` : null,
    };
  }

  // ── Billing ──────────────────────────────────────────────────────────────
  async setTripFare(tripId, ambulanceId, { fareAmount, paymentStatus }) {
    const { rows } = await pool.query(
      `UPDATE ambulance_trip SET fare_amount = COALESCE($2, fare_amount), payment_status = COALESCE($3, payment_status)
       WHERE id = $1 AND ambulance_id = $4 RETURNING *`,
      [tripId, fareAmount, paymentStatus, ambulanceId]
    );
    return rows[0];
  }

  async getFinancialSummary(ambulanceId) {
    const { rows } = await pool.query(
      `SELECT payment_status, COUNT(*)::int AS cnt, COALESCE(SUM(fare_amount), 0) AS total
       FROM ambulance_trip WHERE ambulance_id = $1 AND fare_amount IS NOT NULL
       GROUP BY payment_status`,
      [ambulanceId]
    );
    return rows;
  }
}

export default new AmbulanceDispatchService();
