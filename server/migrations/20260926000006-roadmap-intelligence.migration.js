/**
 * Roadmap-intelligence tables (SDoH, wound tracking, antibiogram, pharmacogenomics, ESG, smart rooms, voice
 * biometrics, AR surgical plans) — schema moved OUT of the request path (routes/roadmap-intelligence.route.js used to run
 * 11 CREATE TABLEs on every request) and put under tenant row-level security.
 *
 * Additive and idempotent: CREATE TABLE IF NOT EXISTS keeps every existing table and row. RLS is ENABLED and FORCED (the
 * app role owns these tables; without FORCE an owner bypasses its own policies) — so every access path must run inside
 * withRlsTransaction, which the router now does. The policy compares tenant_id to app.current_org_id; a platform-admin
 * session may bypass via app.is_platform_admin.
 *
 * APPLY THIS BEFORE deploying the router change (the router no longer creates tables). Through scripts/ssm-env-loader.mjs
 * argv[1] is the loader, so import up() from a wrapper and verify with scripts/ops/verify-roadmap-rls.mjs.
 */
import pool from '../db/pgPool.js';

export const TABLES = [
  'sdoh_screenings', 'wound_tracking_records', 'culture_results', 'pgx_profiles', 'esg_entries',
  'smart_room_devices', 'smart_room_events', 'voice_biometric_consents', 'voice_biometric_enrollments',
  'voice_biometric_verifications', 'ar_surgical_plans',
];

const DDL = `
CREATE TABLE IF NOT EXISTS sdoh_screenings (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  housing VARCHAR(40), food_access VARCHAR(40), transport VARCHAR(40), employment VARCHAR(40), safety VARCHAR(40),
  risk_level VARCHAR(24) NOT NULL, referrals JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wound_tracking_records (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  wound_type VARCHAR(80), stage VARCHAR(80), area_cm2 NUMERIC(10,2), healing_percent NUMERIC(5,2),
  note TEXT, image_ref VARCHAR(240), created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS culture_results (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER,
  organism VARCHAR(160) NOT NULL, antibiotic VARCHAR(160) NOT NULL, sensitivity VARCHAR(24) NOT NULL,
  specimen VARCHAR(120), collected_at DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pgx_profiles (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  gene VARCHAR(80) NOT NULL, phenotype VARCHAR(120) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS esg_entries (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, category VARCHAR(120) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL, unit VARCHAR(40) NOT NULL, emissions_kgco2e NUMERIC(12,4) NOT NULL,
  captured_at DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS smart_room_devices (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, room_code VARCHAR(80) NOT NULL,
  device_code VARCHAR(80) NOT NULL, device_type VARCHAR(80) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'registered',
  last_seen_at TIMESTAMP, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, device_code)
);
CREATE TABLE IF NOT EXISTS smart_room_events (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, room_code VARCHAR(80) NOT NULL,
  device_code VARCHAR(80), event_type VARCHAR(120) NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS voice_biometric_consents (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  consent_status VARCHAR(24) NOT NULL, captured_by VARCHAR(160), notes TEXT,
  captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS voice_biometric_enrollments (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  consent_id INTEGER REFERENCES voice_biometric_consents(id) ON DELETE SET NULL,
  sample_ref VARCHAR(240) NOT NULL, model_version VARCHAR(80), status VARCHAR(24) NOT NULL DEFAULT 'pending_validation',
  enrolled_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS voice_biometric_verifications (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  enrollment_id INTEGER REFERENCES voice_biometric_enrollments(id) ON DELETE SET NULL,
  sample_ref VARCHAR(240) NOT NULL, score NUMERIC(5,4), verdict VARCHAR(24) NOT NULL DEFAULT 'review_required',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ar_surgical_plans (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
  case_reference VARCHAR(120) NOT NULL, dicom_study_ref VARCHAR(240), segmentation_ref VARCHAR(240), mesh_ref VARCHAR(240),
  target_device VARCHAR(120), status VARCHAR(24) NOT NULL DEFAULT 'draft', notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sdoh_screenings_tenant_patient ON sdoh_screenings (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_wound_tracking_tenant_patient ON wound_tracking_records (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_culture_results_tenant ON culture_results (tenant_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_pgx_profiles_tenant_patient ON pgx_profiles (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_esg_entries_tenant ON esg_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_smart_room_events_tenant ON smart_room_events (tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_voice_consents_tenant_patient ON voice_biometric_consents (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_ar_plans_tenant_patient ON ar_surgical_plans (tenant_id, patient_id);
`;

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(DDL);
    for (const t of TABLES) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
      await client.query(`DROP POLICY IF EXISTS ${t}_tenant_isolation ON ${t}`);
      await client.query(
        `CREATE POLICY ${t}_tenant_isolation ON ${t}
           USING (tenant_id = NULLIF(current_setting('app.current_org_id', true), '')::int OR current_setting('app.is_platform_admin', true) = 'true')
           WITH CHECK (tenant_id = NULLIF(current_setting('app.current_org_id', true), '')::int OR current_setting('app.is_platform_admin', true) = 'true')`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Removes the RLS policies and FORCE (keeps the tables and data). */
export async function down() {
  for (const t of TABLES) {
    await pool.query(`DROP POLICY IF EXISTS ${t}_tenant_isolation ON ${t}`);
    await pool.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
  }
}

export default { up, down, TABLES };
