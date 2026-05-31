-- =============================================================================
-- MIGRATION 022: Table Partitioning for High-Growth Tables
-- =============================================================================
-- Strategy: RANGE partitioning on created_at / appointmentDate
-- Run DURING a maintenance window. Tables must be empty or use pg_partman
-- for live migration on existing data.
--
-- For existing production tables with data use the shadow-table approach:
--   1. CREATE TABLE <name>_new (LIKE <name>) PARTITION BY RANGE (...)
--   2. CREATE initial partitions
--   3. INSERT INTO <name>_new SELECT * FROM <name>  (batched)
--   4. BEGIN; ALTER TABLE <name> RENAME TO <name>_old; ALTER TABLE <name>_new RENAME TO <name>; COMMIT;
--   5. DROP TABLE <name>_old;
-- =============================================================================
-- ── Partition helper function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_monthly_partition(
    p_table TEXT,
    p_year INT,
    p_month INT
  ) RETURNS VOID AS $$
DECLARE partition_name TEXT;
start_date DATE;
end_date DATE;
BEGIN start_date := make_date(p_year, p_month, 1);
end_date := start_date + INTERVAL '1 month';
partition_name := p_table || '_' || to_char(start_date, 'YYYY_MM');
EXECUTE format(
  'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
  partition_name,
  p_table,
  start_date,
  end_date
);
END;
$$ LANGUAGE plpgsql;
-- =============================================================================
-- 1. APPOINTMENTS — partition by appointmentDate (monthly)
-- =============================================================================
-- Create partitioned table (run only on fresh install / after shadow migration)
DO $$ BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'appointments_partitioned'
    AND n.nspname = 'public'
) THEN CREATE TABLE appointments_partitioned (
  LIKE appointments INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS
) PARTITION BY RANGE ("appointmentDate");
-- Create partitions for current + next 12 months
DECLARE y INT;
m INT;
BEGIN FOR i IN 0..12 LOOP y := EXTRACT(
  YEAR
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
m := EXTRACT(
  MONTH
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
PERFORM create_monthly_partition('appointments_partitioned', y, m);
END LOOP;
END;
END IF;
END;
$$;
-- =============================================================================
-- 2. HEALTH_READINGS — partition by created_at (monthly)
-- =============================================================================
DO $$ BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'health_readings_partitioned'
    AND n.nspname = 'public'
) THEN CREATE TABLE health_readings_partitioned (
  LIKE health_readings INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS
) PARTITION BY RANGE (created_at);
DECLARE y INT;
m INT;
BEGIN FOR i IN 0..12 LOOP y := EXTRACT(
  YEAR
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
m := EXTRACT(
  MONTH
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
PERFORM create_monthly_partition('health_readings_partitioned', y, m);
END LOOP;
END;
END IF;
END;
$$;
-- =============================================================================
-- 3. PLATFORM_AUDIT_LOGS — partition by created_at (weekly)
-- =============================================================================
DO $$ BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'platform_audit_logs_partitioned'
    AND n.nspname = 'public'
) THEN CREATE TABLE platform_audit_logs_partitioned (
  LIKE platform_audit_logs INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS
) PARTITION BY RANGE (created_at);
-- Create weekly partitions for next 8 weeks
DECLARE week_start DATE;
week_end DATE;
BEGIN FOR i IN 0..7 LOOP week_start := date_trunc('week', CURRENT_DATE) + (i * 7 || ' days')::INTERVAL;
week_end := week_start + INTERVAL '7 days';
EXECUTE format(
  'CREATE TABLE IF NOT EXISTS platform_audit_logs_%s PARTITION OF platform_audit_logs_partitioned FOR VALUES FROM (%L) TO (%L)',
  to_char(week_start, 'YYYY_WW'),
  week_start,
  week_end
);
END LOOP;
END;
END IF;
END;
$$;
-- =============================================================================
-- 4. NOTIFICATIONS — partition by created_at (monthly) + 90-day TTL policy
-- =============================================================================
DO $$
DECLARE notifications_partition_col TEXT;
BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'notifications_partitioned'
    AND n.nspname = 'public'
) THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'created_at'
    ) THEN 'created_at'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
        AND column_name = 'createdAt'
    ) THEN 'createdAt'
    ELSE NULL
  END INTO notifications_partition_col;
IF notifications_partition_col IS NULL THEN RAISE NOTICE 'Skipping notifications partitioning: no created_at/createdAt column found';
ELSE EXECUTE format(
  'CREATE TABLE notifications_partitioned (LIKE notifications INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS) PARTITION BY RANGE (%I)',
  notifications_partition_col
);
DECLARE y INT;
m INT;
BEGIN FOR i IN 0..12 LOOP y := EXTRACT(
  YEAR
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
m := EXTRACT(
  MONTH
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
PERFORM create_monthly_partition('notifications_partitioned', y, m);
END LOOP;
END;
END IF;
END IF;
END;
$$;
-- =============================================================================
-- 5. AI_AGENT_RUNS — partition by created_at (monthly)
-- =============================================================================
DO $$ BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'ai_agent_runs_partitioned'
    AND n.nspname = 'public'
) THEN CREATE TABLE ai_agent_runs_partitioned (
  LIKE ai_agent_runs INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING COMMENTS
) PARTITION BY RANGE (created_at);
DECLARE y INT;
m INT;
BEGIN FOR i IN 0..12 LOOP y := EXTRACT(
  YEAR
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
m := EXTRACT(
  MONTH
  FROM CURRENT_DATE + (i || ' months')::INTERVAL
)::INT;
PERFORM create_monthly_partition('ai_agent_runs_partitioned', y, m);
END LOOP;
END;
END IF;
END;
$$;
-- =============================================================================
-- 6. AUTO-PARTITION CRON (pg_cron if available)
-- =============================================================================
-- NOTE: Scheduling is intentionally deferred to ops runtime automation.
-- This migration only ensures partition helper/table setup and remains parser-safe.
DO $$ BEGIN IF EXISTS (
  SELECT 1
  FROM pg_extension
  WHERE extname = 'pg_cron'
) THEN RAISE NOTICE 'pg_cron detected. Schedule monthly partition job via ops runbook.';
END IF;
END;
$$;