import pool from '../db/pgPool.js';

/** Migration-owned OT safety override audit. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ot_safety_overrides (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      ot_booking_id BIGINT NOT NULL,
      override_type TEXT NOT NULL DEFAULT 'checklist_bypass',
      blocked_transition TEXT,
      missing_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      reason_code TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      approver_role TEXT,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      override_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS override_type TEXT DEFAULT 'checklist_bypass';
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS blocked_transition TEXT;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS missing_items JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS reason_code TEXT;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS approver_id TEXT;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS approver_role TEXT;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE ot_safety_overrides ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_ot_safety_overrides_org_booking
      ON ot_safety_overrides (organization_id, ot_booking_id, override_at DESC);
  `);
  console.log('[migration] OT safety governance schema ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS ot_safety_overrides CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
