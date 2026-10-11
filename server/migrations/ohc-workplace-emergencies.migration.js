/** Workplace emergency register for corporate-linked OHC units. */
import pool from '../db/pgPool.js';

export async function runOhcWorkplaceEmergenciesMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ohc_workplace_emergencies (
        id                  BIGSERIAL PRIMARY KEY,
        unit_uid            TEXT NOT NULL REFERENCES entity_registry(uid),
        corporate_uid       TEXT NOT NULL REFERENCES entity_registry(uid),
        employee_user_id    INTEGER REFERENCES users(id),
        incident_type       VARCHAR(80) NOT NULL DEFAULT 'medical_emergency',
        severity            VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
        description         TEXT NOT NULL,
        location            VARCHAR(200),
        occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        reported_by_user_id INTEGER REFERENCES users(id),
        status              VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','resolved','transferred','closed')),
        triage_notes        TEXT,
        resolution          TEXT,
        resolved_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_workplace_emergencies_unit_time
        ON ohc_workplace_emergencies (unit_uid, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ohc_workplace_emergencies_corporate_status
        ON ohc_workplace_emergencies (corporate_uid, status, occurred_at DESC);
      ALTER TABLE ohc_access_log DROP CONSTRAINT IF EXISTS ohc_access_log_actor_kind_check;
      ALTER TABLE ohc_access_log ADD CONSTRAINT ohc_access_log_actor_kind_check
        CHECK (actor_kind IN ('corporate', 'corporate_cmo', 'operator', 'ohc_staff'));
    `);
    await client.query('COMMIT');
    console.log('✅ OHC workplace emergencies migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ OHC workplace emergencies migration failed:', err.message);
    throw err;
  } finally { client.release(); }
}

