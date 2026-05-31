-- =============================================================================
-- MIGRATION 020: Row-Level Security (RLS) for PHI Tables
-- =============================================================================
-- Enforces tenant isolation at the DATABASE level, not just application layer.
-- A missing WHERE clause in application code will NOT expose cross-tenant data.
--
-- Usage: app must run before any query:
--   SET LOCAL app.current_org_id = <organization_id>;
--   SET LOCAL app.current_user_id = <user_id>;
-- =============================================================================
-- Helper functions used by policies
CREATE OR REPLACE FUNCTION current_org_id() RETURNS INTEGER AS $$ BEGIN RETURN NULLIF(current_setting('app.current_org_id', TRUE), '')::INTEGER;
EXCEPTION
WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS INTEGER AS $$ BEGIN RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::INTEGER;
EXCEPTION
WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS BOOLEAN AS $$ BEGIN RETURN NULLIF(
    current_setting('app.is_platform_admin', TRUE),
    ''
  ) = 'true';
EXCEPTION
WHEN OTHERS THEN RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;
DO $$
DECLARE target_table TEXT;
org_col TEXT;
patient_col TEXT;
user_col TEXT;
tenant_col TEXT;
tenant_expr TEXT;
BEGIN -- users
IF to_regclass('public.users') IS NOT NULL THEN EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';
EXECUTE 'ALTER TABLE users FORCE ROW LEVEL SECURITY';
EXECUTE 'DROP POLICY IF EXISTS users_platform_admin ON users';
EXECUTE 'DROP POLICY IF EXISTS users_tenant_isolation ON users';
EXECUTE 'CREATE POLICY users_platform_admin ON users AS PERMISSIVE FOR ALL TO mediczy_helper USING (is_platform_admin() = TRUE)';
EXECUTE 'CREATE POLICY users_tenant_isolation ON users AS PERMISSIVE FOR ALL TO mediczy_helper USING (organization_id = current_org_id() OR id = current_app_user_id() OR organization_id IS NULL)';
END IF;
-- appointments
IF to_regclass('public.appointments') IS NOT NULL THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'organization_id'
    ) THEN 'organization_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'organizationId'
    ) THEN 'organizationId'
    ELSE NULL
  END INTO org_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'tenant_id'
    ) THEN 'tenant_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'tenantId'
    ) THEN 'tenantId'
    ELSE NULL
  END INTO tenant_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'userId'
    ) THEN 'userId'
    ELSE NULL
  END INTO user_col;
tenant_expr := '';
IF org_col IS NOT NULL THEN tenant_expr := format('%I = current_org_id()', org_col);
END IF;
IF tenant_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format('%I = current_org_id()', tenant_col)
  ELSE tenant_expr || ' OR ' || format('%I = current_org_id()', tenant_col)
END;
END IF;
IF user_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format('%I = current_app_user_id()', user_col)
  ELSE tenant_expr || ' OR ' || format('%I = current_app_user_id()', user_col)
END;
END IF;
IF tenant_expr = '' THEN tenant_expr := 'FALSE';
END IF;
EXECUTE 'ALTER TABLE appointments ENABLE ROW LEVEL SECURITY';
EXECUTE 'ALTER TABLE appointments FORCE ROW LEVEL SECURITY';
EXECUTE 'DROP POLICY IF EXISTS appointments_platform_admin ON appointments';
EXECUTE 'DROP POLICY IF EXISTS appointments_tenant_isolation ON appointments';
EXECUTE 'CREATE POLICY appointments_platform_admin ON appointments AS PERMISSIVE FOR ALL TO mediczy_helper USING (is_platform_admin() = TRUE)';
EXECUTE format(
  'CREATE POLICY appointments_tenant_isolation ON appointments AS PERMISSIVE FOR ALL TO mediczy_helper USING (%s)',
  tenant_expr
);
END IF;
-- EHR-like tables (org + patient)
FOREACH target_table IN ARRAY ARRAY ['ehrs', 'medical_records', 'prescriptions', 'lab_orders', 'insurance_claims'] LOOP IF to_regclass('public.' || target_table) IS NOT NULL THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'organization_id'
    ) THEN 'organization_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'organizationId'
    ) THEN 'organizationId'
    ELSE NULL
  END INTO org_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'patient_id'
    ) THEN 'patient_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'patientId'
    ) THEN 'patientId'
    ELSE NULL
  END INTO patient_col;
