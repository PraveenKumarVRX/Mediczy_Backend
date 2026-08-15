/**
 * Real activity history for the NHCX compliance panel — replaces a fully
 * static onboarding-checklist object with genuine per-call success/failure
 * records once nhcx-client.service.js is exercised. Also adds government
 * scheme claim support (CGHS/RGHS/Ayushman Bharat/ECHS) — small enough to
 * fold into the same 2026-08-15 migration rather than a dedicated file.
 */
export async function up(client) {
  const q = client.query.bind(client);

  // Government scheme claim support (CGHS/RGHS/Ayushman Bharat/ECHS) — folded
  // into this migration rather than a dedicated one, per the same 2026-08-15 pass.
  // claim_type's allowed-values check is app-level (Sequelize isIn), not a DB
  // constraint, so no constraint needs widening here — only the new column.
  await q(`ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS scheme_name VARCHAR(40)`);

  await q(`
    CREATE TABLE IF NOT EXISTS nhcx_activity_log (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES tenants(id),
      workflow VARCHAR(40) NOT NULL,
      correlation_id UUID,
      configured BOOLEAN NOT NULL DEFAULT false,
      sent BOOLEAN NOT NULL DEFAULT false,
      error TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_nhcx_activity_org ON nhcx_activity_log(organization_id, created_at DESC);
  `);

  console.log('✅ nhcx_activity_log migration applied');
}

export async function down(client) {
  await client.query(`DROP TABLE IF EXISTS nhcx_activity_log`);
  await client.query(`ALTER TABLE insurance_claims DROP COLUMN IF EXISTS scheme_name`);
}
