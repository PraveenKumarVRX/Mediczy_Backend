/**
 * Migration: Physician Acknowledgment Columns
 * =============================================
 * Adds physician_acknowledged_at and acknowledged_by columns to:
 *   - ai_health_risk_scores
 *   - ai_triage_interpretations
 *
 * These columns support ITEM-10 of the SaMD readiness checklist —
 * requiring a physician to explicitly acknowledge high-risk AI outputs
 * before they are considered reviewed.
 *
 * Run: import { runMigration } from './physician-acknowledgment.migration.js'
 *      await runMigration(pool)
 */

export async function runMigration(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── ai_health_risk_scores ───────────────────────────────────────────────
    await client.query(`
      ALTER TABLE ai_health_risk_scores
        ADD COLUMN IF NOT EXISTS physician_acknowledged_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER REFERENCES users(id)
    `);
    console.log('[Migration] ai_health_risk_scores: physician acknowledgment columns added');

    // ── ai_triage_interpretations ───────────────────────────────────────────
    await client.query(`
      ALTER TABLE ai_triage_interpretations
        ADD COLUMN IF NOT EXISTS physician_acknowledged_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER REFERENCES users(id)
    `);
    console.log('[Migration] ai_triage_interpretations: physician acknowledgment columns added');

    // ── Index for fast unacknowledged high-risk queries ─────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_risk_scores_unacknowledged
        ON ai_health_risk_scores (patient_id, overall_score)
        WHERE physician_acknowledged_at IS NULL
    `);
    console.log('[Migration] idx_risk_scores_unacknowledged index created');

    await client.query('COMMIT');
    console.log('[Migration] physician-acknowledgment migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] physician-acknowledgment migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
