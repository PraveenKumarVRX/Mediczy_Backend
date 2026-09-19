/**
 * Dialysis Module Service
 * ==========================
 * Structured data capture for dialysis sessions (vascular access, UF/
 * dialysate parameters, vitals), a session-scoped medication
 * administration record, and chair/recurring-schedule management.
 *
 * This service records what a clinician observed or did. It does not
 * compute a recommended UF rate, does not suggest a heparin dose, and
 * carries no red-flag/threshold logic — that content lives in the
 * Clinical Knowledge Fabric (clinical-knowledge-fabric.service.js) and
 * only reaches a clinical workflow after medical-director approval. See
 * migrations/dialysis-module.migration.js for the fuller rationale.
 */

import pool from '../db/pgPool.js';
import careSeries, { NotFoundError, BadRequestError, requireOrgId } from './care-series.service.js';

/** undefined (field not supplied) -> null, so SQL COALESCE keeps the stored value. */
const opt = (v) => (v === undefined ? null : v);

class DialysisService {
  // ── Session detail (vascular access, UF, dialysate, vitals) ────────────────
  /**
   * Upsert of the session flowsheet. Only fields the caller supplied are
   * written; omitted fields (undefined -> NULL) keep their stored value on
   * conflict via COALESCE. intra_session_readings is never touched here (it
   * is append-only via addIntraSessionReading). Session ownership is verified
   * BEFORE the upsert.
   */
  async recordSessionDetail(sessionId, fields, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const {
      vascularAccessType, vascularAccessSite, accessSiteCondition,
      preSessionWeightKg, postSessionWeightKg,
      targetUfVolumeMl, actualUfVolumeMl, ufRateMlPerHr,
      bloodFlowRateMlMin, dialysateFlowRateMlMin,
      dialysateSodiumMmol, dialysatePotassiumMmol, dialysateCalciumMmol, dialysateTemperatureC,
      preSessionBpSystolic, preSessionBpDiastolic, postSessionBpSystolic, postSessionBpDiastolic,
      complications, recordedBy,
    } = fields || {};

    const { rows } = await pool.query(
      `INSERT INTO dialysis_session_detail (
         session_id, vascular_access_type, vascular_access_site, access_site_condition,
         pre_session_weight_kg, post_session_weight_kg,
         target_uf_volume_ml, actual_uf_volume_ml, uf_rate_ml_per_hr,
         blood_flow_rate_ml_min, dialysate_flow_rate_ml_min,
         dialysate_sodium_mmol, dialysate_potassium_mmol, dialysate_calcium_mmol, dialysate_temperature_c,
         pre_session_bp_systolic, pre_session_bp_diastolic, post_session_bp_systolic, post_session_bp_diastolic,
         complications, recorded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (session_id) DO UPDATE SET
         vascular_access_type = COALESCE(EXCLUDED.vascular_access_type, dialysis_session_detail.vascular_access_type),
         vascular_access_site = COALESCE(EXCLUDED.vascular_access_site, dialysis_session_detail.vascular_access_site),
         access_site_condition = COALESCE(EXCLUDED.access_site_condition, dialysis_session_detail.access_site_condition),
         pre_session_weight_kg = COALESCE(EXCLUDED.pre_session_weight_kg, dialysis_session_detail.pre_session_weight_kg),
         post_session_weight_kg = COALESCE(EXCLUDED.post_session_weight_kg, dialysis_session_detail.post_session_weight_kg),
         target_uf_volume_ml = COALESCE(EXCLUDED.target_uf_volume_ml, dialysis_session_detail.target_uf_volume_ml),
         actual_uf_volume_ml = COALESCE(EXCLUDED.actual_uf_volume_ml, dialysis_session_detail.actual_uf_volume_ml),
         uf_rate_ml_per_hr = COALESCE(EXCLUDED.uf_rate_ml_per_hr, dialysis_session_detail.uf_rate_ml_per_hr),
         blood_flow_rate_ml_min = COALESCE(EXCLUDED.blood_flow_rate_ml_min, dialysis_session_detail.blood_flow_rate_ml_min),
         dialysate_flow_rate_ml_min = COALESCE(EXCLUDED.dialysate_flow_rate_ml_min, dialysis_session_detail.dialysate_flow_rate_ml_min),
         dialysate_sodium_mmol = COALESCE(EXCLUDED.dialysate_sodium_mmol, dialysis_session_detail.dialysate_sodium_mmol),
         dialysate_potassium_mmol = COALESCE(EXCLUDED.dialysate_potassium_mmol, dialysis_session_detail.dialysate_potassium_mmol),
         dialysate_calcium_mmol = COALESCE(EXCLUDED.dialysate_calcium_mmol, dialysis_session_detail.dialysate_calcium_mmol),
         dialysate_temperature_c = COALESCE(EXCLUDED.dialysate_temperature_c, dialysis_session_detail.dialysate_temperature_c),
         pre_session_bp_systolic = COALESCE(EXCLUDED.pre_session_bp_systolic, dialysis_session_detail.pre_session_bp_systolic),
         pre_session_bp_diastolic = COALESCE(EXCLUDED.pre_session_bp_diastolic, dialysis_session_detail.pre_session_bp_diastolic),
         post_session_bp_systolic = COALESCE(EXCLUDED.post_session_bp_systolic, dialysis_session_detail.post_session_bp_systolic),
         post_session_bp_diastolic = COALESCE(EXCLUDED.post_session_bp_diastolic, dialysis_session_detail.post_session_bp_diastolic),
         complications = COALESCE(EXCLUDED.complications, dialysis_session_detail.complications),
         updated_at = NOW()
       RETURNING *`,
      [sessionId, opt(vascularAccessType), opt(vascularAccessSite), opt(accessSiteCondition),
       opt(preSessionWeightKg), opt(postSessionWeightKg),
       opt(targetUfVolumeMl), opt(actualUfVolumeMl), opt(ufRateMlPerHr),
       opt(bloodFlowRateMlMin), opt(dialysateFlowRateMlMin),
       opt(dialysateSodiumMmol), opt(dialysatePotassiumMmol), opt(dialysateCalciumMmol), opt(dialysateTemperatureC),
       opt(preSessionBpSystolic), opt(preSessionBpDiastolic), opt(postSessionBpSystolic), opt(postSessionBpDiastolic),
       opt(complications), recordedBy]
    );
    return rows[0];
  }

