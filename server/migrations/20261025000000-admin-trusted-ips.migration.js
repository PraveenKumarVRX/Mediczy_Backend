/**
 * Trusted-IP binding for admin accounts (isAdmin=true users). Empty list =
 * unrestricted (opt-in), matching the existing MFA opt-in pattern in
 * mfa-step-up.service.js - adding a login's own current IP here is what
 * turns enforcement on for that account, never a default-on restriction
 * that could lock an admin out before they've configured anything.
 *
 * Run: node server/scripts/ssm-env-loader.mjs server/migrations/20261025000000-admin-trusted-ips.migration.js
 */
import pool from '../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_trusted_ips (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_or_cidr TEXT NOT NULL,
      label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_trusted_ips_user_id ON admin_trusted_ips(user_id)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_trusted_ips_user_ip ON admin_trusted_ips(user_id, ip_or_cidr)`);
  await client.query('COMMIT');
  console.log('✅ admin_trusted_ips table ready');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ admin-trusted-ips migration failed:', err.message);
  client.release();
  process.exit(1);
}
client.release();
process.exit(0);
