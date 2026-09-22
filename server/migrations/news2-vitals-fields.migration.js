/**
 * Migration: NEWS2 correctness fields on vital_records (WP-1.8)
 * ================================================================================================
 * Additive only; safe to run repeatedly.
 *
 * Adds the three parameters the old score silently ignored or approximated, plus a completeness flag so a
 * screen can show "incomplete" honestly instead of a score that looks safe because something was missing:
 *   oxygen_supplemental  the patient is on any supplemental oxygen at the time of this reading
 *   consciousness        AVPU/ACVPU level (A alert, C new confusion, V voice, P pain, U unresponsive)
 *   spo2_scale           1 (default) or 2 — scale 2 is for a patient with a clinician-documented target
 *                         saturation range of 88-92% (e.g. hypercapnic COPD risk)
 *   news2_complete        true only when every one of respiratory rate, SpO2, systolic BP, pulse, temperature
 *                         and consciousness was actually recorded for this reading
 */
import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query(`SELECT to_regclass('public.vital_records') AS r`)).rows[0].r) {
      await client.query(`ALTER TABLE vital_records ADD COLUMN IF NOT EXISTS oxygen_supplemental BOOLEAN NOT NULL DEFAULT false`);
      await client.query(`ALTER TABLE vital_records ADD COLUMN IF NOT EXISTS consciousness VARCHAR(1)`);
      await client.query(`ALTER TABLE vital_records DROP CONSTRAINT IF EXISTS vital_records_consciousness_check`);
      await client.query(`ALTER TABLE vital_records ADD CONSTRAINT vital_records_consciousness_check CHECK (consciousness IS NULL OR consciousness IN ('A','C','V','P','U'))`);
      await client.query(`ALTER TABLE vital_records ADD COLUMN IF NOT EXISTS spo2_scale SMALLINT NOT NULL DEFAULT 1`);
      await client.query(`ALTER TABLE vital_records DROP CONSTRAINT IF EXISTS vital_records_spo2_scale_check`);
      await client.query(`ALTER TABLE vital_records ADD CONSTRAINT vital_records_spo2_scale_check CHECK (spo2_scale IN (1,2))`);
      await client.query(`ALTER TABLE vital_records ADD COLUMN IF NOT EXISTS news2_complete BOOLEAN`);
      await client.query(`ALTER TABLE vital_records ADD COLUMN IF NOT EXISTS news2_provisional BOOLEAN NOT NULL DEFAULT false`);
      await client.query(`ALTER TABLE vital_records ADD COLUMN IF NOT EXISTS news2_band VARCHAR(10)`);
    } else {
      console.log('⚠️  vital_records does not exist here — skipped');
    }

    // An 'incomplete_vitals' alert_type enum value would need ALTER TYPE, which requires owning the type —
    // the application role does not own it (it predates this migration and was created by a different role).
    // Rather than require an out-of-band grant, triggerAlert() in vitals-ews.service.js reuses the existing
    // 'deterioration' value for an incomplete reading too, and says so in the alert message instead.

    // A clinician sets the patient's SpO2 target scale once per admission, not at every reading (per plan).
    if ((await client.query(`SELECT to_regclass('public.ip_admissions') AS r`)).rows[0].r) {
      await client.query(`ALTER TABLE ip_admissions ADD COLUMN IF NOT EXISTS spo2_target_scale SMALLINT NOT NULL DEFAULT 1`);
      await client.query(`ALTER TABLE ip_admissions DROP CONSTRAINT IF EXISTS ip_admissions_spo2_target_scale_check`);
      await client.query(`ALTER TABLE ip_admissions ADD CONSTRAINT ip_admissions_spo2_target_scale_check CHECK (spo2_target_scale IN (1,2))`);
    }

    await client.query('COMMIT');
    console.log('✅ NEWS2 vitals fields migration applied');
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
    for (const col of ['oxygen_supplemental', 'consciousness', 'spo2_scale', 'news2_complete', 'news2_provisional', 'news2_band']) {
      await client.query(`ALTER TABLE vital_records DROP COLUMN IF EXISTS ${col}`).catch(() => {});
    }
    await client.query(`ALTER TABLE ip_admissions DROP COLUMN IF EXISTS spo2_target_scale`).catch(() => {});
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (process.argv[1] && process.argv[1].includes('news2-vitals-fields.migration')) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
