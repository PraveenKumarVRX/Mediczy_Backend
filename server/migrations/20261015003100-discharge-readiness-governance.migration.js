import pool from '../db/pgPool.js';

/** Migration-owned ADT discharge readiness and override audit. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discharge_readiness_items (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id BIGINT NOT NULL,
      dimension TEXT NOT NULL,
      label TEXT NOT NULL,
      mandatory BOOLEAN NOT NULL DEFAULT TRUE,
      is_complete BOOLEAN NOT NULL DEFAULT FALSE,
      completed_by TEXT,
      completed_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS mandatory BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS is_complete BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS completed_by TEXT;
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE discharge_readiness_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_dri_admission ON discharge_readiness_items (organization_id, admission_id);
    DELETE FROM discharge_readiness_items older
    USING discharge_readiness_items newer
    WHERE older.id < newer.id
      AND older.organization_id IS NOT DISTINCT FROM newer.organization_id
      AND older.admission_id = newer.admission_id
      AND older.dimension = newer.dimension
      AND (newer.updated_at, newer.id) >= (older.updated_at, older.id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dri_org_admission_dimension
      ON discharge_readiness_items (organization_id, admission_id, dimension);

    CREATE TABLE IF NOT EXISTS discharge_overrides (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id BIGINT NOT NULL,
      missing_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      reason_code TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      approver_role TEXT,
      override_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS missing_items JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS reason_code TEXT;
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS approver_id TEXT;
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS approver_role TEXT;
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE discharge_overrides ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_discharge_override_org_admission
      ON discharge_overrides (organization_id, admission_id, override_at DESC);
  `);
  console.log('[migration] Discharge readiness governance schema ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS discharge_overrides, discharge_readiness_items CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
