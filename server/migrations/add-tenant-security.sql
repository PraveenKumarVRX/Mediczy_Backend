-- Tenant Security Enhancements Migration
-- Adds Row-Level Security policies and audit tables
-- Date: February 6, 2026

-- ===================================================================
-- 1. CREATE TENANT ACCESS AUDIT TABLE
-- ===================================================================

CREATE TABLE IF NOT EXISTS tenant_access_audit (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  requested_tenant_id INTEGER,
  actual_tenant_id INTEGER,
  access_method VARCHAR(50) NOT NULL, -- 'subdomain', 'header', 'jwt', 'path'
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  endpoint TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for tenant access audit
CREATE INDEX IF NOT EXISTS idx_tenant_audit_user ON tenant_access_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_requested ON tenant_access_audit(requested_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_created ON tenant_access_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_success ON tenant_access_audit(success);

-- ===================================================================
-- 2. ENABLE ROW-LEVEL SECURITY ON TENANT TABLES
-- ===================================================================

-- Users table (if has tenant_id column)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policy for users
    DROP POLICY IF EXISTS tenant_isolation_users ON users;
    CREATE POLICY tenant_isolation_users ON users
      USING (
        tenant_id IS NULL OR 
        tenant_id::text = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;

-- API Users table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'api_users'
  ) THEN
    ALTER TABLE api_users ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_api_users ON api_users;
    CREATE POLICY tenant_isolation_api_users ON api_users
      USING (tenant_id::text = current_setting('app.current_tenant', true));
  END IF;
END $$;

-- Appointments table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'appointments' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_appointments ON appointments;
    CREATE POLICY tenant_isolation_appointments ON appointments
      USING (
        tenant_id IS NULL OR
        tenant_id::text = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;

-- API Chat Rooms table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'api_chat_rooms'
  ) THEN
    ALTER TABLE api_chat_rooms ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_chat_rooms ON api_chat_rooms;
    CREATE POLICY tenant_isolation_chat_rooms ON api_chat_rooms
      USING (tenant_id::text = current_setting('app.current_tenant', true));
  END IF;
END $$;

-- API Chat Messages table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'api_chat_messages'
  ) THEN
    ALTER TABLE api_chat_messages ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_chat_messages ON api_chat_messages;
    CREATE POLICY tenant_isolation_chat_messages ON api_chat_messages
      USING (
        EXISTS (
          SELECT 1 FROM api_chat_rooms 
          WHERE api_chat_rooms.room_id = api_chat_messages.room_id
            AND api_chat_rooms.tenant_id::text = current_setting('app.current_tenant', true)
        )
      );
  END IF;
END $$;

-- Prescriptions table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prescriptions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_prescriptions ON prescriptions;
    CREATE POLICY tenant_isolation_prescriptions ON prescriptions
      USING (
        tenant_id IS NULL OR
        tenant_id::text = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;

-- Lab bookings table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lab_bookings' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE lab_bookings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_lab_bookings ON lab_bookings;
    CREATE POLICY tenant_isolation_lab_bookings ON lab_bookings
      USING (
        tenant_id IS NULL OR
        tenant_id::text = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;

-- Pharmacy orders table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pharmacy_orders' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE pharmacy_orders ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_pharmacy_orders ON pharmacy_orders;
    CREATE POLICY tenant_isolation_pharmacy_orders ON pharmacy_orders
      USING (
        tenant_id IS NULL OR
        tenant_id::text = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;

-- Webhooks table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhooks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS tenant_isolation_webhooks ON webhooks;
    CREATE POLICY tenant_isolation_webhooks ON webhooks
      USING (
        tenant_id IS NULL OR
        tenant_id::text = current_setting('app.current_tenant', true)
      );
  END IF;
END $$;

-- ===================================================================
-- 3. ADD TENANT_ID TO TABLES THAT DON'T HAVE IT
-- ===================================================================

-- Function to safely add tenant_id column
CREATE OR REPLACE FUNCTION add_tenant_id_column(table_name text)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = table_name AND column_name = 'tenant_id'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE', table_name);
    EXECUTE format('CREATE INDEX idx_%I_tenant_id ON %I(tenant_id)', table_name, table_name);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add tenant_id to common tables (run selectively)
-- Uncomment as needed:
-- SELECT add_tenant_id_column('doctors');
-- SELECT add_tenant_id_column('nurses');
-- SELECT add_tenant_id_column('patients');
-- SELECT add_tenant_id_column('appointments');
-- SELECT add_tenant_id_column('prescriptions');

-- ===================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ===================================================================

-- Function to get current tenant ID from session
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS INTEGER AS $$
BEGIN
  RETURN current_setting('app.current_tenant', true)::INTEGER;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user has access to tenant
CREATE OR REPLACE FUNCTION user_has_tenant_access(user_id INTEGER, tenant_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  user_tenant_id INTEGER;
BEGIN
  SELECT u.tenant_id INTO user_tenant_id
  FROM users u
  WHERE u.id = user_id;
  
  RETURN user_tenant_id = tenant_id OR user_tenant_id IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ===================================================================
-- 5. CREATE VIEWS FOR MONITORING
-- ===================================================================

-- View: Recent suspicious access attempts
CREATE OR REPLACE VIEW v_suspicious_tenant_access AS
SELECT 
  user_id,
  requested_tenant_id,
  actual_tenant_id,
  access_method,
  COUNT(*) as attempt_count,
  MAX(created_at) as last_attempt,
  array_agg(DISTINCT ip_address) as ip_addresses
FROM tenant_access_audit
WHERE success = false
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, requested_tenant_id, actual_tenant_id, access_method
HAVING COUNT(*) >= 3
ORDER BY last_attempt DESC;

-- View: Tenant access statistics
CREATE OR REPLACE VIEW v_tenant_access_stats AS
SELECT 
  requested_tenant_id as tenant_id,
  DATE(created_at) as date,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips
FROM tenant_access_audit
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY requested_tenant_id, DATE(created_at)
ORDER BY date DESC, tenant_id;

-- ===================================================================
-- ROLLBACK SCRIPT (if needed)
-- ===================================================================

-- To disable RLS (run individually):
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_chat_rooms DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_chat_messages DISABLE ROW LEVEL SECURITY;

-- To drop audit table:
-- DROP TABLE IF EXISTS tenant_access_audit CASCADE;
-- DROP VIEW IF EXISTS v_suspicious_tenant_access;
-- DROP VIEW IF EXISTS v_tenant_access_stats;

COMMENT ON TABLE tenant_access_audit IS 'Logs all tenant access attempts for security monitoring';
COMMENT ON FUNCTION current_tenant_id() IS 'Returns the current tenant ID from PostgreSQL session variable';
COMMENT ON FUNCTION user_has_tenant_access(INTEGER, INTEGER) IS 'Checks if user has access to specified tenant';
