/**
 * Parking Service
 * =================================================================
 * Hospital parking operations (lots, vehicle movements, passes, security
 * watchlist, incidents, overstay alerts, device registry, analytics).
 * Administrative/operational only — not a clinical or SaMD component.
 * Schema: server/migrations/parking.migration.js. Ported from the iPark
 * reference app, moved from a global Convex store to per-organization
 * Postgres tables.
 *
 * Every method takes organizationId first and scopes every statement to it;
 * a row that belongs to another organization behaves exactly like a missing
 * row (undefined / null -> route 404).
 */

import pool from '../db/pgPool.js';

export class ParkingError extends Error {
  constructor(message, { status = 400, code = 'PARKING_ERROR', details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const VEHICLE_TYPES = ['two_wheeler', 'car'];
export const PASS_TYPES = ['monthly', 'vip', 'free', 'token', 'staff'];
const HOLDER_TYPES = ['staff', 'doctor', 'patient', 'visitor', 'vendor', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];
const INCIDENT_TYPES = ['theft', 'vandalism', 'suspicious', 'accident', 'unauthorized', 'overstay', 'other'];
const INCIDENT_STATUSES = ['open', 'investigating', 'resolved'];
const DEVICE_TYPES = ['boom_barrier', 'led_display', 'token_printer'];
const DEVICE_STATUSES = ['online', 'offline', 'error'];
const DEVICE_POSITIONS = ['entry', 'exit', 'both'];
// Passes that never count as an overstay (the vehicle is expected to stay).
const VALET_OPEN = ['received', 'parked', 'retrieval_requested', 'ready'];
const VALET_STATUSES = [...VALET_OPEN, 'delivered', 'cancelled'];
const HANDOVER_CHECKS = ['ticket', 'id_check', 'phone_match'];
const OVERSTAY_EXEMPT_PASS_TYPES = ['vip', 'free', 'staff'];

export function normalizeVehicleNumber(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function requireVehicleNumber(value, { optional = false } = {}) {
  const n = normalizeVehicleNumber(value);
  if (!n) {
    if (optional) return null;
    throw new ParkingError('vehicleNumber is required');
  }
  if (n.length < 4 || n.length > 12) throw new ParkingError('vehicleNumber must be 4-12 letters/digits');
  return n;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new ParkingError(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function capacityInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new ParkingError(`${field} must be a whole number between 0 and 100000`);
  return n;
}

const TZ = 'Asia/Kolkata'; // hospital-local day boundaries for activity reports

const minutesBetween = (from, to) => Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 60000));

// Occupancy of a lot = movements since counted_from, per vehicle type, floored at 0.
// An exit that belongs to an entry from before counted_from is ignored: that vehicle was
// wiped by the reset, so its departure must not push the new count below the truth.
const DELTA_SQL = `(CASE
    WHEN v.action = 'entry' THEN 1
    WHEN v.entry_log_id IS NOT NULL AND e.logged_at <= l.counted_from THEN 0
    ELSE -1 END)`;
const OCCUPANCY_SQL = `
  SELECT l.id AS lot_id,
         GREATEST(0, COALESCE(SUM(CASE WHEN v.vehicle_type = 'two_wheeler' THEN ${DELTA_SQL} END), 0))::int AS two_wheelers,
         GREATEST(0, COALESCE(SUM(CASE WHEN v.vehicle_type = 'car' THEN ${DELTA_SQL} END), 0))::int AS cars
  FROM parking_lot l
  LEFT JOIN parking_vehicle_log v ON v.lot_id = l.id AND v.logged_at > l.counted_from
  LEFT JOIN parking_vehicle_log e ON e.id = v.entry_log_id
`;

class ParkingService {
  // ── Lots ────────────────────────────────────────────────────────────────
  async listLots(org) {
    const { rows } = await pool.query(
      `SELECT lot.*, COALESCE(o.two_wheelers, 0) AS two_wheelers, COALESCE(o.cars, 0) AS cars
       FROM parking_lot lot
       LEFT JOIN (${OCCUPANCY_SQL} WHERE l.organization_id = $1 AND l.is_active GROUP BY l.id) o ON o.lot_id = lot.id
       WHERE lot.organization_id = $1 AND lot.is_active
       ORDER BY lot.id`,
      [org]
    );
    return rows;
  }

  async getLot(org, lotId) {
    const { rows } = await pool.query(
      `SELECT lot.*, COALESCE(o.two_wheelers, 0) AS two_wheelers, COALESCE(o.cars, 0) AS cars
       FROM parking_lot lot
       LEFT JOIN (${OCCUPANCY_SQL} WHERE l.id = $2 AND l.organization_id = $1 GROUP BY l.id) o ON o.lot_id = lot.id
       WHERE lot.id = $2 AND lot.organization_id = $1 AND lot.is_active`,
      [org, lotId]
    );
    return rows[0];
  }

  async createLot(org, { name, twoWheelerCapacity, carCapacity }) {
    const cleanName = String(name ?? '').trim();
    if (!cleanName) throw new ParkingError('name is required');
    try {
      const { rows } = await pool.query(
        `INSERT INTO parking_lot (organization_id, name, two_wheeler_capacity, car_capacity)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [org, cleanName, capacityInt(twoWheelerCapacity ?? 0, 'twoWheelerCapacity'), capacityInt(carCapacity ?? 0, 'carCapacity')]
      );
      return { ...rows[0], two_wheelers: 0, cars: 0 };
    } catch (e) {
      if (e.code === '23505') throw new ParkingError('A parking lot with this name already exists', { status: 409, code: 'DUPLICATE_LOT' });
      throw e;
    }
  }

  async updateLot(org, lotId, { name, twoWheelerCapacity, carCapacity }) {
    const cleanName = String(name ?? '').trim();
    if (!cleanName) throw new ParkingError('name is required');
    try {
      const { rows } = await pool.query(
        `UPDATE parking_lot SET name = $3, two_wheeler_capacity = $4, car_capacity = $5
         WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`,
        [lotId, org, cleanName, capacityInt(twoWheelerCapacity, 'twoWheelerCapacity'), capacityInt(carCapacity, 'carCapacity')]
      );
      return rows[0] ? this.getLot(org, lotId) : undefined;
    } catch (e) {
      if (e.code === '23505') throw new ParkingError('A parking lot with this name already exists', { status: 409, code: 'DUPLICATE_LOT' });
      throw e;
    }
  }

  // Lots are retired, not deleted: movement history, incidents and alerts stay auditable.
  async archiveLot(org, lotId) {
    const { rows } = await pool.query(
      `UPDATE parking_lot SET is_active = false WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`,
      [lotId, org]
    );
    return rows[0];
  }

  // Zero the live counters (e.g. after a physical recount) without deleting history.
  async resetOccupancy(org, lotId) {
    const { rows } = await pool.query(
      `UPDATE parking_lot SET counted_from = NOW() WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`,
      [lotId, org]
    );
    return rows[0] ? this.getLot(org, lotId) : undefined;
  }

  async updateSecuritySettings(org, lotId, { maxParkingMinutes, securityEnabled }) {
    let max = null;
    if (maxParkingMinutes !== undefined && maxParkingMinutes !== null && maxParkingMinutes !== '') {
      max = Number(maxParkingMinutes);
      if (!Number.isInteger(max) || max <= 0 || max > 10080) throw new ParkingError('maxParkingMinutes must be a whole number between 1 and 10080');
    }
    const { rows } = await pool.query(
      `UPDATE parking_lot SET max_parking_minutes = $3, security_enabled = $4
       WHERE id = $1 AND organization_id = $2 AND is_active RETURNING id`,
      [lotId, org, max, Boolean(securityEnabled)]
    );
    return rows[0] ? this.getLot(org, lotId) : undefined;
  }

  // ── Movements ───────────────────────────────────────────────────────────
  async listActiveVehicles(org, lotId) {
    const { rows } = await pool.query(
      `SELECT vehicle_number, vehicle_type, logged_at AS entry_time, id AS entry_log_id
       FROM (
         SELECT DISTINCT ON (vehicle_number) *
         FROM parking_vehicle_log
         WHERE organization_id = $1 AND lot_id = $2 AND vehicle_number IS NOT NULL
         ORDER BY vehicle_number, logged_at DESC, id DESC
       ) cur
       WHERE action = 'entry'
       ORDER BY logged_at DESC`,
      [org, lotId]
    );
    return rows;
  }

  async listRecentLogs(org, lotId, limit = 100) {
    const { rows } = await pool.query(
      `SELECT * FROM parking_vehicle_log
       WHERE organization_id = $1 AND lot_id = $2
       ORDER BY logged_at DESC, id DESC LIMIT $3`,
      [org, lotId, Math.min(Math.max(Number(limit) || 100, 1), 500)]
    );
    return rows;
  }

  /**
   * Record one entry or exit. The lot row is locked for the duration so two
   * gates cannot both take the last space or double-book the same plate.
   *
   * With a plate: entry is refused if that plate is already parked anywhere in
   * the organization, exit needs a matching open entry (duration is computed
   * here, never trusted from the client). Without a plate it is a headcount
   * movement, exactly as in the reference app.
   */
  async recordMovement(org, lotId, input) {
    const params = this._cleanMovement(input);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await this._movementTx(client, org, lotId, params);
      await client.query(out ? 'COMMIT' : 'ROLLBACK');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  _cleanMovement({ vehicleType, action, method = 'manual', vehicleNumber, note, emergencyOverride = false, userId = null, valetTicketId = null }) {
    oneOf(vehicleType, VEHICLE_TYPES, 'vehicleType');
    oneOf(action, ['entry', 'exit'], 'action');
    oneOf(method, ['manual', 'ai'], 'method');
    return {
      vehicleType, action, method, emergencyOverride, userId, valetTicketId,
      plate: requireVehicleNumber(vehicleNumber, { optional: true }),
      cleanNote: note ? String(note).slice(0, 500) : null,
    };
  }

  // One movement inside a caller-owned transaction. Locks the lot row so parallel gates
  // cannot overfill it or double-book a plate. Returns undefined when the lot is not
  // this organization's (caller rolls back -> 404).
  async _movementTx(client, org, lotId, { vehicleType, action, method, plate, cleanNote, emergencyOverride, userId, valetTicketId }) {
    const { rows: lots } = await client.query(
      `SELECT * FROM parking_lot WHERE id = $1 AND organization_id = $2 AND is_active FOR UPDATE`,
      [lotId, org]
    );
    const lot = lots[0];
    if (!lot) return undefined;

    const now = new Date();
    const warnings = [];
    let passResult = null;
    let watchlistHit = null;
    let duration = null;
    let entryLogId = null;
    let passId = null;
    let effectiveType = vehicleType;

    const { rows: occ } = await client.query(
      `${OCCUPANCY_SQL} WHERE l.id = $1 GROUP BY l.id`, [lotId]
    );
    const occupancy = { two_wheeler: occ[0]?.two_wheelers ?? 0, car: occ[0]?.cars ?? 0 };

    if (action === 'entry') {
      const capacity = vehicleType === 'car' ? lot.car_capacity : lot.two_wheeler_capacity;
      if (occupancy[vehicleType] >= capacity) {
        if (!emergencyOverride) {
          throw new ParkingError(`Lot is full for ${vehicleType === 'car' ? 'cars' : 'two-wheelers'} (${capacity}/${capacity})`, { status: 409, code: 'LOT_FULL' });
        }
        warnings.push('Capacity override used (emergency)');
      }
      if (plate) {
        const open = await this._openSession(client, org, plate);
        if (open) {
          throw new ParkingError(`${plate} is already inside (entered ${new Date(open.logged_at).toISOString()})`, { status: 409, code: 'ALREADY_INSIDE', details: { lotId: open.lot_id } });
        }
        watchlistHit = await this._watchlistHit(client, org, plate);
        passResult = await this._checkPass(client, org, plate, lotId);
        if (passResult.hasValidPass) {
          passId = passResult.pass.id;
          if (passResult.pass.pass_type === 'token') {
            const { rows: consumed } = await client.query(
              `UPDATE parking_pass
                 SET token_balance = token_balance - 1,
                     is_active = (token_balance - 1) > 0,
                     revoked_at = CASE WHEN (token_balance - 1) > 0 THEN revoked_at ELSE NOW() END
               WHERE id = $1 AND organization_id = $2 AND is_active AND token_balance > 0
               RETURNING token_balance`,
              [passId, org]
            );
            if (!consumed[0]) {
              passResult = { hasValidPass: false, pass: null, reason: 'Token balance depleted' };
              passId = null;
            } else {
              passResult.pass.token_balance = consumed[0].token_balance;
            }
          }
        }
      }
    } else if (plate) {
      const open = await this._openSession(client, org, plate);
      if (!open || open.lot_id !== lotId) {
        throw new ParkingError(`No matching entry found for ${plate} in this lot`, { status: 409, code: 'NOT_INSIDE' });
      }
      duration = minutesBetween(open.logged_at, now);
      entryLogId = open.id;
      effectiveType = open.vehicle_type;
      passId = open.pass_id;
    } else if (occupancy[vehicleType] <= 0) {
      throw new ParkingError(`No ${vehicleType === 'car' ? 'cars' : 'two-wheelers'} are recorded inside this lot`, { status: 409, code: 'LOT_EMPTY' });
    }

    const { rows: logs } = await client.query(
      `INSERT INTO parking_vehicle_log
         (organization_id, lot_id, vehicle_type, action, method, vehicle_number, note, parking_duration_minutes, pass_id, recorded_by, logged_at, valet_ticket_id, entry_log_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [org, lotId, effectiveType, action, method, plate, cleanNote, duration, passId, userId, now, valetTicketId, entryLogId]
    );
    return { log: logs[0], pass: passResult, watchlistHit, warnings };
  }

  async _openSession(db, org, plate) {
    const { rows } = await db.query(
      `SELECT * FROM parking_vehicle_log
       WHERE organization_id = $1 AND vehicle_number = $2
       ORDER BY logged_at DESC, id DESC LIMIT 1`,
      [org, plate]
    );
    return rows[0]?.action === 'entry' ? rows[0] : null;
  }

  async _watchlistHit(db, org, plate) {
    const { rows } = await db.query(
      `SELECT * FROM parking_watchlist WHERE organization_id = $1 AND vehicle_number = $2 AND is_active LIMIT 1`,
      [org, plate]
    );
    return rows[0] || null;
  }

  // Best applicable pass: lot-scoped or global, not expired, tokens remaining.
  async _checkPass(db, org, plate, lotId) {
    const { rows } = await db.query(
      `SELECT * FROM parking_pass WHERE organization_id = $1 AND vehicle_number = $2 AND is_active
       ORDER BY (lot_id IS NULL), issued_at DESC`,
      [org, plate]
    );
    if (rows.length === 0) return { hasValidPass: false, pass: null, reason: 'No active pass' };
    const now = Date.now();
    for (const p of rows) {
      if (p.lot_id && lotId && p.lot_id !== lotId) continue;
      if (p.expires_at && new Date(p.expires_at).getTime() < now) continue;
      if (p.pass_type === 'token' && (p.token_balance ?? 0) <= 0) continue;
      return { hasValidPass: true, pass: p };
    }
    const first = rows[0];
    let reason = 'No valid pass for this lot';
    if (first.expires_at && new Date(first.expires_at).getTime() < now) reason = 'Pass expired';
    else if (first.pass_type === 'token' && (first.token_balance ?? 0) <= 0) reason = 'Token balance depleted';
    return { hasValidPass: false, pass: null, reason };
  }

  // Read-only gate check used before a barrier opens.
  async checkVehicle(org, plateInput, lotId = null) {
    const plate = requireVehicleNumber(plateInput);
    const [pass, watchlistHit, open] = await Promise.all([
      this._checkPass(pool, org, plate, lotId),
      this._watchlistHit(pool, org, plate),
      this._openSession(pool, org, plate),
    ]);
    return { vehicleNumber: plate, ...pass, watchlistHit, alreadyInside: open ? { lotId: open.lot_id, since: open.logged_at } : null };
  }

  // ── Passes ──────────────────────────────────────────────────────────────
  async listPasses(org, { activeOnly = false, lotId = null, search = null } = {}) {
    const params = [org];
    const where = ['p.organization_id = $1'];
    if (activeOnly) where.push('p.is_active');
    if (lotId) { params.push(lotId); where.push(`p.lot_id = $${params.length}`); }
    if (search) { params.push(`%${normalizeVehicleNumber(search)}%`); where.push(`p.vehicle_number LIKE $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT p.*, lot.name AS lot_name FROM parking_pass p
       LEFT JOIN parking_lot lot ON lot.id = p.lot_id
       WHERE ${where.join(' AND ')} ORDER BY p.issued_at DESC LIMIT 500`,
      params
    );
    return rows;
  }

  async getPassStats(org, lotId = null) {
    const params = [org];
    let extra = '';
    if (lotId) { params.push(lotId); extra = ' AND lot_id = $2'; }
    const { rows } = await pool.query(
      `SELECT pass_type, COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*)::int AS total
       FROM parking_pass WHERE organization_id = $1${extra} GROUP BY pass_type`,
      params
    );
    const byType = {};
    let active = 0; let total = 0;
    for (const r of rows) { byType[r.pass_type] = r.active; active += r.active; total += r.total; }
    return { total, active, byType };
  }

  async issuePass(org, { vehicleNumber, passType, holderName, holderType, lotId, expiresAt, tokenBalance, note, issuedBy }) {
    const plate = requireVehicleNumber(vehicleNumber);
    oneOf(passType, PASS_TYPES, 'passType');
    if (holderType) oneOf(holderType, HOLDER_TYPES, 'holderType');

    let expires = null;
    if (expiresAt) {
      expires = new Date(expiresAt);
      if (Number.isNaN(expires.getTime())) throw new ParkingError('expiresAt is not a valid date');
      if (expires.getTime() <= Date.now()) throw new ParkingError('expiresAt must be in the future');
    } else if (passType === 'monthly') {
      throw new ParkingError('A monthly pass needs an expiry date');
    }
    let tokens = null;
    if (passType === 'token') {
      tokens = Number(tokenBalance ?? 0);
      if (!Number.isInteger(tokens) || tokens <= 0 || tokens > 100000) throw new ParkingError('tokenBalance must be a positive whole number');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (lotId) {
        const { rows } = await client.query(`SELECT 1 FROM parking_lot WHERE id = $1 AND organization_id = $2 AND is_active`, [lotId, org]);
        if (!rows[0]) throw new ParkingError('Parking lot not found', { status: 404, code: 'LOT_NOT_FOUND' });
      }
      // One active pass per vehicle per type: retire the previous one.
      await client.query(
        `UPDATE parking_pass SET is_active = false, revoked_at = NOW()
         WHERE organization_id = $1 AND vehicle_number = $2 AND pass_type = $3 AND is_active`,
        [org, plate, passType]
      );
      const { rows } = await client.query(
        `INSERT INTO parking_pass (organization_id, vehicle_number, pass_type, holder_name, holder_type, lot_id, expires_at, token_balance, issued_by, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [org, plate, passType, holderName ? String(holderName).slice(0, 120) : null, holderType || null, lotId || null, expires, tokens, issuedBy || null, note ? String(note).slice(0, 500) : null]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async revokePass(org, passId) {
    const { rows } = await pool.query(
      `UPDATE parking_pass SET is_active = false, revoked_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND is_active RETURNING *`,
      [passId, org]
    );
    return rows[0];
  }

  async reactivatePass(org, passId) {
    const { rows: existing } = await pool.query(`SELECT * FROM parking_pass WHERE id = $1 AND organization_id = $2`, [passId, org]);
    const pass = existing[0];
    if (!pass) return undefined;
    if (pass.is_active) return pass;
    if (pass.expires_at && new Date(pass.expires_at).getTime() < Date.now()) throw new ParkingError('Pass has expired; issue a new one', { status: 409 });
    if (pass.pass_type === 'token' && (pass.token_balance ?? 0) <= 0) throw new ParkingError('Token balance is zero; top up first', { status: 409 });
    try {
      const { rows } = await pool.query(
        `UPDATE parking_pass SET is_active = true, revoked_at = NULL WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [passId, org]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw new ParkingError('Another active pass of this type already exists for the vehicle', { status: 409 });
      throw e;
    }
  }

  async topUpTokens(org, passId, amount) {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0 || n > 100000) throw new ParkingError('amount must be a positive whole number');
    const { rows } = await pool.query(
      `UPDATE parking_pass SET token_balance = COALESCE(token_balance, 0) + $3, is_active = true, revoked_at = NULL
       WHERE id = $1 AND organization_id = $2 AND pass_type = 'token' RETURNING *`,
      [passId, org, n]
    );
    if (rows[0]) return rows[0];
    const { rows: exists } = await pool.query(`SELECT pass_type FROM parking_pass WHERE id = $1 AND organization_id = $2`, [passId, org]);
    if (exists[0]) throw new ParkingError('Can only top up token passes', { status: 409 });
    return undefined;
  }

  // ── Watchlist ───────────────────────────────────────────────────────────
  async listWatchlist(org, { activeOnly = true } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM parking_watchlist WHERE organization_id = $1 ${activeOnly ? 'AND is_active' : ''} ORDER BY added_at DESC LIMIT 500`,
      [org]
    );
    return rows;
  }

  async addToWatchlist(org, { vehicleNumber, reason, severity, notes, addedBy }) {
    const plate = requireVehicleNumber(vehicleNumber);
    const cleanReason = String(reason ?? '').trim();
    if (!cleanReason) throw new ParkingError('reason is required');
    oneOf(severity, SEVERITIES, 'severity');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE parking_watchlist SET is_active = false WHERE organization_id = $1 AND vehicle_number = $2 AND is_active`, [org, plate]);
      const { rows } = await client.query(
        `INSERT INTO parking_watchlist (organization_id, vehicle_number, reason, severity, notes, added_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [org, plate, cleanReason.slice(0, 300), severity, notes ? String(notes).slice(0, 500) : null, addedBy || null]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async removeFromWatchlist(org, id) {
    const { rows } = await pool.query(
      `UPDATE parking_watchlist SET is_active = false WHERE id = $1 AND organization_id = $2 AND is_active RETURNING *`,
      [id, org]
    );
    return rows[0];
  }

  // ── Incidents ───────────────────────────────────────────────────────────
  async listIncidents(org, { lotId = null, status = null } = {}) {
    const params = [org];
    const where = ['i.organization_id = $1'];
    if (lotId) { params.push(lotId); where.push(`i.lot_id = $${params.length}`); }
    if (status) { params.push(oneOf(status, INCIDENT_STATUSES, 'status')); where.push(`i.status = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT i.*, lot.name AS lot_name FROM parking_incident i JOIN parking_lot lot ON lot.id = i.lot_id
       WHERE ${where.join(' AND ')} ORDER BY i.reported_at DESC LIMIT 200`,
      params
    );
    return rows;
  }

  async reportIncident(org, { lotId, type, severity, title, description, vehicleNumber, reportedBy }) {
    oneOf(type, INCIDENT_TYPES, 'type');
    oneOf(severity, SEVERITIES, 'severity');
    const cleanTitle = String(title ?? '').trim();
    const cleanDesc = String(description ?? '').trim();
    if (!cleanTitle || !cleanDesc) throw new ParkingError('title and description are required');
    const plate = requireVehicleNumber(vehicleNumber, { optional: true });
    const { rows } = await pool.query(
      `INSERT INTO parking_incident (organization_id, lot_id, type, severity, title, description, vehicle_number, reported_by)
       SELECT $1, lot.id, $3, $4, $5, $6, $7, $8 FROM parking_lot lot WHERE lot.id = $2 AND lot.organization_id = $1 AND lot.is_active
       RETURNING *`,
      [org, lotId, type, severity, cleanTitle.slice(0, 200), cleanDesc.slice(0, 2000), plate, reportedBy || null]
    );
    return rows[0];
  }

  async updateIncidentStatus(org, id, { status, resolvedNote }) {
    oneOf(status, INCIDENT_STATUSES, 'status');
    if (status === 'resolved' && !String(resolvedNote ?? '').trim()) throw new ParkingError('A resolution note is required to resolve an incident');
    const { rows } = await pool.query(
      `UPDATE parking_incident
         SET status = $3,
             resolved_at = CASE WHEN $3 = 'resolved' THEN NOW() ELSE NULL END,
             resolved_note = CASE WHEN $3 = 'resolved' THEN $4 ELSE NULL END
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, org, status, resolvedNote ? String(resolvedNote).slice(0, 1000) : null]
    );
    return rows[0];
  }

  // ── Overstay ────────────────────────────────────────────────────────────
  async listOverstayAlerts(org, { lotId = null, unacknowledgedOnly = false } = {}) {
    const params = [org];
    const where = ['a.organization_id = $1'];
    if (lotId) { params.push(lotId); where.push(`a.lot_id = $${params.length}`); }
    if (unacknowledgedOnly) where.push('NOT a.is_acknowledged');
    const { rows } = await pool.query(
      `SELECT a.*, lot.name AS lot_name FROM parking_overstay_alert a JOIN parking_lot lot ON lot.id = a.lot_id
       WHERE ${where.join(' AND ')} ORDER BY a.alerted_at DESC LIMIT 200`,
      params
    );
    return rows;
  }

  async acknowledgeOverstay(org, id, userId = null) {
    const { rows } = await pool.query(
      `UPDATE parking_overstay_alert SET is_acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, org, userId]
    );
    return rows[0];
  }

  /**
   * Raise an alert for every vehicle currently inside a security-enabled lot
   * for longer than that lot's limit. Idempotent (unique lot+plate+entry time)
   * so it is safe to run on a schedule and on demand. org = null scans every
   * organization (cron); otherwise only that one.
   */
  async scanOverstay(org = null) {
    const params = org ? [org, OVERSTAY_EXEMPT_PASS_TYPES] : [OVERSTAY_EXEMPT_PASS_TYPES];
    const orgFilter = org ? 'AND lot.organization_id = $1' : '';
    const exemptParam = org ? '$2' : '$1';
    const { rows } = await pool.query(
      `INSERT INTO parking_overstay_alert (organization_id, lot_id, vehicle_number, vehicle_type, entry_time, threshold_minutes)
       SELECT lot.organization_id, lot.id, cur.vehicle_number, cur.vehicle_type, cur.logged_at, lot.max_parking_minutes
       FROM parking_lot lot
       JOIN LATERAL (
         SELECT * FROM (
           SELECT DISTINCT ON (vehicle_number) *
           FROM parking_vehicle_log
           WHERE lot_id = lot.id AND vehicle_number IS NOT NULL
           ORDER BY vehicle_number, logged_at DESC, id DESC
         ) s WHERE s.action = 'entry'
       ) cur ON true
       WHERE lot.is_active AND lot.security_enabled AND lot.max_parking_minutes IS NOT NULL ${orgFilter}
         AND cur.logged_at < NOW() - (lot.max_parking_minutes || ' minutes')::interval
         AND NOT EXISTS (
           SELECT 1 FROM parking_pass p
           WHERE p.organization_id = lot.organization_id AND p.vehicle_number = cur.vehicle_number
             AND p.is_active AND p.pass_type = ANY(${exemptParam}::text[])
         )
       ON CONFLICT (lot_id, vehicle_number, entry_time) DO NOTHING
       RETURNING id`,
      params
    );
    return { created: rows.length };
  }

  async getSecuritySummary(org, lotId = null) {
    const params = [org];
    let lotFilter = '';
    if (lotId) { params.push(lotId); lotFilter = ' AND lot_id = $2'; }
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM parking_incident WHERE organization_id = $1${lotFilter} AND status = 'open')::int AS open_incidents,
         (SELECT COUNT(*) FROM parking_overstay_alert WHERE organization_id = $1${lotFilter} AND NOT is_acknowledged)::int AS unacknowledged_overstays,
         (SELECT COUNT(*) FROM parking_watchlist WHERE organization_id = $1 AND is_active)::int AS watchlist_count`,
      params
    );
    return rows[0];
  }

  // ── Overview & analytics ────────────────────────────────────────────────
  async getOverview(org) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM parking_pass WHERE organization_id = $1 AND is_active AND (expires_at IS NULL OR expires_at > NOW()))::int AS active_passes,
         (SELECT COUNT(*) FROM parking_incident WHERE organization_id = $1 AND status <> 'resolved')::int AS open_incidents,
         (SELECT COUNT(*) FROM parking_overstay_alert WHERE organization_id = $1 AND NOT is_acknowledged)::int AS unacknowledged_overstays,
         (SELECT COUNT(*) FROM parking_vehicle_log WHERE organization_id = $1 AND action = 'entry' AND (logged_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date)::int AS today_entries,
         (SELECT COUNT(*) FROM parking_valet_ticket WHERE organization_id = $1 AND status = ANY(ARRAY['received','parked','retrieval_requested','ready']))::int AS valet_active,
         (SELECT COUNT(*) FROM parking_valet_ticket WHERE organization_id = $1 AND status = 'retrieval_requested')::int AS valet_awaiting_retrieval,
         (SELECT COUNT(*) FROM parking_vehicle_log WHERE organization_id = $1 AND action = 'exit' AND (logged_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date)::int AS today_exits`,
      [org]
    );
    return rows[0];
  }

  async getDailyActivity(org, { days = 14, lotId = null } = {}) {
    const span = Math.min(Math.max(Number(days) || 14, 1), 90);
    const params = [org, span];
    let lotFilter = '';
    if (lotId) { params.push(lotId); lotFilter = ' AND lot_id = $3'; }
    const { rows } = await pool.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS date,
              COALESCE(SUM((v.action = 'entry')::int), 0)::int AS entries,
              COALESCE(SUM((v.action = 'exit')::int), 0)::int AS exits,
              COALESCE(ROUND(AVG(v.parking_duration_minutes) FILTER (WHERE v.action = 'exit')), 0)::int AS avg_duration_minutes
       FROM generate_series(date_trunc('day', NOW() AT TIME ZONE '${TZ}') - ($2 - 1) * INTERVAL '1 day', date_trunc('day', NOW() AT TIME ZONE '${TZ}'), INTERVAL '1 day') d
       LEFT JOIN parking_vehicle_log v
         ON v.organization_id = $1 AND (v.logged_at AT TIME ZONE '${TZ}') >= d AND (v.logged_at AT TIME ZONE '${TZ}') < d + INTERVAL '1 day'${lotFilter.replace('lot_id', 'v.lot_id')}
       GROUP BY d ORDER BY d`,
      params
    );
    return rows;
  }

  async getHourlyBreakdown(org, { days = 14, lotId = null } = {}) {
    const span = Math.min(Math.max(Number(days) || 14, 1), 90);
    const params = [org, span];
    let lotFilter = '';
    if (lotId) { params.push(lotId); lotFilter = ' AND lot_id = $3'; }
    const { rows } = await pool.query(
      `SELECT h AS hour,
              COALESCE(SUM((v.action = 'entry')::int), 0)::int AS entries,
              COALESCE(SUM((v.action = 'exit')::int), 0)::int AS exits
       FROM generate_series(0, 23) h
       LEFT JOIN parking_vehicle_log v
         ON v.organization_id = $1 AND v.logged_at >= NOW() - ($2 * INTERVAL '1 day')
        AND EXTRACT(HOUR FROM v.logged_at AT TIME ZONE '${TZ}') = h${lotFilter.replace('lot_id', 'v.lot_id')}
       GROUP BY h ORDER BY h`,
      params
    );
    return rows;
  }

  // ── Valet parking ───────────────────────────────────────────────────────
  // received -> parked -> retrieval_requested -> ready -> delivered  (or cancelled while
  // still 'received'). Every transition is a conditional UPDATE / row lock on the ticket,
  // so two attendants cannot both advance the same ticket. Parking and retrieving write
  // ordinary movements, so capacity, duplicate-plate and overstay rules apply to valet cars.
  async listValetTickets(org, { status = null, openOnly = false, search = null, limit = 200 } = {}) {
    const params = [org];
    const where = ['t.organization_id = $1'];
    if (openOnly) where.push(`t.status = ANY(ARRAY['received','parked','retrieval_requested','ready'])`);
    if (status) { params.push(oneOf(status, VALET_STATUSES, 'status')); where.push(`t.status = $${params.length}`); }
    if (search) {
      const term = String(search).trim();
      const digits = term.replace(/\D/g, '');
      params.push(`%${term.toUpperCase()}%`); const a = params.length;
      params.push(`%${normalizeVehicleNumber(term)}%`); const b = params.length;
      const phone = digits.length >= 4 ? ` OR t.customer_phone LIKE $${params.push(`%${digits}`)}` : '';
      where.push(`(upper(t.ticket_no) LIKE $${a} OR t.vehicle_number LIKE $${b}${phone})`);
    }
    params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
    const { rows } = await pool.query(
      `SELECT t.*, lot.name AS lot_name FROM parking_valet_ticket t LEFT JOIN parking_lot lot ON lot.id = t.lot_id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE t.status WHEN 'retrieval_requested' THEN 0 WHEN 'ready' THEN 1 WHEN 'received' THEN 2 WHEN 'parked' THEN 3 ELSE 4 END,
                t.requested_at ASC NULLS LAST, t.received_at DESC
       LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  async getValetTicket(org, id) {
    const { rows } = await pool.query(
      `SELECT t.*, lot.name AS lot_name FROM parking_valet_ticket t LEFT JOIN parking_lot lot ON lot.id = t.lot_id
       WHERE t.id = $1 AND t.organization_id = $2`,
      [id, org]
    );
    return rows[0];
  }

  async getValetStats(org) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'received')::int AS received,
         COUNT(*) FILTER (WHERE status = 'parked')::int AS parked,
         COUNT(*) FILTER (WHERE status = 'retrieval_requested')::int AS awaiting_retrieval,
         COUNT(*) FILTER (WHERE status = 'ready')::int AS ready,
         COUNT(*) FILTER (WHERE status = 'delivered' AND (delivered_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date)::int AS delivered_today,
         ROUND(AVG(EXTRACT(EPOCH FROM (ready_at - requested_at)) / 60) FILTER (WHERE ready_at IS NOT NULL AND requested_at > NOW() - INTERVAL '7 days'))::int AS avg_retrieval_minutes_7d,
         ROUND(AVG(EXTRACT(EPOCH FROM (parked_at - received_at)) / 60) FILTER (WHERE parked_at IS NOT NULL AND received_at > NOW() - INTERVAL '7 days'))::int AS avg_park_minutes_7d
       FROM parking_valet_ticket WHERE organization_id = $1`,
      [org]
    );
    return rows[0];
  }

  async createValetTicket(org, { vehicleNumber, vehicleType, customerName, customerPhone, keyTag, conditionNotes, receivedBy }) {
    const plate = requireVehicleNumber(vehicleNumber);
    oneOf(vehicleType, VEHICLE_TYPES, 'vehicleType');
    const name = String(customerName ?? '').trim();
    if (!name) throw new ParkingError('customerName is required');
    const phone = String(customerPhone ?? '').replace(/[^\d+]/g, '');
    if (!/^\+?\d{10,15}$/.test(phone)) throw new ParkingError('customerPhone must be 10-15 digits');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialise ticket numbering per organization (gap-free per day).
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`valet:${org}`]);
      if (await this._openSession(client, org, plate)) {
        throw new ParkingError(`${plate} is already parked inside a lot`, { status: 409, code: 'ALREADY_INSIDE' });
      }
      const watchlistHit = await this._watchlistHit(client, org, plate);
      const { rows: seqRows } = await client.query(
        `SELECT ((NOW() AT TIME ZONE '${TZ}')::date)::text AS day, to_char(NOW() AT TIME ZONE '${TZ}', 'YYMMDD') AS ymd,
                COALESCE((SELECT MAX(ticket_seq) FROM parking_valet_ticket WHERE organization_id = $1 AND ticket_day = (NOW() AT TIME ZONE '${TZ}')::date), 0) + 1 AS seq`,
        [org]
      );
      const { day, ymd, seq } = seqRows[0];
      const ticketNo = `V${ymd}-${String(seq).padStart(3, '0')}`;
      try {
        const { rows } = await client.query(
          `INSERT INTO parking_valet_ticket (organization_id, ticket_day, ticket_seq, ticket_no, vehicle_number, vehicle_type, customer_name, customer_phone, key_tag, condition_notes, received_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [org, day, seq, ticketNo, plate, vehicleType, name.slice(0, 120), phone, keyTag ? String(keyTag).slice(0, 40) : null, conditionNotes ? String(conditionNotes).slice(0, 1000) : null, receivedBy || null]
        );
        await client.query('COMMIT');
        return { ticket: rows[0], watchlistHit };
      } catch (e) {
        if (e.code === '23505') throw new ParkingError(`${plate} already has an open valet ticket`, { status: 409, code: 'DUPLICATE_TICKET' });
        throw e;
      }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // Locks the ticket row and checks it is in one of `from`; returns it (undefined = not this org's).
  async _lockTicket(client, org, id, from, verb) {
    const { rows } = await client.query(`SELECT * FROM parking_valet_ticket WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [id, org]);
    const t = rows[0];
    if (!t) return undefined;
    if (!from.includes(t.status)) {
      throw new ParkingError(`Ticket ${t.ticket_no} is ${t.status.replace(/_/g, ' ')}; it cannot be ${verb}`, { status: 409, code: 'INVALID_STATE', details: { status: t.status } });
    }
    return t;
  }

  async _valetTx(org, id, from, verb, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const t = await this._lockTicket(client, org, id, from, verb);
      if (!t) { await client.query('ROLLBACK'); return undefined; }
      const out = await fn(client, t);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async parkValetVehicle(org, id, { lotId, slotLabel, emergencyOverride = false, userId = null }) {
    if (!Number.isInteger(Number(lotId))) throw new ParkingError('lotId is required');
    return this._valetTx(org, id, ['received'], 'parked', async (client, t) => {
      const movement = await this._movementTx(client, org, Number(lotId), {
        vehicleType: t.vehicle_type, action: 'entry', method: 'manual', plate: t.vehicle_number,
        cleanNote: `Valet ${t.ticket_no}`, emergencyOverride: Boolean(emergencyOverride), userId, valetTicketId: t.id,
      });
      if (!movement) throw new ParkingError('Parking lot not found', { status: 404, code: 'LOT_NOT_FOUND' });
      const { rows } = await client.query(
        `UPDATE parking_valet_ticket SET status = 'parked', lot_id = $3, slot_label = $4, parked_by = $5, parked_at = NOW()
         WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [id, org, Number(lotId), slotLabel ? String(slotLabel).slice(0, 40) : null, userId]
      );
      return { ticket: rows[0], warnings: movement.warnings, watchlistHit: movement.watchlistHit };
    });
  }

  async requestValetRetrieval(org, id) {
    return this._valetTx(org, id, ['parked'], 'requested for retrieval', async (client) => {
      const { rows } = await client.query(
        `UPDATE parking_valet_ticket SET status = 'retrieval_requested', requested_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [id, org]
      );
      return { ticket: rows[0] };
    });
  }

  // The vehicle leaves its lot and is brought to the pickup point.
  async markValetReady(org, id, { userId = null } = {}) {
    return this._valetTx(org, id, ['retrieval_requested'], 'marked ready', async (client, t) => {
      const movement = await this._movementTx(client, org, t.lot_id, {
        vehicleType: t.vehicle_type, action: 'exit', method: 'manual', plate: t.vehicle_number,
        cleanNote: `Valet ${t.ticket_no} retrieved`, emergencyOverride: false, userId, valetTicketId: t.id,
      });
      if (!movement) throw new ParkingError('The lot this vehicle was parked in has been archived; unarchive or contact an administrator', { status: 409, code: 'LOT_ARCHIVED' });
      const { rows } = await client.query(
        `UPDATE parking_valet_ticket SET status = 'ready', ready_at = NOW(), ready_by = $3 WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [id, org, userId]
      );
      return { ticket: rows[0], parkedMinutes: movement.log.parking_duration_minutes };
    });
  }

  async deliverValetVehicle(org, id, { verification, note, userId = null }) {
    oneOf(verification, HANDOVER_CHECKS, 'verification');
    return this._valetTx(org, id, ['ready'], 'delivered', async (client) => {
      const { rows } = await client.query(
        `UPDATE parking_valet_ticket SET status = 'delivered', delivered_at = NOW(), delivered_by = $3, handover_verification = $4, handover_note = $5
         WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [id, org, userId, verification, note ? String(note).slice(0, 500) : null]
      );
      return { ticket: rows[0] };
    });
  }

  // Only before parking: the vehicle is handed straight back. A parked car must go
  // through retrieval so the lot's occupancy stays correct.
  async cancelValetTicket(org, id, { reason }) {
    const why = String(reason ?? '').trim();
    if (!why) throw new ParkingError('A reason is required to cancel a ticket');
    return this._valetTx(org, id, ['received'], 'cancelled (a parked vehicle must be retrieved and delivered)', async (client) => {
      const { rows } = await client.query(
        `UPDATE parking_valet_ticket SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $3 WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [id, org, why.slice(0, 300)]
      );
      return { ticket: rows[0] };
    });
  }

  // ── Devices (registry only: no hardware commands are sent from here) ────
  async listDevices(org, { lotId = null } = {}) {
    const params = [org];
    let extra = '';
    if (lotId) { params.push(lotId); extra = ' AND d.lot_id = $2'; }
    const { rows } = await pool.query(
      `SELECT d.*, lot.name AS lot_name FROM parking_device d JOIN parking_lot lot ON lot.id = d.lot_id
       WHERE d.organization_id = $1${extra} ORDER BY d.id`,
      params
    );
    return rows;
  }

  async getDeviceStats(org) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'online' AND is_enabled)::int AS online,
              COUNT(*) FILTER (WHERE status = 'offline' AND is_enabled)::int AS offline,
              COUNT(*) FILTER (WHERE status = 'error')::int AS errored,
              COUNT(*) FILTER (WHERE NOT is_enabled)::int AS disabled
       FROM parking_device WHERE organization_id = $1`,
      [org]
    );
    return rows[0];
  }

  _deviceFields(input) {
    const out = {};
    if (input.name !== undefined) {
      const n = String(input.name).trim();
      if (!n) throw new ParkingError('name is required');
      out.name = n.slice(0, 120);
    }
    if (input.deviceType !== undefined) out.device_type = oneOf(input.deviceType, DEVICE_TYPES, 'deviceType');
    if (input.position !== undefined && input.position !== null && input.position !== '') out.position = oneOf(input.position, DEVICE_POSITIONS, 'position');
    if (input.serialNumber !== undefined) out.serial_number = input.serialNumber ? String(input.serialNumber).slice(0, 80) : null;
    if (input.ipAddress !== undefined) {
      const ip = input.ipAddress ? String(input.ipAddress).trim() : null;
      if (ip && !/^[A-Za-z0-9.\-:]{1,255}$/.test(ip)) throw new ParkingError('ipAddress is not valid');
      out.ip_address = ip;
    }
    if (input.port !== undefined && input.port !== null && input.port !== '') {
      const p = Number(input.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) throw new ParkingError('port must be between 1 and 65535');
      out.port = p;
    }
    if (input.note !== undefined) out.note = input.note ? String(input.note).slice(0, 500) : null;
    if (input.config !== undefined) {
      if (input.config === null || typeof input.config !== 'object' || Array.isArray(input.config)) throw new ParkingError('config must be an object');
      const c = input.config;
      const clean = {};
      if (c.autoClose !== undefined) clean.autoClose = Boolean(c.autoClose);
      if (c.closeDelaySeconds !== undefined) clean.closeDelaySeconds = Math.min(Math.max(Number(c.closeDelaySeconds) || 0, 0), 600);
      if (c.displayMode !== undefined) clean.displayMode = oneOf(c.displayMode, ['occupancy', 'message', 'welcome'], 'config.displayMode');
      if (c.customMessage !== undefined) clean.customMessage = String(c.customMessage).slice(0, 200);
      if (c.brightness !== undefined) clean.brightness = Math.min(Math.max(Number(c.brightness) || 0, 0), 100);
      if (c.tokenFormat !== undefined) clean.tokenFormat = oneOf(c.tokenFormat, ['barcode', 'qr', 'text'], 'config.tokenFormat');
      if (c.autoPrint !== undefined) clean.autoPrint = Boolean(c.autoPrint);
      if (c.headerText !== undefined) clean.headerText = String(c.headerText).slice(0, 120);
      out.config = JSON.stringify(clean);
    }
    return out;
  }

  async registerDevice(org, { lotId, ...input }) {
    const fields = this._deviceFields(input);
    if (!fields.name || !fields.device_type) throw new ParkingError('name and deviceType are required');
    const cols = ['organization_id', 'lot_id', ...Object.keys(fields)];
    const vals = [org, lotId, ...Object.values(fields)];
    const { rows } = await pool.query(
      `INSERT INTO parking_device (${cols.join(', ')})
       SELECT ${cols.map((_, i) => `$${i + 1}`).join(', ')}
       WHERE EXISTS (SELECT 1 FROM parking_lot WHERE id = $2 AND organization_id = $1 AND is_active)
       RETURNING *`,
      vals
    );
    return rows[0];
  }

  async updateDevice(org, id, input) {
    const fields = this._deviceFields(input);
    if (typeof input.isEnabled === 'boolean') fields.is_enabled = input.isEnabled;
    const keys = Object.keys(fields);
    if (keys.length === 0) throw new ParkingError('Nothing to update');
    const sets = keys.map((k, i) => `${k} = $${i + 3}`);
    const { rows } = await pool.query(
      `UPDATE parking_device SET ${sets.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, org, ...Object.values(fields)]
    );
    return rows[0];
  }

  async setDeviceStatus(org, id, status) {
    oneOf(status, DEVICE_STATUSES, 'status');
    const { rows } = await pool.query(
      `UPDATE parking_device SET status = $3, last_heartbeat = CASE WHEN $3 = 'online' THEN NOW() ELSE last_heartbeat END
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, org, status]
    );
    return rows[0];
  }

  async deleteDevice(org, id) {
    const { rows } = await pool.query(`DELETE FROM parking_device WHERE id = $1 AND organization_id = $2 RETURNING id`, [id, org]);
    return rows[0];
  }
}

export default new ParkingService();