tenant_expr := '';
IF org_col IS NOT NULL THEN tenant_expr := format('%I = current_org_id()', org_col);
END IF;
IF patient_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format('%I = current_app_user_id()', patient_col)
  ELSE tenant_expr || ' OR ' || format('%I = current_app_user_id()', patient_col)
END;
END IF;
IF tenant_expr = '' THEN tenant_expr := 'FALSE';
END IF;
EXECUTE format(
  'ALTER TABLE %I ENABLE ROW LEVEL SECURITY',
  target_table
);
EXECUTE format(
  'ALTER TABLE %I FORCE ROW LEVEL SECURITY',
  target_table
);
EXECUTE format(
  'DROP POLICY IF EXISTS %I_platform_admin ON %I',
  target_table,
  target_table
);
EXECUTE format(
  'DROP POLICY IF EXISTS %I_tenant_isolation ON %I',
  target_table,
  target_table
);
EXECUTE format(
  'CREATE POLICY %I_platform_admin ON %I AS PERMISSIVE FOR ALL TO mediczy_helper USING (is_platform_admin() = TRUE)',
  target_table,
  target_table
);
EXECUTE format(
  'CREATE POLICY %I_tenant_isolation ON %I AS PERMISSIVE FOR ALL TO mediczy_helper USING (%s)',
  target_table,
  target_table,
  tenant_expr
);
END IF;
END LOOP;
-- vital_signs (patient + org)
IF to_regclass('public.vital_signs') IS NOT NULL THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vital_signs'
        AND column_name = 'organization_id'
    ) THEN 'organization_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vital_signs'
        AND column_name = 'organizationId'
    ) THEN 'organizationId'
    ELSE NULL
  END INTO org_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vital_signs'
        AND column_name = 'patient_id'
    ) THEN 'patient_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vital_signs'
        AND column_name = 'patientId'
    ) THEN 'patientId'
    ELSE NULL
  END INTO patient_col;
tenant_expr := '';
IF patient_col IS NOT NULL THEN tenant_expr := format('%I = current_app_user_id()', patient_col);
END IF;
IF org_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format('%I = current_org_id()', org_col)
  ELSE tenant_expr || ' OR ' || format('%I = current_org_id()', org_col)
END;
END IF;
IF tenant_expr = '' THEN tenant_expr := 'FALSE';
END IF;
EXECUTE 'ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY';
EXECUTE 'ALTER TABLE vital_signs FORCE ROW LEVEL SECURITY';
EXECUTE 'DROP POLICY IF EXISTS vital_signs_platform_admin ON vital_signs';
EXECUTE 'DROP POLICY IF EXISTS vital_signs_tenant_isolation ON vital_signs';
EXECUTE 'CREATE POLICY vital_signs_platform_admin ON vital_signs AS PERMISSIVE FOR ALL TO mediczy_helper USING (is_platform_admin() = TRUE)';
EXECUTE format(
  'CREATE POLICY vital_signs_tenant_isolation ON vital_signs AS PERMISSIVE FOR ALL TO mediczy_helper USING (%s)',
  tenant_expr
);
END IF;
-- health_readings (user + org)
IF to_regclass('public.health_readings') IS NOT NULL THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'health_readings'
        AND column_name = 'organization_id'
    ) THEN 'organization_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'health_readings'
        AND column_name = 'organizationId'
    ) THEN 'organizationId'
    ELSE NULL
  END INTO org_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'health_readings'
        AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'health_readings'
        AND column_name = 'userId'
    ) THEN 'userId'
    ELSE NULL
  END INTO user_col;
tenant_expr := '';
IF user_col IS NOT NULL THEN tenant_expr := format('%I = current_app_user_id()', user_col);
END IF;
IF org_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format('%I = current_org_id()', org_col)
  ELSE tenant_expr || ' OR ' || format('%I = current_org_id()', org_col)
END;
END IF;
IF tenant_expr = '' THEN tenant_expr := 'FALSE';
END IF;
EXECUTE 'ALTER TABLE health_readings ENABLE ROW LEVEL SECURITY';
EXECUTE 'ALTER TABLE health_readings FORCE ROW LEVEL SECURITY';
EXECUTE 'DROP POLICY IF EXISTS health_readings_platform_admin ON health_readings';
EXECUTE 'DROP POLICY IF EXISTS health_readings_tenant_isolation ON health_readings';
EXECUTE 'CREATE POLICY health_readings_platform_admin ON health_readings AS PERMISSIVE FOR ALL TO mediczy_helper USING (is_platform_admin() = TRUE)';
EXECUTE format(
  'CREATE POLICY health_readings_tenant_isolation ON health_readings AS PERMISSIVE FOR ALL TO mediczy_helper USING (%s)',
  tenant_expr
);
END IF;
-- family_members (own records)
IF to_regclass('public.family_members') IS NOT NULL THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_members'
        AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'family_members'
        AND column_name = 'userId'
    ) THEN 'userId'
    ELSE NULL
  END INTO user_col;
