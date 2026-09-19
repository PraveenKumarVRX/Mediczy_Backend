/**
 * Chemotherapy Module Service
 * ==============================
 * Structured data capture for chemo cycles: regimen reference (a label,
 * not a dosing lookup), BSA via the standard Mosteller formula, pre-cycle
 * safety checklist, infusion monitoring, extravasation flagging, and
 * CTCAE toxicity grading on the NCI's own published scale. See
 * migrations/chemotherapy-module.migration.js for the fuller rationale on
 * why BSA and CTCAE grading are treated as safe to compute/capture here.
 */

import pool from '../db/pgPool.js';
import careSeries from './care-series.service.js';

/** Mosteller formula — the standard BSA calculation used across clinical practice. */
export function calculateBsaM2(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  return Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 1000) / 1000;
}

const DEFAULT_EXTRAVASATION_ACTION = 'Infusion stopped; line not flushed; institutional protocol followed.';

/** undefined (field not supplied) -> null, so SQL COALESCE keeps the stored value. */
const opt = (v) => (v === undefined ? null : v);

class ChemotherapyService {
  /**
   * Upsert of the cycle form. Only fields the caller actually supplied are
   * written; an omitted field (undefined) is bound as NULL and the conflict
   * branch keeps the stored value via COALESCE. Two safety rules:
   *   - extravasation_occurred is sticky: this general save can raise it but
   *     never clear it (only a deliberate correction path outside this
   *     method may). The recorded action is never nulled out.
   *   - BSA is recomputed only when both height and weight are known (from
   *     the supplied values or the stored ones); otherwise it is left alone.
   * Ownership of the session is verified BEFORE the upsert.
   */
  async recordCycleDetail(sessionId, fields, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const {
      regimenReference, heightCm, weightKg,
      labsCurrent, labsReviewedAt, premedicationGiven, premedicationNotes,
      infusionStartedAt, infusionCompletedAt,
      extravasationOccurred, extravasationActionTaken,
      toxicityCategory, ctcaeToxicityGrade, complications, recordedBy,
    } = fields || {};

    // Only meaningful on first insert (no stored row to merge with); the
    // conflict branch recomputes in SQL from merged height/weight.
    const bsaM2 = calculateBsaM2(heightCm, weightKg);

    const { rows } = await pool.query(
      `INSERT INTO chemo_cycle_detail AS t (
         session_id, regimen_reference, height_cm, weight_kg, bsa_m2,
         labs_current, labs_reviewed_at, premedication_given, premedication_notes,
         infusion_started_at, infusion_completed_at,
         extravasation_occurred, extravasation_action_taken,
         toxicity_category, ctcae_toxicity_grade, complications, recorded_by
       ) VALUES ($1,$2,$3,$4,$5,
                 COALESCE($6::boolean,false),$7,COALESCE($8::boolean,false),$9,
                 $10,$11,
                 COALESCE($12::boolean,false),$13,
                 $14,$15,$16,$17)
       ON CONFLICT (session_id) DO UPDATE SET
         regimen_reference = COALESCE($2, t.regimen_reference),
         height_cm = COALESCE($3, t.height_cm),
         weight_kg = COALESCE($4, t.weight_kg),
         bsa_m2 = CASE
                    WHEN COALESCE($3::numeric, t.height_cm) IS NOT NULL AND COALESCE($4::numeric, t.weight_kg) IS NOT NULL
                     AND COALESCE($3::numeric, t.height_cm) > 0 AND COALESCE($4::numeric, t.weight_kg) > 0
                    THEN ROUND(SQRT((COALESCE($3::numeric, t.height_cm) * COALESCE($4::numeric, t.weight_kg)) / 3600.0), 3)
                    ELSE t.bsa_m2
                  END,
         labs_current = COALESCE($6::boolean, t.labs_current),
         labs_reviewed_at = COALESCE($7, t.labs_reviewed_at),
         premedication_given = COALESCE($8::boolean, t.premedication_given),
         premedication_notes = COALESCE($9, t.premedication_notes),
         infusion_started_at = COALESCE($10, t.infusion_started_at),
         infusion_completed_at = COALESCE($11, t.infusion_completed_at),
         extravasation_occurred = t.extravasation_occurred OR COALESCE($12::boolean, false),
         extravasation_action_taken = COALESCE($13, t.extravasation_action_taken),
         toxicity_category = COALESCE($14, t.toxicity_category),
         ctcae_toxicity_grade = COALESCE($15, t.ctcae_toxicity_grade),
         complications = COALESCE($16, t.complications),
         updated_at = NOW()
       RETURNING t.*`,
      [sessionId, opt(regimenReference), opt(heightCm), opt(weightKg), bsaM2,
       opt(labsCurrent), opt(labsReviewedAt), opt(premedicationGiven), opt(premedicationNotes),
       opt(infusionStartedAt), opt(infusionCompletedAt),
       opt(extravasationOccurred), opt(extravasationActionTaken),
       opt(toxicityCategory), opt(ctcaeToxicityGrade), opt(complications), recordedBy]
    );
    return rows[0];
  }

  /**
   * Quick extravasation action — separate from the general update so the
   * UI can offer a single urgent button during an active infusion without
   * requiring the full cycle form to be filled first. Re-pressing without an
   * actionTaken keeps the previously recorded action.
   */
  async flagExtravasation(sessionId, { actionTaken, recordedBy } = {}, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const { rows } = await pool.query(
      `INSERT INTO chemo_cycle_detail AS t (session_id, extravasation_occurred, extravasation_action_taken, recorded_by)
       VALUES ($1, true, COALESCE($2::text, $4::text), $3)
       ON CONFLICT (session_id) DO UPDATE SET
         extravasation_occurred = true,
         extravasation_action_taken = COALESCE($2::text, t.extravasation_action_taken, $4::text),
         updated_at = NOW()
       RETURNING t.*`,
      [sessionId, actionTaken || null, recordedBy, DEFAULT_EXTRAVASATION_ACTION]
    );
    return rows[0];
  }

  async addInfusionReading(sessionId, reading, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const entry = { ...reading, recordedAt: new Date().toISOString() };
    const { rows } = await pool.query(
      `UPDATE chemo_cycle_detail
       SET intra_infusion_readings = COALESCE(intra_infusion_readings, '[]'::jsonb) || $2::jsonb, updated_at = NOW()
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, JSON.stringify([entry])]
    );
    if (!rows.length) throw new Error(`No chemo_cycle_detail row for session ${sessionId} — call recordCycleDetail() first`);
    return rows[0];
  }

  async getCycleDetail(sessionId, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const { rows } = await pool.query('SELECT * FROM chemo_cycle_detail WHERE session_id = $1', [sessionId]);
    return rows[0] || null;
  }
}

export default new ChemotherapyService();
