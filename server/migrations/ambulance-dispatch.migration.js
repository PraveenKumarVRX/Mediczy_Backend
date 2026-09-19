/**
 * Migration: Ambulance Dispatch — real trip tracking
 * ======================================================
 * The audit found AmbulanceDashboard.tsx (1,420 ln) renders entirely from
 * local mock state — ambulance.route.js has only /login and /profile, no
 * dispatch persistence. This adds the missing table. Purely additive.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ambulance_trip (
        id                SERIAL PRIMARY KEY,
        ambulance_id      INTEGER NOT NULL REFERENCES ambulances(id),
        patient_id        INTEGER,
        pickup_location   TEXT NOT NULL,
        drop_location     TEXT,
        trip_type         TEXT NOT NULL DEFAULT 'emergency' CHECK (trip_type IN ('emergency', 'scheduled', 'transfer')),
        status            TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'en_route', 'arrived', 'completed', 'cancelled')),
        dispatched_at     TIMESTAMPTZ DEFAULT NOW(),
        arrived_at        TIMESTAMPTZ,
        completed_at      TIMESTAMPTZ,
        driver_name       TEXT,
        notes             TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ambulance_trip_ambulance ON ambulance_trip (ambulance_id, status)`);
    console.log('✅ ambulance_trip: created');

    await client.query('COMMIT');
    console.log('✅ Ambulance dispatch migration complete');
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
    await client.query('DROP TABLE IF EXISTS ambulance_trip');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('ambulance-dispatch')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
