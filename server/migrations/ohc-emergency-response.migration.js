/**
 * OHC emergency response foundation: responder availability, assignments and
 * an append-only operational timeline. This is additive and safe to run more
 * than once; clinical details remain in the existing OHC clinical records.
 */
import pool from '../db/pgPool.js';

export async function runOhcEmergencyResponseMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ohc_responder_statuses (
        unit_uid TEXT NOT NULL REFERENCES entity_registry(uid),
        user_id INTEGER NOT NULL REFERENCES users(id),
        availability TEXT NOT NULL DEFAULT 'available'
          CHECK (availability IN ('available', 'busy', 'off_duty')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (unit_uid, user_id)
      );
      CREATE TABLE IF NOT EXISTS ohc_emergency_assignments (
        id BIGSERIAL PRIMARY KEY,
        emergency_id BIGINT NOT NULL REFERENCES ohc_workplace_emergencies(id) ON DELETE CASCADE,
        responder_user_id INTEGER NOT NULL REFERENCES users(id),
        assigned_by_user_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'assigned'
          CHECK (status IN ('assigned', 'acknowledged', 'responding', 'on_scene', 'declined', 'cancelled', 'cleared')),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        acknowledged_at TIMESTAMPTZ,
        responded_at TIMESTAMPTZ,
        cleared_at TIMESTAMPTZ,
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (emergency_id, responder_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_emergency_assignments_response
        ON ohc_emergency_assignments (responder_user_id, status, assigned_at DESC);
      CREATE TABLE IF NOT EXISTS ohc_emergency_events (
        id BIGSERIAL PRIMARY KEY,
        emergency_id BIGINT NOT NULL REFERENCES ohc_workplace_emergencies(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        actor_user_id INTEGER REFERENCES users(id),
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_emergency_events_timeline
        ON ohc_emergency_events (emergency_id, created_at, id);
      CREATE TABLE IF NOT EXISTS ohc_emergency_notes (
        id BIGSERIAL PRIMARY KEY,
        emergency_id BIGINT NOT NULL REFERENCES ohc_workplace_emergencies(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id),
        note_type TEXT NOT NULL DEFAULT 'operational'
          CHECK (note_type IN ('operational', 'handover', 'clinical_summary')),
        body TEXT NOT NULL CHECK (length(trim(body)) >= 1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_emergency_notes_timeline
        ON ohc_emergency_notes (emergency_id, created_at, id);
      CREATE TABLE IF NOT EXISTS ohc_emergency_reports (
        emergency_id BIGINT PRIMARY KEY REFERENCES ohc_workplace_emergencies(id) ON DELETE CASCADE,
        summary TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
        finalized_by_user_id INTEGER REFERENCES users(id),
        finalized_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS ohc_emergency_report_amendments (
        id BIGSERIAL PRIMARY KEY,
        emergency_id BIGINT NOT NULL REFERENCES ohc_workplace_emergencies(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL CHECK (length(trim(reason)) >= 2),
        amendment TEXT NOT NULL CHECK (length(trim(amendment)) >= 2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_emergency_report_amendments
        ON ohc_emergency_report_amendments (emergency_id, created_at, id);
    `);
    // The initial rollout allowed acknowledgement only. Keep the migration
    // repeatable while expanding the explicit responder-progress states.
    await client.query(`
      ALTER TABLE ohc_emergency_assignments
        DROP CONSTRAINT IF EXISTS ohc_emergency_assignments_status_check;
      ALTER TABLE ohc_emergency_assignments
        ADD CONSTRAINT ohc_emergency_assignments_status_check
        CHECK (status IN ('assigned', 'acknowledged', 'responding', 'on_scene', 'declined', 'cancelled', 'cleared'));
    `);
    await client.query('COMMIT');
    console.log('OHC emergency response migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('OHC emergency response migration failed:', err.message);
    throw err;
  } finally { client.release(); }
}

if (process.argv[1]?.includes('ohc-emergency-response')) {
  runOhcEmergencyResponseMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
