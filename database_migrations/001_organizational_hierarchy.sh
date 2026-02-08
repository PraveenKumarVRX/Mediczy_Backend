#!/bin/bash

# Database Migration: Organizational Hierarchy Enhancement
# Implements aggregator-wellness partner linking and network management

echo "🔧 Starting Organizational Hierarchy Database Migration..."
echo "=================================================="

PGPASSWORD='Mediczy2024Helper' psql -h localhost -p 5433 -U mediczy_helper -d mediczy_ai -X -q << 'EOF'

-- ============================================
-- PHASE 1: Add Aggregator Links to Partner Tables
-- ============================================

ALTER TABLE IF EXISTS hospitals ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS hospitals ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance', 'hospital'));
CREATE INDEX IF NOT EXISTS idx_hospitals_aggregator ON hospitals(aggregator_id, aggregator_type);

ALTER TABLE IF EXISTS clinics ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS clinics ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance'));
CREATE INDEX IF NOT EXISTS idx_clinics_aggregator ON clinics(aggregator_id, aggregator_type);

ALTER TABLE IF EXISTS labs ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS labs ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance'));
CREATE INDEX IF NOT EXISTS idx_labs_aggregator ON labs(aggregator_id, aggregator_type);

ALTER TABLE IF EXISTS pharmacies ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS pharmacies ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance'));
CREATE INDEX IF NOT EXISTS idx_pharmacies_aggregator ON pharmacies(aggregator_id, aggregator_type);

ALTER TABLE IF EXISTS ambulances ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS ambulances ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance'));
CREATE INDEX IF NOT EXISTS idx_ambulances_aggregator ON ambulances(aggregator_id, aggregator_type);

ALTER TABLE IF EXISTS homecare_providers ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS homecare_providers ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance'));
CREATE INDEX IF NOT EXISTS idx_homecare_aggregator ON homecare_providers(aggregator_id, aggregator_type);

-- ============================================
-- PHASE 2: Create Aggregator Wellness Network Table
-- ============================================

CREATE TABLE IF NOT EXISTS aggregator_wellness_network (
  id SERIAL PRIMARY KEY,
  aggregator_id INT NOT NULL,
  aggregator_type VARCHAR(50) NOT NULL CHECK (aggregator_type IN ('broker', 'tpa', 'insurance', 'hospital')),
  wellness_provider_type VARCHAR(50) NOT NULL CHECK (wellness_provider_type IN ('hospital', 'clinic', 'lab', 'pharmacy', 'ambulance', 'homecare')),
  wellness_provider_id INT NOT NULL,
  network_status VARCHAR(20) DEFAULT 'active' CHECK (network_status IN ('active', 'inactive', 'suspended', 'pending')),
  commission_percentage NUMERIC(5,2) DEFAULT 0.00,
  service_categories JSONB DEFAULT '[]'::jsonb,
  contract_start_date DATE,
  contract_end_date DATE,
  contract_document_url VARCHAR(500),
  coverage_areas JSONB DEFAULT '{}'::jsonb,
  contact_person JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_aggregator_provider UNIQUE (aggregator_id, aggregator_type, wellness_provider_type, wellness_provider_id)
);

CREATE INDEX IF NOT EXISTS idx_aggregator_network_agg ON aggregator_wellness_network(aggregator_id, aggregator_type);
CREATE INDEX IF NOT EXISTS idx_aggregator_network_status ON aggregator_wellness_network(network_status);
CREATE INDEX IF NOT EXISTS idx_aggregator_network_provider ON aggregator_wellness_network(wellness_provider_type, wellness_provider_id);

-- ============================================
-- PHASE 3: Corporate-to-Aggregator Explicit Link
-- ============================================

ALTER TABLE IF EXISTS corporates ADD COLUMN IF NOT EXISTS aggregator_id INT REFERENCES insurance_brokers(id) ON DELETE RESTRICT;
ALTER TABLE IF EXISTS corporates ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50) CHECK (aggregator_type IN ('broker', 'tpa', 'insurance', 'hospital'));
CREATE INDEX IF NOT EXISTS idx_corporates_aggregator ON corporates(aggregator_id, aggregator_type);

-- ============================================
-- PHASE 4: Aggregator-Specific Roles
-- ============================================

-- Ensure roles table has these entries
INSERT INTO roles (name, description, permissions)
VALUES 
  ('aggregator_admin', 'Aggregator/Broker Administrator', '{"manage_corporates": true, "view_partners": true, "manage_network": true, "view_analytics": true}'::jsonb),
  ('aggregator_manager', 'Aggregator Manager', '{"manage_corporates": false, "view_partners": true, "manage_network": false, "view_analytics": true}'::jsonb),
  ('broker_claims_manager', 'Broker/TPA Claims Manager', '{"process_claims": true, "manage_authorizations": true, "view_policies": true}'::jsonb),
  ('broker_policy_manager', 'Policy Manager', '{"manage_policies": true, "view_claims": true, "manage_partners": true}'::jsonb)
ON CONFLICT (name) DO UPDATE SET 
  permissions = EXCLUDED.permissions,
  "updatedAt" = NOW();

-- ============================================
-- PHASE 5: Enhanced Users Table for Aggregator Context
-- ============================================

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS aggregator_id INT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS aggregator_type VARCHAR(50);

-- Drop if exists to recreate with proper foreign key
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_aggregator_id;

-- Note: Can't enforce foreign key since aggregator_id references different tables
-- Will validate in application layer
CREATE INDEX IF NOT EXISTS idx_users_aggregator ON users(aggregator_id, aggregator_type);

-- ============================================
-- PHASE 6: Audit Trail for Aggregator Actions
-- ============================================

CREATE TABLE IF NOT EXISTS aggregator_action_logs (
  id SERIAL PRIMARY KEY,
  aggregator_id INT NOT NULL,
  aggregator_type VARCHAR(50) NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT,
  changes JSONB,
  ip_address VARCHAR(50),
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aggregator_logs_agg ON aggregator_action_logs(aggregator_id, aggregator_type);
CREATE INDEX IF NOT EXISTS idx_aggregator_logs_user ON aggregator_action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_aggregator_logs_action ON aggregator_action_logs(action_type, entity_type);

-- ============================================
-- PHASE 7: Sample Data (Optional)
-- ============================================

-- Example: Link existing corporate (id=7) to broker (if exists)
-- UPDATE corporates SET aggregator_id = 1, aggregator_type = 'broker' WHERE id = 7;
-- UPDATE users SET aggregator_id = 1, aggregator_type = 'broker' WHERE corporate_id = 7;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

SELECT '✅ Migration Summary:' as Status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name='aggregator_wellness_network';

SELECT '✅ Partner table updates:' as Status;
SELECT table_name, column_name FROM information_schema.columns 
WHERE table_schema='public' AND column_name='aggregator_id'
ORDER BY table_name;

SELECT '✅ Aggregator roles created:' as Status;
SELECT name FROM roles WHERE name LIKE '%aggregator%' OR name LIKE '%broker%';

EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "=================================================="
  echo "✅ DATABASE MIGRATION COMPLETED SUCCESSFULLY"
  echo "=================================================="
else
  echo ""
  echo "=================================================="
  echo "❌ DATABASE MIGRATION FAILED"
  echo "=================================================="
  exit 1
fi
