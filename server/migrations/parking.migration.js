/**
 * Migration: Parking Module
 * ================================================================
 * Hospital parking operations: lots with two-wheeler/car capacity,
 * entry/exit movement log, passes (monthly/VIP/free/token/staff),
 * security watchlist, incidents, overstay alerts and a hardware
 * device registry (boom barrier / LED display / token printer).
 *
 * Ported from the iPark reference app (Convex) to Postgres. Every table
 * carries organization_id so each hospital tenant only sees its own lots.
 *
 * Additive only (CREATE TABLE IF NOT EXISTS). Safe to run multiple times.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_lot (
        id                     SERIAL PRIMARY KEY,
        organization_id        INTEGER NOT NULL,
        name                   TEXT NOT NULL,
        two_wheeler_capacity   INTEGER NOT NULL DEFAULT 0 CHECK (two_wheeler_capacity >= 0),
        car_capacity           INTEGER NOT NULL DEFAULT 0 CHECK (car_capacity >= 0),
        max_parking_minutes    INTEGER CHECK (max_parking_minutes IS NULL OR max_parking_minutes > 0),
        security_enabled       BOOLEAN NOT NULL DEFAULT false,
        -- Occupancy counts movements after this instant; "reset" moves it forward
        -- instead of deleting movement history.
        counted_from           TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
        is_active              BOOLEAN NOT NULL DEFAULT true,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_lot_org_name ON parking_lot (organization_id, lower(name)) WHERE is_active`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_vehicle_log (
        id                        BIGSERIAL PRIMARY KEY,
        organization_id           INTEGER NOT NULL,
        lot_id                    INTEGER NOT NULL REFERENCES parking_lot(id) ON DELETE CASCADE,
        vehicle_type              TEXT NOT NULL CHECK (vehicle_type IN ('two_wheeler', 'car')),
        action                    TEXT NOT NULL CHECK (action IN ('entry', 'exit')),
        method                    TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual', 'ai')),
        vehicle_number            TEXT,
        note                      TEXT,
        parking_duration_minutes  INTEGER,
        pass_id                   INTEGER,
        recorded_by               INTEGER,
        logged_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_log_lot_time ON parking_vehicle_log (lot_id, logged_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_log_org_vehicle ON parking_vehicle_log (organization_id, vehicle_number, logged_at DESC) WHERE vehicle_number IS NOT NULL`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_pass (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        vehicle_number   TEXT NOT NULL,
        pass_type        TEXT NOT NULL CHECK (pass_type IN ('monthly', 'vip', 'free', 'token', 'staff')),
        holder_name      TEXT,
        holder_type      TEXT CHECK (holder_type IS NULL OR holder_type IN ('staff', 'doctor', 'patient', 'visitor', 'vendor', 'other')),
        lot_id           INTEGER REFERENCES parking_lot(id) ON DELETE CASCADE,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ,
        token_balance    INTEGER CHECK (token_balance IS NULL OR token_balance >= 0),
        issued_by        INTEGER,
        note             TEXT,
        revoked_at       TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_pass_org_vehicle ON parking_pass (organization_id, vehicle_number)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_pass_active_type ON parking_pass (organization_id, vehicle_number, pass_type) WHERE is_active`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_watchlist (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        vehicle_number   TEXT NOT NULL,
        reason           TEXT NOT NULL,
        severity         TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
        notes            TEXT,
        added_by         INTEGER,
        added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active        BOOLEAN NOT NULL DEFAULT true
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_watchlist_active ON parking_watchlist (organization_id, vehicle_number) WHERE is_active`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_incident (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        lot_id           INTEGER NOT NULL REFERENCES parking_lot(id) ON DELETE CASCADE,
        type             TEXT NOT NULL CHECK (type IN ('theft', 'vandalism', 'suspicious', 'accident', 'unauthorized', 'overstay', 'other')),
        severity         TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
        title            TEXT NOT NULL,
        description      TEXT NOT NULL,
        vehicle_number   TEXT,
        reported_by      INTEGER,
        reported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
        resolved_at      TIMESTAMPTZ,
        resolved_note    TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_incident_org_status ON parking_incident (organization_id, status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_overstay_alert (
        id                 SERIAL PRIMARY KEY,
        organization_id    INTEGER NOT NULL,
        lot_id             INTEGER NOT NULL REFERENCES parking_lot(id) ON DELETE CASCADE,
        vehicle_number     TEXT NOT NULL,
        vehicle_type       TEXT NOT NULL CHECK (vehicle_type IN ('two_wheeler', 'car')),
        entry_time         TIMESTAMPTZ NOT NULL,
        threshold_minutes  INTEGER NOT NULL,
        alerted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_acknowledged    BOOLEAN NOT NULL DEFAULT false,
        acknowledged_at    TIMESTAMPTZ,
        acknowledged_by    INTEGER,
        UNIQUE (lot_id, vehicle_number, entry_time)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_overstay_org_ack ON parking_overstay_alert (organization_id, is_acknowledged)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_device (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        lot_id           INTEGER NOT NULL REFERENCES parking_lot(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        device_type      TEXT NOT NULL CHECK (device_type IN ('boom_barrier', 'led_display', 'token_printer')),
        status           TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
        is_enabled       BOOLEAN NOT NULL DEFAULT true,
        serial_number    TEXT,
        ip_address       TEXT,
        port             INTEGER CHECK (port IS NULL OR (port > 0 AND port < 65536)),
        position         TEXT CHECK (position IS NULL OR position IN ('entry', 'exit', 'both')),
        config           JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_heartbeat   TIMESTAMPTZ,
        installed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        note             TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_device_org_lot ON parking_device (organization_id, lot_id)`);

    // Valet parking: a ticketed hand-over flow (received -> parked -> retrieval requested
    // -> ready -> delivered, or cancelled before parking). Parking/retrieving a valet
    // vehicle writes ordinary parking_vehicle_log movements, linked by valet_ticket_id.
    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_valet_ticket (
        id                      SERIAL PRIMARY KEY,
        organization_id         INTEGER NOT NULL,
        ticket_day              DATE NOT NULL,
        ticket_seq              INTEGER NOT NULL,
        ticket_no               TEXT NOT NULL,
        vehicle_number          TEXT NOT NULL,
        vehicle_type            TEXT NOT NULL CHECK (vehicle_type IN ('two_wheeler', 'car')),
        customer_name           TEXT NOT NULL,
        customer_phone          TEXT NOT NULL,
        key_tag                 TEXT,
        condition_notes         TEXT,
        status                  TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'parked', 'retrieval_requested', 'ready', 'delivered', 'cancelled')),
        lot_id                  INTEGER REFERENCES parking_lot(id),
        slot_label              TEXT,
        received_by             INTEGER,
        received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        parked_by               INTEGER,
        parked_at               TIMESTAMPTZ,
        requested_at            TIMESTAMPTZ,
        ready_by                INTEGER,
        ready_at                TIMESTAMPTZ,
        delivered_by            INTEGER,
        delivered_at            TIMESTAMPTZ,
        handover_verification   TEXT CHECK (handover_verification IS NULL OR handover_verification IN ('ticket', 'id_check', 'phone_match')),
        handover_note           TEXT,
        cancelled_at            TIMESTAMPTZ,
        cancel_reason           TEXT,
        UNIQUE (organization_id, ticket_day, ticket_seq),
        UNIQUE (organization_id, ticket_no)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parking_valet_org_status ON parking_valet_ticket (organization_id, status)`);
    // One live ticket per vehicle: the same plate cannot be handed over twice.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_valet_open_vehicle ON parking_valet_ticket (organization_id, vehicle_number) WHERE status IN ('received', 'parked', 'retrieval_requested', 'ready')`);
    await client.query(`ALTER TABLE parking_vehicle_log ADD COLUMN IF NOT EXISTS valet_ticket_id INTEGER`);
    // Plate-tracked exits point at their entry so an occupancy reset can ignore exits of vehicles that were already inside when the counters were zeroed.
    await client.query(`ALTER TABLE parking_vehicle_log ADD COLUMN IF NOT EXISTS entry_log_id BIGINT`);

    await client.query('COMMIT');
    console.log('✅ Parking module migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of ['parking_valet_ticket', 'parking_device', 'parking_overstay_alert', 'parking_incident', 'parking_watchlist', 'parking_pass', 'parking_vehicle_log', 'parking_lot']) {
      await client.query(`DROP TABLE IF EXISTS ${t}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node parking.migration.js
if (process.argv[1] && process.argv[1].includes('parking.migration')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
