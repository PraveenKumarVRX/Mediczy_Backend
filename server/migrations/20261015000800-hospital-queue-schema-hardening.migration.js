/**
 * Hospital queue schema hardening.
 *
 * Queue migrations are owned by the deployment migration runner.  This
 * migration is intentionally idempotent so existing installations can move
 * from request-time bootstrapping to a deterministic release step.
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_queue_token_sequences (
      organization_id INTEGER NOT NULL,
      department VARCHAR(40) NOT NULL,
      doctor_id INTEGER NOT NULL DEFAULT 0,
      queue_zone VARCHAR(80) NOT NULL DEFAULT '',
      seq_date DATE NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, department, doctor_id, queue_zone, seq_date)
    );

    ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS journey_id UUID;
    ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS journey_token VARCHAR(32);
    ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS parent_entry_id INTEGER;
    ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS step_order SMALLINT DEFAULT 1;
    ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS next_department VARCHAR(40);
    ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS check_in_day DATE;

    UPDATE hospital_queue_entries
    SET journey_id = COALESCE(journey_id, gen_random_uuid()),
        journey_token = COALESCE(journey_token, token_number),
        step_order = COALESCE(step_order, 1),
        check_in_day = CASE WHEN check_in_at IS NULL THEN NULL ELSE (check_in_at AT TIME ZONE 'UTC')::date END
    WHERE journey_id IS NULL OR journey_token IS NULL;

    UPDATE hospital_queue_entries
    SET check_in_day = CASE WHEN check_in_at IS NULL THEN NULL ELSE (check_in_at AT TIME ZONE 'UTC')::date END
    WHERE check_in_day IS DISTINCT FROM CASE WHEN check_in_at IS NULL THEN NULL ELSE (check_in_at AT TIME ZONE 'UTC')::date END;

    CREATE OR REPLACE FUNCTION hospital_queue_entries_set_check_in_day()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.check_in_day := CASE WHEN NEW.check_in_at IS NULL THEN NULL ELSE (NEW.check_in_at AT TIME ZONE 'UTC')::date END;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS trg_hospital_queue_entries_check_in_day ON hospital_queue_entries;
    CREATE TRIGGER trg_hospital_queue_entries_check_in_day
      BEFORE INSERT OR UPDATE OF check_in_at ON hospital_queue_entries
      FOR EACH ROW EXECUTE FUNCTION hospital_queue_entries_set_check_in_day();

    CREATE TABLE IF NOT EXISTS hospital_queue_journey_sequences (
      organization_id INTEGER NOT NULL,
      seq_date DATE NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, seq_date)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_hqe_appointment_day_unique
      ON hospital_queue_entries (appointment_id, check_in_day)
      WHERE appointment_id IS NOT NULL
        AND status IN ('waiting','called','serving');
    CREATE INDEX IF NOT EXISTS idx_hqe_appointment_id
      ON hospital_queue_entries (appointment_id);
    CREATE INDEX IF NOT EXISTS idx_hqe_org_checkin_date
      ON hospital_queue_entries (organization_id, check_in_at);
    CREATE INDEX IF NOT EXISTS idx_hqe_journey_id
      ON hospital_queue_entries (organization_id, journey_id);
    CREATE INDEX IF NOT EXISTS idx_hqe_journey_token_day
      ON hospital_queue_entries (organization_id, journey_token, check_in_day);
  `);
  console.log('[migration] hospital queue schema hardening ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

