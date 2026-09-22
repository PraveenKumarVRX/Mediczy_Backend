/**
 * Migration: ER triage correctness — ESI level, dual-write, confirmation (WP-1.8)
 * ================================================================================================
 * Additive only; safe to run repeatedly.
 *
 * er_visits was colour-only (triage_level: red/yellow/green). This adds a real ESI level alongside it
 * without touching a single existing row:
 *   esi_level            1 (most urgent) to 5, nullable. NEVER back-filled from triage_level — colour to
 *                        level is lossy (a plan-doc finding: "red can be 1 or 2, yellow 3, green 4 or 5").
 *                        Every historical row is left with esi_level = NULL and keeps showing as its legacy
 *                        colour; a nurse assigns the real level through a review screen when they touch it.
 *   triage_source        registration | nurse | kiosk | legacy — where the current triage_level/esi_level
 *                        came from.
 *   triage_reviewed      false for a colour-only kiosk write during rollout (a queue-ordering hint only,
 *                        per the plan, until a nurse confirms it); true otherwise, including every existing
 *                        row (nobody needs to re-review history retroactively).
 *   triage_confirmed_by / triage_confirmed_at  the nurse who reviewed/confirmed it, and when.
 *   triage_inputs        JSONB — the four ESI decision-point inputs (immediate life-saving intervention,
 *                        high-risk situation, resource count, danger-zone vitals) plus age, for audit and
 *                        for the acceptance criterion that a kiosk/legacy row is reviewable, not re-guessed.
 * triage_time already exists on the table but — per the plan's verified finding — was never actually being
 * set by the route; that's a code fix (er-workflow.route.js), not a schema one.
 */
import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query(`SELECT to_regclass('public.er_visits') AS r`)).rows[0].r) {
      await client.query(`ALTER TABLE er_visits ADD COLUMN IF NOT EXISTS esi_level SMALLINT`);
      await client.query(`ALTER TABLE er_visits DROP CONSTRAINT IF EXISTS er_visits_esi_level_check`);
      await client.query(`ALTER TABLE er_visits ADD CONSTRAINT er_visits_esi_level_check CHECK (esi_level IS NULL OR esi_level BETWEEN 1 AND 5)`);
      await client.query(`ALTER TABLE er_visits ADD COLUMN IF NOT EXISTS triage_source VARCHAR(20) NOT NULL DEFAULT 'legacy'`);
      await client.query(`ALTER TABLE er_visits ADD COLUMN IF NOT EXISTS triage_reviewed BOOLEAN NOT NULL DEFAULT true`);
      await client.query(`ALTER TABLE er_visits ADD COLUMN IF NOT EXISTS triage_confirmed_by INTEGER`);
      await client.query(`ALTER TABLE er_visits ADD COLUMN IF NOT EXISTS triage_confirmed_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE er_visits ADD COLUMN IF NOT EXISTS triage_inputs JSONB`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_er_visits_esi_level ON er_visits (esi_level)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_er_visits_triage_reviewed ON er_visits (organization_id, triage_reviewed) WHERE triage_reviewed = false`);
    } else {
      console.log('⚠️  er_visits does not exist here — skipped');
    }
    await client.query('COMMIT');
    console.log('✅ ER triage ESI fields migration applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const col of ['esi_level', 'triage_source', 'triage_reviewed', 'triage_confirmed_by', 'triage_confirmed_at', 'triage_inputs']) {
      await client.query(`ALTER TABLE er_visits DROP COLUMN IF EXISTS ${col}`).catch(() => {});
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (process.argv[1] && process.argv[1].includes('er-triage-esi-fields.migration')) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