  /** Appends one intra-session reading (e.g. hourly BP/HR check) to the JSONB log. */
  async addIntraSessionReading(sessionId, reading, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const entry = { ...reading, recordedAt: new Date().toISOString() };
    const { rows } = await pool.query(
      `UPDATE dialysis_session_detail
       SET intra_session_readings = COALESCE(intra_session_readings, '[]'::jsonb) || $2::jsonb, updated_at = NOW()
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, JSON.stringify([entry])]
    );
    if (!rows.length) throw new Error(`No dialysis_session_detail row for session ${sessionId} — call recordSessionDetail() first`);
    return rows[0];
  }

  async getSessionDetail(sessionId, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const { rows } = await pool.query('SELECT * FROM dialysis_session_detail WHERE session_id = $1', [sessionId]);
    return rows[0] || null;
  }

  // ── Dialysis-specific medication administration record ─────────────────────
  async recordMedicationAdministration(sessionId, { medication, dose, doseUnit, route, administeredBy, notes } = {}, organizationId) {
    if (!medication) throw new BadRequestError('medication is required');
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const { rows } = await pool.query(
      `INSERT INTO dialysis_medication_administration (session_id, medication, dose, dose_unit, route, administered_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [sessionId, medication, dose, doseUnit, route, administeredBy, notes]
    );
    return rows[0];
  }

  async listMedicationAdministrations(sessionId, organizationId) {
    await careSeries.assertSessionOwned(sessionId, organizationId);
    const { rows } = await pool.query(
      'SELECT * FROM dialysis_medication_administration WHERE session_id = $1 ORDER BY administered_at',
      [sessionId]
    );
    return rows;
  }

  // ── Chairs ───────────────────────────────────────────────────────────────
  async createChair({ organizationId, branchId, chairNumber }) {
    const org = requireOrgId(organizationId);
    if (branchId) {
      const { rows: b } = await pool.query('SELECT 1 FROM hospital_branch WHERE id = $1 AND organization_id = $2', [branchId, org]);
      if (!b.length) throw new NotFoundError('branch not found');
    }
    // Conflict target includes organization_id, so the upsert can only ever hit this org's chair.
    const { rows } = await pool.query(
      `INSERT INTO dialysis_chair (organization_id, branch_id, chair_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, chair_number) DO UPDATE
         SET branch_id = COALESCE(EXCLUDED.branch_id, dialysis_chair.branch_id), is_active = true
       RETURNING *`,
      [org, branchId || null, chairNumber]
    );
    return rows[0];
  }

  async listChairs(organizationId) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      'SELECT * FROM dialysis_chair WHERE organization_id = $1 AND is_active = true ORDER BY chair_number',
      [org]
    );
    return rows;
  }

  // ── Recurring schedule ───────────────────────────────────────────────────
  async createRecurringSchedule({ patientId, organizationId, seriesId, chairId, daysOfWeek, shift, sessionDurationMinutes, startDate, endDate }) {
    const org = requireOrgId(organizationId);
    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) throw new BadRequestError('daysOfWeek must be a non-empty array, e.g. ["mon","wed","fri"]');
    // A schedule may only link to a series and chair owned by the same organization.
    if (seriesId) await careSeries.assertSeriesOwned(seriesId, org);
    if (chairId) {
      const { rows: c } = await pool.query('SELECT 1 FROM dialysis_chair WHERE id = $1 AND organization_id = $2', [chairId, org]);
      if (!c.length) throw new NotFoundError('chair not found');
    }
    const { rows } = await pool.query(
      `INSERT INTO dialysis_recurring_schedule
         (patient_id, organization_id, series_id, chair_id, days_of_week, shift, session_duration_minutes, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,240),COALESCE($8,CURRENT_DATE),$9)
       RETURNING *`,
      [patientId, org, seriesId || null, chairId || null, daysOfWeek, shift, sessionDurationMinutes, startDate, endDate]
    );
    return rows[0];
  }

  async getActiveScheduleForPatient(patientId, organizationId) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      `SELECT * FROM dialysis_recurring_schedule WHERE patient_id = $1 AND organization_id = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [patientId, org]
    );
    return rows[0] || null;
  }

  async pauseSchedule(scheduleId, organizationId) {
    const org = requireOrgId(organizationId);
    const { rows } = await pool.query(
      `UPDATE dialysis_recurring_schedule SET status = 'paused', updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [scheduleId, org]
    );
    if (!rows.length) throw new NotFoundError('schedule not found');
    return rows[0];
  }

  /**
   * Pure scheduling logic (no clinical content): generates the next N
   * upcoming care_series_session rows matching the recurring pattern
   * (e.g. Mon/Wed/Fri), continuing from whatever session number the
   * series is already on. Idempotent-ish: relies on
   * care_series_session's (series_id, session_number) uniqueness to
   * avoid duplicate scheduling if called twice for the same window.
   */
  async generateUpcomingSessions(scheduleId, organizationId, { weeksAhead = 2 } = {}) {
    const org = requireOrgId(organizationId);
    weeksAhead = Math.min(Math.max(Number(weeksAhead) || 2, 1), 12);
    const { rows: scheduleRows } = await pool.query(
      'SELECT * FROM dialysis_recurring_schedule WHERE id = $1 AND organization_id = $2',
      [scheduleId, org]
    );
    const schedule = scheduleRows[0];
    if (!schedule) throw new NotFoundError('schedule not found');
    // The linked series must still belong to this org (defence in depth).
    if (schedule.series_id) await careSeries.assertSeriesOwned(schedule.series_id, org);
    if (!schedule.series_id) throw new Error(`Schedule ${scheduleId} has no linked care_series — cannot generate sessions`);

    const dayNameToIndex = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targetDayIndexes = new Set(schedule.days_of_week.map((d) => dayNameToIndex[d.toLowerCase()]).filter((i) => i != null));

    const { rows: lastSessionRows } = await pool.query(
      `SELECT COALESCE(MAX(s.session_number), 0) AS max_number
         FROM care_series_session s JOIN care_series c ON c.id = s.series_id
        WHERE s.series_id = $1 AND c.organization_id = $2`,
      [schedule.series_id, org]
    );
    let nextNumber = Number(lastSessionRows[0].max_number) + 1;

    const created = [];
    const today = new Date();
    for (let dayOffset = 0; dayOffset < weeksAhead * 7; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      if (!targetDayIndexes.has(date.getDay())) continue;
      if (schedule.end_date && date > new Date(schedule.end_date)) break;

      const session = await careSeries.scheduleSession({
        seriesId: schedule.series_id,
        sessionNumber: nextNumber,
        scheduledAt: date.toISOString(),
        organizationId: org,
      });
      created.push(session);
      nextNumber++;
    }
    return created;
  }
}

export default new DialysisService();
