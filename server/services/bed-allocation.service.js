/**
 * Bed Allocation Service
 *
 * Priority order:
 *   1. Requested bed class
 *   2. Gender match
 *   3. Infection cohort isolation
 *   4. ICU proximity for post-op/critical
 *   5. Predicted LOS vs planned turnover
 *
 * B1 Safety: beds must be atomically RESERVED before admission to prevent
 * race-condition double-occupancy.  Flow: recommend → reserve → admit/occupy.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import crypto from 'crypto';

// ── B1: Reservation table bootstrap ──────────────────────────────────────────

async function ensureReservationTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS bed_reservations (
      id            BIGSERIAL PRIMARY KEY,
      token         TEXT NOT NULL UNIQUE,
      bed_id        BIGINT NOT NULL,
      organization_id BIGINT NOT NULL,
      reserved_by   TEXT,
      context       JSONB DEFAULT '{}'::jsonb,
      status        TEXT NOT NULL DEFAULT 'active',   -- active | consumed | released | expired
      reserved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
      released_at   TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bed_reservations_active_bed
      ON bed_reservations (bed_id)
      WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_bed_reservations_token ON bed_reservations(token);
  `);
}

ensureReservationTable().catch(e => console.warn('[bed-allocation] reservation table init:', e.message));

export async function getAvailableBeds(organizationId, { wardType, wardId, genderRequired } = {}) {
  let where = `b.organization_id = :orgId AND b.status = 'available'`;
  const replacements = { orgId: organizationId };

  if (wardId) {
    where += ' AND b.ward_id = :wardId';
    replacements.wardId = wardId;
  } else if (wardType) {
    where += ' AND w.ward_type = :wardType';
    replacements.wardType = wardType;
  }

  if (genderRequired) {
    where += ` AND (b.gender_restriction = 'any' OR b.gender_restriction = :gender)`;
    replacements.gender = genderRequired;
  }

  return sequelize.query(
    `SELECT b.*, w.name as ward_name, w.ward_type, w.floor, w.charge_per_day
     FROM beds b
     JOIN wards w ON w.id = b.ward_id
     WHERE ${where}
     ORDER BY w.ward_type, b.bed_number`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function autoAllocateBed(organizationId, {
  wardType = 'general',
  genderRequired,
  isIsolation = false,
  isPostOp = false,
  isCritical = false
}) {
  // Critical/post-op patients prefer ICU proximity
  const preferredWardType = isCritical ? 'icu' : isPostOp ? 'step_down' : wardType;

  let beds = await getAvailableBeds(organizationId, { wardType: preferredWardType, genderRequired });

  // Fallback: if preferred type unavailable, try step-down then general
  if (!beds.length && isCritical) {
    beds = await getAvailableBeds(organizationId, { wardType: 'step_down', genderRequired });
  }
  if (!beds.length) {
    beds = await getAvailableBeds(organizationId, { wardType, genderRequired });
  }
  if (!beds.length) {
    beds = await getAvailableBeds(organizationId, { genderRequired });
  }

  if (!beds.length) return null;

  // Prefer isolation bed if required
  if (isIsolation) {
    const isolationBed = beds.find(b => b.is_isolation);
    if (isolationBed) return isolationBed;
  }

  return beds[0];
}

export async function getBedCensus(organizationId) {
  return sequelize.query(
    `SELECT
       w.id as ward_id,
       w.name as ward_name,
       w.ward_type,
       w.capacity,
       COUNT(b.id) as total_beds,
       SUM(CASE WHEN b.status = 'available' THEN 1 ELSE 0 END) as available,
       SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) as occupied,
       SUM(CASE WHEN b.status = 'maintenance' THEN 1 ELSE 0 END) as under_maintenance,
       ROUND(SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(b.id), 0) * 100, 1) as occupancy_pct
     FROM wards w
     LEFT JOIN beds b ON b.ward_id = w.id
     WHERE w.organization_id = :orgId AND w.active = true
     GROUP BY w.id, w.name, w.ward_type, w.capacity
     ORDER BY w.name`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
  );
}

export async function getRealTimeBedMap(organizationId, wardId) {
  const where = wardId
    ? 'b.organization_id = :orgId AND b.ward_id = :wardId'
    : 'b.organization_id = :orgId';
  const replacements = { orgId: organizationId };
  if (wardId) replacements.wardId = wardId;

  return sequelize.query(
    `SELECT
       b.id, b.bed_number, b.bed_type, b.status, b.gender_restriction, b.is_isolation,
       b.ward_id, w.name as ward_name, w.ward_type, w.floor,
       a.id as admission_id, a.admission_number, a.patient_id,
       a.admission_datetime, a.status as patient_status, a.expected_los_days,
       a.admission_datetime + INTERVAL '1 day' * a.expected_los_days as expected_discharge
     FROM beds b
     JOIN wards w ON w.id = b.ward_id
     LEFT JOIN ip_admissions a ON a.id = b.current_admission_id AND a.status != 'discharged'
     WHERE ${where}
     ORDER BY w.name, b.bed_number`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function getPredictedDischarges(organizationId) {
  return sequelize.query(
    `SELECT
       a.id, a.admission_number, a.patient_id, a.ward_id, a.bed_id,
       b.bed_number, w.name as ward_name,
       a.admission_datetime,
       a.admission_datetime + INTERVAL '1 day' * a.expected_los_days as expected_discharge,
       EXTRACT(DAY FROM (a.admission_datetime + INTERVAL '1 day' * a.expected_los_days) - NOW()) as days_until_discharge
     FROM ip_admissions a
     JOIN beds b ON b.id = a.bed_id
     JOIN wards w ON w.id = a.ward_id
     WHERE a.organization_id = :orgId
       AND a.status = 'admitted'
       AND a.expected_los_days IS NOT NULL
       AND (a.admission_datetime + INTERVAL '1 day' * a.expected_los_days) <= NOW() + INTERVAL '2 days'
     ORDER BY expected_discharge`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
  );
}

// ── B1: Reservation API ───────────────────────────────────────────────────────

/**
 * Atomically reserve a specific bed for up to ttlMinutes (default 10).
 * Throws if the bed is already reserved or occupied.
 */
