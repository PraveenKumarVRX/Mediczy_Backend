/**
 * CV inference metadata on imaging_ai_triage (backend + attributions from Python service).
 */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE imaging_ai_triage
      ADD COLUMN IF NOT EXISTS inference_backend VARCHAR(40),
      ADD COLUMN IF NOT EXISTS feature_attributions JSONB NOT NULL DEFAULT '[]';
  `);
}

export async function down(pool) {
  await pool.query(`
    ALTER TABLE imaging_ai_triage
      DROP COLUMN IF EXISTS inference_backend,
      DROP COLUMN IF EXISTS feature_attributions;
  `);
}
