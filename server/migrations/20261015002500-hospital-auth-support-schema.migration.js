import pool from '../db/pgPool.js';

/** Hospital authentication, interoperability defaults, and FHIR audit schema. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_interop_config (
      tenant_id INTEGER PRIMARY KEY,
      fhir_base_url TEXT,
      hl7_facility_id VARCHAR(50),
      hl7_sending_app VARCHAR(50) NOT NULL DEFAULT 'MEDICZY_HMIS',
      dicom_ae_title VARCHAR(16),
      abdm_hip_id VARCHAR(50),
      smart_auth_url TEXT,
      terminology_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS fhir_audit_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER,
      user_id TEXT,
      action VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50) NOT NULL DEFAULT 'AuditEvent',
      outcome VARCHAR(10) NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      detail JSONB,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fhir_audit_tenant ON fhir_audit_events(tenant_id, recorded_at);
    CREATE TABLE IF NOT EXISTS hospital_refresh_tokens (
      jti UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id INTEGER,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      device_fp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hrt_user_id ON hospital_refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_hrt_expires ON hospital_refresh_tokens(expires_at);
    CREATE TABLE IF NOT EXISTS hospital_login_attempts (
      email TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ
    );
  `);
  console.log('[migration] Hospital auth/support schema ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS hospital_login_attempts, hospital_refresh_tokens, fhir_audit_events, tenant_interop_config CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
