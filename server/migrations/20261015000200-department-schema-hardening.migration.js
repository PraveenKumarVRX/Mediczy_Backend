/**
 * Department schema hardening.
 * CSSD and Dietary used to create their tables on the first request. Biomedical's
 * HyperGrid sync endpoint did the same for its equipment registry. These tables are
 * now owned by the migration chain so production traffic never performs DDL.
 */
import pool from '../db/pgPool.js';
import { cssdScope, dietaryScope } from '../services/dept-tenant-scope.service.js';

const SQL = `
CREATE TABLE IF NOT EXISTS cssd_sets (
  id SERIAL PRIMARY KEY,
  set_code VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  service_line VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'available',
  sterile_until TIMESTAMP,
  current_location VARCHAR(160),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cssd_cycles (
  id SERIAL PRIMARY KEY,
  autoclave_id VARCHAR(80) NOT NULL,
  cycle_number VARCHAR(80) NOT NULL,
  temperature NUMERIC(5,2),
  pressure NUMERIC(5,2),
  duration_minutes INTEGER,
  biological_indicator VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  released_by VARCHAR(160),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cssd_jobs (
  id SERIAL PRIMARY KEY,
  job_number VARCHAR(80) UNIQUE NOT NULL,
  set_id INTEGER REFERENCES cssd_sets(id) ON DELETE SET NULL,
  source_department VARCHAR(120),
  requested_by VARCHAR(160),
  status VARCHAR(40) NOT NULL DEFAULT 'received',
  cycle_id INTEGER REFERENCES cssd_cycles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cssd_set_usage (
  id SERIAL PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES cssd_sets(id),
  ot_booking_id INTEGER NOT NULL,
  used_at TIMESTAMP NOT NULL DEFAULT NOW(),
  recorded_by VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS dietary_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(80) UNIQUE NOT NULL,
  admission_id VARCHAR(80),
  patient_id VARCHAR(80),
  patient_name VARCHAR(160) NOT NULL,
  ward VARCHAR(120),
  bed VARCHAR(40),
  diet_type VARCHAR(120) NOT NULL,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  restrictions TEXT,
  calories INTEGER,
  priority VARCHAR(24) NOT NULL DEFAULT 'normal',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  physician VARCHAR(160),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS dietary_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  diet_type VARCHAR(120) NOT NULL,
  calories INTEGER,
  meal_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  restrictions TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS dietary_counselling (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(80),
  order_id INTEGER REFERENCES dietary_orders(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  instructions TEXT,
  created_by VARCHAR(160),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hg_equipment_inventory (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  equipment_class VARCHAR(120) NOT NULL,
  device_name VARCHAR(200) NOT NULL,
  manufacturer VARCHAR(160),
  model VARCHAR(160),
  serial_number VARCHAR(160),
  department VARCHAR(160),
  location VARCHAR(160),
  protocol VARCHAR(80),
  owner_department VARCHAR(120),
  integration_status VARCHAR(32) NOT NULL DEFAULT 'identified',
  connector_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_equipment_inventory_tenant ON hg_equipment_inventory (tenant_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hg_equipment_inventory_tenant_serial
  ON hg_equipment_inventory (tenant_id, serial_number) WHERE serial_number IS NOT NULL;
`;

export async function up() {
  await pool.query(SQL);
  // Existing deployments may have the pre-tenant global unique constraint. Replace it
  // with an organization-aware index so two hospitals can approve the same numeric entity id.
  await pool.query(`
    ALTER TABLE operations_approvals ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE operations_audit_log ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE operations_approvals DROP CONSTRAINT IF EXISTS operations_approvals_module_entity_type_entity_id_action_key;
    ALTER TABLE operations_approvals DROP CONSTRAINT IF EXISTS operations_approvals_module_entity_type_entity_id_action_organization_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_operations_approvals_org_key
      ON operations_approvals (module, entity_type, entity_id, action, organization_id);
  `);
  await cssdScope.apply(pool, (m) => console.log('[CSSD tenant]', m));
  await dietaryScope.apply(pool, (m) => console.log('[Dietary tenant]', m));
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS cssd_set_usage, cssd_jobs, cssd_cycles, cssd_sets, dietary_counselling, dietary_templates, dietary_orders, hg_equipment_inventory CASCADE');
}

if (process.argv[1] && process.argv[1].includes('20261015000200-department-schema-hardening')) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