tenant_expr := CASE
  WHEN user_col IS NOT NULL THEN format(
    '%I = current_app_user_id() OR is_platform_admin() = TRUE',
    user_col
  )
  ELSE 'is_platform_admin() = TRUE'
END;
EXECUTE 'ALTER TABLE family_members ENABLE ROW LEVEL SECURITY';
EXECUTE 'ALTER TABLE family_members FORCE ROW LEVEL SECURITY';
EXECUTE 'DROP POLICY IF EXISTS family_members_isolation ON family_members';
EXECUTE format(
  'CREATE POLICY family_members_isolation ON family_members AS PERMISSIVE FOR ALL TO mediczy_helper USING (%s)',
  tenant_expr
);
END IF;
-- Supplemental PHI tables discovered after initial rollout
FOREACH target_table IN ARRAY ARRAY ['patient_allergies', 'patient_medications', 'patient_conditions', 'patient_consents', 'patient_consent_history', 'anonymous_patients', 'audit_logs'] LOOP IF to_regclass('public.' || target_table) IS NOT NULL THEN
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'organization_id'
    ) THEN 'organization_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'organizationId'
    ) THEN 'organizationId'
    ELSE NULL
  END INTO org_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'tenant_id'
    ) THEN 'tenant_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'tenantId'
    ) THEN 'tenantId'
    ELSE NULL
  END INTO tenant_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'userId'
    ) THEN 'userId'
    ELSE NULL
  END INTO user_col;
SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'patient_id'
    ) THEN 'patient_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'patientId'
    ) THEN 'patientId'
    ELSE NULL
  END INTO patient_col;
tenant_expr := '';
IF org_col IS NOT NULL THEN tenant_expr := format('%I::text = current_org_id()::text', org_col);
END IF;
IF tenant_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format('%I::text = current_org_id()::text', tenant_col)
  ELSE tenant_expr || ' OR ' || format('%I::text = current_org_id()::text', tenant_col)
END;
END IF;
IF user_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format(
    '%I::text = current_app_user_id()::text',
    user_col
  )
  ELSE tenant_expr || ' OR ' || format(
    '%I::text = current_app_user_id()::text',
    user_col
  )
END;
END IF;
IF patient_col IS NOT NULL THEN tenant_expr := CASE
  WHEN tenant_expr = '' THEN format(
    '%I::text = current_app_user_id()::text',
    patient_col
  )
  ELSE tenant_expr || ' OR ' || format(
    '%I::text = current_app_user_id()::text',
    patient_col
  )
END;
END IF;
IF tenant_expr = '' THEN tenant_expr := 'FALSE';
END IF;
EXECUTE format(
  'ALTER TABLE %I ENABLE ROW LEVEL SECURITY',
  target_table
);
EXECUTE format(
  'ALTER TABLE %I FORCE ROW LEVEL SECURITY',
  target_table
);
EXECUTE format(
  'DROP POLICY IF EXISTS %I_platform_admin ON %I',
  target_table,
  target_table
);
EXECUTE format(
  'DROP POLICY IF EXISTS %I_tenant_isolation ON %I',
  target_table,
  target_table
);
EXECUTE format(
  'CREATE POLICY %I_platform_admin ON %I AS PERMISSIVE FOR ALL TO mediczy_helper USING (is_platform_admin() = TRUE)',
  target_table,
  target_table
);
EXECUTE format(
  'CREATE POLICY %I_tenant_isolation ON %I AS PERMISSIVE FOR ALL TO mediczy_helper USING (%s)',
  target_table,
  target_table,
  tenant_expr
);
END IF;
END LOOP;
END;
$$;
-- =============================================================================
-- RLS ROLLBACK (run if you need to undo)
-- =============================================================================
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS users_platform_admin ON users;
-- DROP POLICY IF EXISTS users_tenant_isolation ON users;
-- (repeat for each table)
-- =============================================================================