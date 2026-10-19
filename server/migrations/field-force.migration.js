/**
 * Migration: Smart Force Field Force Module
 * ==========================================
 * Creates the three operational tables required for Phase 1:
 *   - field_attendance   GPS-verified clock-in/out per field exec per day
 *   - field_visits       GPS-verified visit check-in/out linked to any CRM entity
 *   - daily_field_reports  End-of-day submission by field exec
 *
 * These are audit/event records — NOT entities — so they don't go through
 * attach_entity_uid_rule(). They reference existing users by integer id
 * and optionally reference other entities by their uid column.
 *
 * Safe to run multiple times (all statements use IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. field_attendance ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS field_attendance (
        id                    BIGSERIAL PRIMARY KEY,
        user_id               INTEGER NOT NULL,
        date                  DATE    NOT NULL,

        clock_in_at           TIMESTAMPTZ,
        clock_in_lat          DECIMAL(10,8),
        clock_in_lng          DECIMAL(11,8),
        clock_in_accuracy_m   DECIMAL(8,2),
        clock_in_address      TEXT,

        clock_out_at          TIMESTAMPTZ,
        clock_out_lat         DECIMAL(10,8),
        clock_out_lng         DECIMAL(11,8),
        clock_out_accuracy_m  DECIMAL(8,2),

        status                VARCHAR(30) NOT NULL DEFAULT 'present'
                                CHECK (status IN ('present','exception','absent','half_day')),
        exception_type        VARCHAR(40)
                                CHECK (exception_type IN ('gps_failure','device_failure','approved_offsite','manual',NULL)),
        exception_reason      TEXT,
        approved_by           INTEGER,

        tenant_id             INTEGER NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (user_id, date)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_field_attendance_user_date ON field_attendance (user_id, date DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_field_attendance_tenant    ON field_attendance (tenant_id, date DESC)`);
    console.log('✅ field_attendance created');

    // ─── 2. field_visits ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS field_visits (
        id                    BIGSERIAL PRIMARY KEY,
        user_id               INTEGER NOT NULL,
        attendance_id         BIGINT REFERENCES field_attendance(id) ON DELETE SET NULL,

        -- Linked CRM entity (flexible polymorphic reference)
        entity_type           VARCHAR(50),   -- doctor | corporate | hospital | insurer | ngo | other
        entity_uid            VARCHAR(10),   -- entity registry UID where the entity has one
        entity_id             INTEGER,       -- raw integer id (legacy / fallback)
        entity_name           VARCHAR(255),  -- denormalised for display

        purpose               VARCHAR(80) NOT NULL DEFAULT 'follow_up'
                                CHECK (purpose IN (
                                  'initial_visit','follow_up','proposal','camp_planning',
                                  'relationship','meeting','survey','other'
                                )),
        planned_at            TIMESTAMPTZ,
        notes_planned         TEXT,

        -- GPS check-in
        check_in_at           TIMESTAMPTZ,
        check_in_lat          DECIMAL(10,8),
        check_in_lng          DECIMAL(11,8),
        check_in_accuracy_m   DECIMAL(8,2),
        check_in_address      TEXT,

        -- GPS check-out
        check_out_at          TIMESTAMPTZ,
        check_out_lat         DECIMAL(10,8),
        check_out_lng         DECIMAL(11,8),
        check_out_accuracy_m  DECIMAL(8,2),

        -- Meeting outcome (filled at check-out)
        met_person            VARCHAR(255),
        met_designation       VARCHAR(100),
        outcome               TEXT,
        services_discussed    TEXT[],
        materials_shared      TEXT[],
        next_action           TEXT,
        follow_up_date        DATE,

        status                VARCHAR(30) NOT NULL DEFAULT 'planned'
                                CHECK (status IN ('planned','checked_in','completed','cancelled','exception')),

        tenant_id             INTEGER NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_field_visits_user     ON field_visits (user_id, planned_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_field_visits_tenant   ON field_visits (tenant_id, planned_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_field_visits_entity   ON field_visits (entity_type, entity_uid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_field_visits_followup ON field_visits (user_id, follow_up_date) WHERE follow_up_date IS NOT NULL`);
    console.log('✅ field_visits created');

    // ─── 3. daily_field_reports ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_field_reports (
        id                    BIGSERIAL PRIMARY KEY,
        user_id               INTEGER NOT NULL,
        report_date           DATE    NOT NULL,
        attendance_id         BIGINT REFERENCES field_attendance(id) ON DELETE SET NULL,

        planned_visits        INTEGER NOT NULL DEFAULT 0,
        completed_visits      INTEGER NOT NULL DEFAULT 0,
        missed_visits         INTEGER NOT NULL DEFAULT 0,
        leads_generated       INTEGER NOT NULL DEFAULT 0,
        follow_ups_done       INTEGER NOT NULL DEFAULT 0,

        key_achievements      TEXT,
        challenges            TEXT,
        next_day_plan         TEXT,

        submitted_at          TIMESTAMPTZ,
        reviewed_by           INTEGER,
        reviewed_at           TIMESTAMPTZ,

        tenant_id             INTEGER NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (user_id, report_date)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_daily_reports_user   ON daily_field_reports (user_id, report_date DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_daily_reports_tenant ON daily_field_reports (tenant_id, report_date DESC)`);
    console.log('✅ daily_field_reports created');

    await client.query('COMMIT');
    console.log('✅ field-force migration complete');
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
    await client.query('DROP TABLE IF EXISTS daily_field_reports CASCADE');
    await client.query('DROP TABLE IF EXISTS field_visits CASCADE');
    await client.query('DROP TABLE IF EXISTS field_attendance CASCADE');
    await client.query('COMMIT');
    console.log('✅ field-force migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Self-invoke when run directly (`node server/migrations/field-force.migration.js`), matching
// every other migration file's convention in this directory. Without this, `up`/`down` were only
// ever exported, never called — the silent reason field_attendance/field_visits/daily_field_reports
// were never actually created in prod despite this file existing since Phase 1 (confirmed 2026-10-19:
// those three tables were missing while every later phase's tables were present).
if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((err) => { console.error('❌ field-force migration failed:', err.message); process.exit(1); });
}
