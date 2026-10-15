import pool from '../db/pgPool.js';

/** Migration-owned structured operative notes and signature state. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operative_notes (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      ot_booking_id BIGINT NOT NULL,
      admission_id BIGINT,
      patient_id BIGINT,
      surgeon_id TEXT,
      assistant_surgeon TEXT,
      scrub_nurse TEXT,
      anesthetist_id TEXT,
      procedure_name TEXT NOT NULL,
      incision_type TEXT,
      position_used TEXT,
      anesthesia_type TEXT,
      preop_diagnosis TEXT,
      postop_diagnosis TEXT,
      findings TEXT,
      procedure_steps TEXT,
      specimens_sent TEXT,
      drains_placed TEXT,
      closure_details TEXT,
      blood_loss_ml INTEGER,
      fluids_given TEXT,
      complications TEXT,
      implants_used TEXT,
      special_instructions TEXT,
      follow_up_plan TEXT,
      dictation_source TEXT NOT NULL DEFAULT 'manual',
      draft_content TEXT,
      final_content TEXT,
      signed_by TEXT,
      signed_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'draft',
      note_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS signed_by TEXT;
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS final_content TEXT;
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS note_data JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE operative_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS idx_op_note_booking_signed
      ON operative_notes (ot_booking_id) WHERE status = 'signed';
    CREATE INDEX IF NOT EXISTS idx_op_note_booking_all ON operative_notes (ot_booking_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_op_note_org_booking ON operative_notes (organization_id, ot_booking_id, created_at DESC);
  `);
  console.log('[migration] Operative notes governance schema ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS operative_notes CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
