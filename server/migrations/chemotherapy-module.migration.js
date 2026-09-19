/**
 * Migration: Chemotherapy Module — regimen reference, BSA, pre-cycle safety
 * checklist, infusion monitoring, extravasation flagging, CTCAE toxicity grading
 * =========================================================================
 * Same design principle as dialysis-module.migration.js: structured DATA
 * CAPTURE, not clinical decision content. Two exceptions worth naming
 * explicitly, since they involve more than a bare text field:
 *
 *   1. BSA (body surface area) is computed via the Mosteller formula
 *      (BSA = sqrt(height_cm * weight_kg / 3600)) — a universal,
 *      uncontested arithmetic formula used in every clinical calculator,
 *      not a dosing recommendation. It converts two measurements into a
 *      third; it does not suggest a dose.
 *   2. CTCAE toxicity grade (0-5) uses the NCI's own official published
 *      category labels (Grade 1 Mild ... Grade 5 Death) — the same
 *      externally-standardized-scale pattern already used elsewhere in
 *      this codebase for ESI triage levels (hospital-queue.service.js).
 *      This captures a clinician's own graded judgment on the official
 *      scale; it does not define what qualifies as each grade for a
 *      specific toxicity — that's the clinician's call, same as ESI.
 *
 * No regimen/dosing protocol library is included — regimenReference is a
 * free-text label (e.g. "R-CHOP") for identification only, never a
 * dose-computing lookup. Per the design doc's build-vs-integrate
 * recommendation, an actual regimen/protocol library is out of scope here.
 *
 * Safe to run multiple times (IF NOT EXISTS). Depends on care_series
 * already existing (care-series.migration.js).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS chemo_cycle_detail (
        id                        SERIAL PRIMARY KEY,
        session_id                INTEGER NOT NULL UNIQUE REFERENCES care_series_session(id),
        regimen_reference         TEXT,
        height_cm                 NUMERIC(5,2),
        weight_kg                 NUMERIC(6,2),
        bsa_m2                    NUMERIC(5,3),
        labs_current              BOOLEAN NOT NULL DEFAULT false,
        labs_reviewed_at          TIMESTAMPTZ,
        premedication_given       BOOLEAN NOT NULL DEFAULT false,
        premedication_notes       TEXT,
        infusion_started_at       TIMESTAMPTZ,
        infusion_completed_at     TIMESTAMPTZ,
        intra_infusion_readings   JSONB DEFAULT '[]'::jsonb,
        extravasation_occurred    BOOLEAN NOT NULL DEFAULT false,
        extravasation_action_taken TEXT,
        toxicity_category         TEXT,
        ctcae_toxicity_grade      INTEGER CHECK (ctcae_toxicity_grade BETWEEN 0 AND 5),
        complications             TEXT,
        recorded_by               TEXT,
        recorded_at               TIMESTAMPTZ DEFAULT NOW(),
        updated_at                TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ chemo_cycle_detail: created');

    await client.query('COMMIT');
    console.log('✅ Chemotherapy module migration complete');
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
    await client.query('DROP TABLE IF EXISTS chemo_cycle_detail');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('chemotherapy-module')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
