import pool from '../db/pgPool.js';

/** Migration-owned shared refresh-token and session-revocation storage. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_refresh_tokens (
      jti UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      portal TEXT NOT NULL,
      device_fp TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user_portal ON portal_refresh_tokens (user_id, portal);
    CREATE INDEX IF NOT EXISTS idx_prt_expires ON portal_refresh_tokens (expires_at);
    CREATE INDEX IF NOT EXISTS idx_prt_jti ON portal_refresh_tokens (jti);

    CREATE TABLE IF NOT EXISTS api_v2_refresh_tokens (
      id BIGSERIAL PRIMARY KEY,
      jti UUID NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      role VARCHAR(50) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      revoked_at TIMESTAMPTZ,
      replaced_by_jti UUID,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_user_role ON api_v2_refresh_tokens(user_id, role);
    CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_expires_at ON api_v2_refresh_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_revoked ON api_v2_refresh_tokens(revoked);
  `);
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS api_v2_refresh_tokens, portal_refresh_tokens CASCADE');
}

if (process.argv[1] && process.argv[1].includes('20261015001700-auth-session-revocation')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
