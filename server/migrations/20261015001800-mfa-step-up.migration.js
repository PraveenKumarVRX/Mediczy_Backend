import pool from '../db/pgPool.js';

/** Migration-owned storage for tenant-scoped TOTP step-up authentication. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mfa_factors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(120) NOT NULL,
      organization_id VARCHAR(120),
      factor_type VARCHAR(20) NOT NULL DEFAULT 'totp'
        CHECK (factor_type IN ('totp')),
      secret_ciphertext TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','active','disabled')),
      enrolled_at TIMESTAMPTZ,
      disabled_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, organization_id, factor_type)
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_factors_user
      ON mfa_factors (user_id, organization_id, status);

    CREATE TABLE IF NOT EXISTS mfa_audit_events (
      id BIGSERIAL PRIMARY KEY,
      user_id VARCHAR(120) NOT NULL,
      organization_id VARCHAR(120),
      event_type VARCHAR(40) NOT NULL,
      factor_id UUID,
      success BOOLEAN NOT NULL DEFAULT TRUE,
      request_id VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_audit_user_time
      ON mfa_audit_events (user_id, created_at DESC);
  `);
  console.log('[migration] MFA step-up storage ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS mfa_audit_events; DROP TABLE IF EXISTS mfa_factors;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
