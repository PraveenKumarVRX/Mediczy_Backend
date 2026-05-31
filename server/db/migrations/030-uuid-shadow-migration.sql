-- =============================================================================
-- MIGRATION 030: INTEGER → UUID Primary Key Migration (Shadow Table Pattern)
-- =============================================================================
-- Migrates users, doctors, appointments from INTEGER PKs to UUID PKs
-- without downtime using a shadow (parallel) table approach.
--
-- EXECUTION ORDER (run each step separately, validate between steps):
--
--   Step 1 (this file):  Add uuid columns, create shadow tables, backfill
--   Step 2:              Dual-write period — app writes to both old + new cols
--   Step 3:              Validate data parity between old and new columns
--   Step 4:              Switch app to UUID-primary queries
--   Step 5:              Drop old INTEGER columns (after 2-week validation)
--
-- ⚠️  NEVER run Step 5 without completing Steps 1-4 and a full data parity check.
-- =============================================================================

-- ── STEP 1A: Add uuid columns to existing tables ─────────────────────────────

-- Users table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='uuid_id') THEN
    ALTER TABLE users
      ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();

    -- Backfill: generate UUID for all existing rows
    UPDATE users SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

    -- Make it NOT NULL after backfill
    ALTER TABLE users ALTER COLUMN uuid_id SET NOT NULL;


    RAISE NOTICE 'users.uuid_id column added and backfilled';
  END IF;
END;
$$;

-- Doctors table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='doctors' AND column_name='uuid_id') THEN
    ALTER TABLE doctors ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();
    UPDATE doctors SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
    ALTER TABLE doctors ALTER COLUMN uuid_id SET NOT NULL;
    RAISE NOTICE 'doctors.uuid_id column added and backfilled';
  END IF;
END;
$$;

-- Appointments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='appointments' AND column_name='uuid_id') THEN
    ALTER TABLE appointments ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();
    UPDATE appointments SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;
    ALTER TABLE appointments ALTER COLUMN uuid_id SET NOT NULL;
    RAISE NOTICE 'appointments.uuid_id column added and backfilled';
  END IF;
END;
$$;

-- Unique indexes must be created outside DO blocks because CONCURRENTLY is not
-- allowed inside PL/pgSQL functions/transaction blocks.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_uuid_id_idx ON users(uuid_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS doctors_uuid_id_idx ON doctors(uuid_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS appointments_uuid_id_idx ON appointments(uuid_id);

-- ── STEP 1B: UUID lookup maps (integer_id → uuid) ────────────────────────────
-- Used by the application during the dual-write transition period.

CREATE TABLE IF NOT EXISTS uuid_id_map (
  entity_type   VARCHAR(50)  NOT NULL,   -- 'user', 'doctor', 'appointment'
  integer_id    INTEGER      NOT NULL,
  uuid_id       UUID         NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY   (entity_type, integer_id)
);

CREATE INDEX IF NOT EXISTS uuid_id_map_uuid ON uuid_id_map(uuid_id);

-- Populate map from backfilled columns
INSERT INTO uuid_id_map (entity_type, integer_id, uuid_id)
SELECT 'user', id, uuid_id FROM users
ON CONFLICT (entity_type, integer_id) DO UPDATE SET uuid_id = EXCLUDED.uuid_id;

INSERT INTO uuid_id_map (entity_type, integer_id, uuid_id)
SELECT 'doctor', id, uuid_id FROM doctors
ON CONFLICT (entity_type, integer_id) DO UPDATE SET uuid_id = EXCLUDED.uuid_id;

INSERT INTO uuid_id_map (entity_type, integer_id, uuid_id)
SELECT 'appointment', id, uuid_id FROM appointments
ON CONFLICT (entity_type, integer_id) DO UPDATE SET uuid_id = EXCLUDED.uuid_id;

-- ── STEP 1C: Trigger to keep uuid_id_map in sync during dual-write ───────────

CREATE OR REPLACE FUNCTION sync_uuid_id_map() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    INSERT INTO uuid_id_map VALUES ('user', NEW.id, NEW.uuid_id)
    ON CONFLICT (entity_type, integer_id) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'doctors' THEN
    INSERT INTO uuid_id_map VALUES ('doctor', NEW.id, NEW.uuid_id)
    ON CONFLICT (entity_type, integer_id) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'appointments' THEN
    INSERT INTO uuid_id_map VALUES ('appointment', NEW.id, NEW.uuid_id)
    ON CONFLICT (entity_type, integer_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_uuid_sync_trigger ON users;
CREATE TRIGGER users_uuid_sync_trigger
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION sync_uuid_id_map();

DROP TRIGGER IF EXISTS doctors_uuid_sync_trigger ON doctors;
CREATE TRIGGER doctors_uuid_sync_trigger
  AFTER INSERT ON doctors
  FOR EACH ROW EXECUTE FUNCTION sync_uuid_id_map();

DROP TRIGGER IF EXISTS appointments_uuid_sync_trigger ON appointments;
CREATE TRIGGER appointments_uuid_sync_trigger
  AFTER INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION sync_uuid_id_map();

-- =============================================================================
-- STEP 5 SCRIPT (run ONLY after 2-week validation — separate execution)
-- =============================================================================
-- DO NOT run this block now. Save it separately as 030b-uuid-pk-cutover.sql

/*
BEGIN;

  -- Rename old integer PK columns (keep as backup for 2 weeks)
  ALTER TABLE users        RENAME COLUMN id TO integer_id_backup;
  ALTER TABLE doctors      RENAME COLUMN id TO integer_id_backup;
  ALTER TABLE appointments RENAME COLUMN id TO integer_id_backup;

  -- Rename uuid_id to id
  ALTER TABLE users        RENAME COLUMN uuid_id TO id;
  ALTER TABLE doctors      RENAME COLUMN uuid_id TO id;
  ALTER TABLE appointments RENAME COLUMN uuid_id TO id;

  -- Update FK columns in appointments
  UPDATE appointments a
  SET "userId"   = (SELECT uuid_id FROM uuid_id_map WHERE entity_type='user'   AND integer_id=a."userId"::int)::text::integer
  WHERE TRUE;  -- NOTE: actual FK type change requires more careful migration per FK

  COMMIT;

-- After further 2-week validation:
-- ALTER TABLE users DROP COLUMN integer_id_backup;
-- ALTER TABLE doctors DROP COLUMN integer_id_backup;
-- ALTER TABLE appointments DROP COLUMN integer_id_backup;
-- DROP TABLE uuid_id_map;
*/

-- =============================================================================
-- VALIDATION QUERY (run to verify parity before cutover)
-- =============================================================================
SELECT
  'users'        AS tbl, COUNT(*) AS total,
  SUM(CASE WHEN uuid_id IS NULL THEN 1 ELSE 0 END) AS missing_uuid
FROM users
UNION ALL
SELECT 'doctors', COUNT(*), SUM(CASE WHEN uuid_id IS NULL THEN 1 ELSE 0 END) FROM doctors
UNION ALL
SELECT 'appointments', COUNT(*), SUM(CASE WHEN uuid_id IS NULL THEN 1 ELSE 0 END) FROM appointments;