export async function reserveBed(organizationId, bedId, { reservedBy, context = {}, ttlMinutes = 10 } = {}) {
  const token = crypto.randomUUID();

  // Single INSERT with a unique partial index on (bed_id) WHERE status='active'
  // guarantees only one active reservation per bed at a time.
  try {
    await sequelize.query(
      `INSERT INTO bed_reservations (token, bed_id, organization_id, reserved_by, context, expires_at)
       VALUES (:token, :bedId, :orgId, :reservedBy, :ctx::jsonb,
               NOW() + MAKE_INTERVAL(mins => :ttl))`,
      {
        replacements: {
          token, bedId, orgId: organizationId,
          reservedBy: reservedBy || null,
          ctx: JSON.stringify(context),
          ttl: ttlMinutes
        },
        type: QueryTypes.INSERT
      }
    );
  } catch (err) {
    if (err.message?.includes('unique') || err.original?.code === '23505') {
      throw new Error(`Bed ${bedId} is already reserved by another admission request`);
    }
    throw err;
  }

  return { token, bedId, expiresInMinutes: ttlMinutes };
}

/**
 * Validate a reservation token and mark it consumed.
 * Called inside admitPatient() before occupying the bed.
 */
export async function consumeReservation(token, bedId, organizationId) {
  const [row] = await sequelize.query(
    `UPDATE bed_reservations
     SET status = 'consumed', released_at = NOW()
     WHERE token = :token AND bed_id = :bedId AND organization_id = :orgId
       AND status = 'active' AND expires_at > NOW()
     RETURNING id`,
    { replacements: { token, bedId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  if (!row) throw new Error('Reservation token is invalid, expired or already used');
  return true;
}

/**
 * Explicitly release a reservation (e.g. user cancels before admitting).
 */
export async function releaseBedReservation(token, organizationId) {
  await sequelize.query(
    `UPDATE bed_reservations SET status = 'released', released_at = NOW()
     WHERE token = :token AND organization_id = :orgId AND status = 'active'`,
    { replacements: { token, orgId: organizationId }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

/**
 * Background cleanup — expire stale reservations and free beds.
 */
export async function expireStaleReservations() {
  const expired = await sequelize.query(
    `UPDATE bed_reservations SET status = 'expired', released_at = NOW()
     WHERE status = 'active' AND expires_at <= NOW()
     RETURNING bed_id`,
    { type: QueryTypes.SELECT }
  );
  return expired.length;
}

export async function updateBedStatus(organizationId, bedId, status) {
  const validStatuses = ['available', 'occupied', 'under_maintenance', 'blocked', 'housekeeping'];
  if (!validStatuses.includes(status)) throw new Error('Invalid bed status');

  await sequelize.query(
    `UPDATE beds SET status = :status, updated_at = NOW() WHERE id = :bedId AND organization_id = :orgId`,
    { replacements: { status, bedId, orgId: organizationId }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}
