export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS corporate_ahc_entitlement_extensions (
      id BIGSERIAL PRIMARY KEY,
      package_id VARCHAR(150) NOT NULL REFERENCES corporate_health_package_catalog(id) ON DELETE RESTRICT,
      corporate_id INTEGER NOT NULL REFERENCES corporates(id) ON DELETE RESTRICT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      old_valid_to DATE NOT NULL,
      new_valid_to DATE NOT NULL,
      granted_days INTEGER NOT NULL CHECK (granted_days BETWEEN 1 AND 15),
      hr_request_reference VARCHAR(150) NOT NULL,
      reason TEXT NOT NULL,
      granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(package_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_corporate_ahc_extensions_corporate ON corporate_ahc_entitlement_extensions(corporate_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS corporate_ahc_entitlement_notifications (
      id BIGSERIAL PRIMARY KEY,
      package_id VARCHAR(150) NOT NULL REFERENCES corporate_health_package_catalog(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('invitation','extension','reminder_15','reminder_7','reminder_3','reminder_1')),
      valid_to DATE NOT NULL,
      email_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      UNIQUE(package_id, user_id, event_type, valid_to)
    );
  `);
}
export async function down(pool) { await pool.query('DROP TABLE IF EXISTS corporate_ahc_entitlement_notifications; DROP TABLE IF EXISTS corporate_ahc_entitlement_extensions'); }
