import pool from '../db/pgPool.js';

/** Migration-owned clinical qualification and privilege governance. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_staff_qualifications (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      qualification_code TEXT NOT NULL,
      qualification_name TEXT NOT NULL,
      registration_number TEXT,
      issued_at DATE,
      expires_at DATE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','revoked')),
      verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
      verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      verified_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_staff_privileges (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      privilege_code TEXT NOT NULL,
      department TEXT,
      qualification_id BIGINT REFERENCES hr_staff_qualifications(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
      valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
      valid_until DATE,
      granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_hr_staff_qualifications_scope
      ON hr_staff_qualifications (tenant_id, staff_user_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_hr_staff_qualifications_expiry
      ON hr_staff_qualifications (tenant_id, expires_at)
      WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_hr_staff_privileges_scope
      ON hr_staff_privileges (tenant_id, staff_user_id, privilege_code, status);
    CREATE INDEX IF NOT EXISTS idx_hr_staff_privileges_expiry
      ON hr_staff_privileges (tenant_id, valid_until)
      WHERE status = 'active';
  `);
  console.log('[migration] HRMS qualifications and privileges ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS hr_staff_privileges CASCADE, hr_staff_qualifications CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
