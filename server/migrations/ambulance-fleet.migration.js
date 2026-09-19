/**
 * Migration: Ambulance Fleet — vehicles, crew, maintenance, shifts
 * =========================================================================
 * One row in `ambulances` is one provider login, not one vehicle. This adds
 * the multi-vehicle / multi-crew model a provider manages from
 * AmbulanceDashboard.tsx (Fleet, Staff, Maintenance, Schedule tabs).
 * Purely additive: four new tables plus one nullable column on
 * ambulance_trip. Nothing existing is altered otherwise.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ambulance_vehicle (
        id                  SERIAL PRIMARY KEY,
        ambulance_id        INTEGER NOT NULL REFERENCES ambulances(id),
        registration_number TEXT NOT NULL,
        vehicle_type        TEXT NOT NULL DEFAULT 'BLS' CHECK (vehicle_type IN ('BLS', 'ALS', 'Neonatal', 'Mortuary', 'Other')),
        status              TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_trip', 'maintenance', 'off_duty')),
        current_location    TEXT,
        last_service_date   DATE,
        next_service_due    DATE,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (ambulance_id, registration_number)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ambulance_vehicle_ambulance ON ambulance_vehicle (ambulance_id, status)`);
    console.log('✅ ambulance_vehicle: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ambulance_crew (
        id             SERIAL PRIMARY KEY,
        ambulance_id   INTEGER NOT NULL REFERENCES ambulances(id),
        name           TEXT NOT NULL,
        role           TEXT NOT NULL CHECK (role IN ('driver', 'paramedic', 'support')),
        license_number TEXT,
        phone          TEXT,
        duty_status    TEXT NOT NULL DEFAULT 'off_duty' CHECK (duty_status IN ('on_duty', 'off_duty')),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ambulance_crew_ambulance ON ambulance_crew (ambulance_id, role)`);
    console.log('✅ ambulance_crew: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ambulance_maintenance (
        id               SERIAL PRIMARY KEY,
        ambulance_id     INTEGER NOT NULL REFERENCES ambulances(id),
        vehicle_id       INTEGER NOT NULL REFERENCES ambulance_vehicle(id),
        maintenance_type TEXT NOT NULL,
        scheduled_date   DATE NOT NULL,
        status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
        notes            TEXT,
        completed_at     TIMESTAMPTZ,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ambulance_maintenance_ambulance ON ambulance_maintenance (ambulance_id, status)`);
    console.log('✅ ambulance_maintenance: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ambulance_shift (
        id           SERIAL PRIMARY KEY,
        ambulance_id INTEGER NOT NULL REFERENCES ambulances(id),
        crew_id      INTEGER NOT NULL REFERENCES ambulance_crew(id),
        vehicle_id   INTEGER REFERENCES ambulance_vehicle(id),
        shift_date   DATE NOT NULL,
        start_time   TIME NOT NULL,
        end_time     TIME NOT NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ambulance_shift_ambulance_date ON ambulance_shift (ambulance_id, shift_date)`);
    console.log('✅ ambulance_shift: created');

    // Nullable link so a trip can record which vehicle served it.
    await client.query(`ALTER TABLE ambulance_trip ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES ambulance_vehicle(id)`);
    console.log('✅ ambulance_trip: vehicle_id added');

    await client.query('COMMIT');
    console.log('✅ Ambulance fleet migration complete');
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
    await client.query(`ALTER TABLE ambulance_trip DROP COLUMN IF EXISTS vehicle_id`);
    await client.query('DROP TABLE IF EXISTS ambulance_shift');
    await client.query('DROP TABLE IF EXISTS ambulance_maintenance');
    await client.query('DROP TABLE IF EXISTS ambulance_crew');
    await client.query('DROP TABLE IF EXISTS ambulance_vehicle');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('ambulance-fleet')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
