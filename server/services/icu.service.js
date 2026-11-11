/**
 * ICU Service — Phase 2 / Scope gap
 *
 * Covers:
 *  - ICU admission (separate from ward IP admission)
 *  - Ventilator parameter charting
 *  - Vasoactive / infusion drip records
 *  - Daily ICU goals (care-team task list per shift)
 *  - Severity scoring: SOFA, APACHE II, GCS
 *  - ICU events / complications log
 *  - ICU census
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import llmProvider from './ai-brain/llm-provider.js';

import { schemaVerifier } from '../utils/schema-guard.js';
const SCHEMA_TABLES = ['icu_admissions', 'icu_ventilator_charts', 'icu_drip_records', 'icu_daily_goals', 'icu_severity_scores', 'icu_events'];

// Schema is owned by the migration, not created here. A missing table
// fails closed with SCHEMA_NOT_MIGRATED naming what to apply, instead of
// this service quietly building a table the migration never shaped.
const ensureTables = schemaVerifier({
  sequelize: sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20260526000001-create-hmis-phase3-5-tables before using ICU',
});

// ── ICU admission ─────────────────────────────────────────────────────────────

export async function admitToICU({ organizationId, admissionId, patientId, icuUnit, bedNumber, admittingReason, admittingDoctorId }) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO icu_admissions (organization_id, admission_id, patient_id, icu_unit, bed_number, admitting_reason, admitting_doctor_id)
     VALUES (:orgId, :admId, :patientId, :unit, :bed, :reason, :doctor)
     ON CONFLICT (admission_id) WHERE status = 'active' DO NOTHING
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId, patientId,
        unit: icuUnit || null, bed: bedNumber || null,
        reason: admittingReason || null, doctor: admittingDoctorId || null
      },
      type: QueryTypes.INSERT
    }
  );
  if (!result[0]) throw new Error('Patient already has an active ICU admission');
  return result[0];
}

export async function dischargeFromICU(icuAdmissionId, { dischargeDestination, dischargedBy }) {
  await ensureTables();
  await sequelize.query(
    `UPDATE icu_admissions SET status = 'discharged', discharged_at = NOW(), discharge_destination = :dest, updated_at = NOW() WHERE id = :id`,
    { replacements: { id: icuAdmissionId, dest: dischargeDestination || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function getActiveICUAdmission(admissionId) {
  await ensureTables();
  const [row] = await sequelize.query(
    `SELECT ia.*, p.first_name || ' ' || p.last_name as patient_name
     FROM icu_admissions ia LEFT JOIN patients p ON p.id = ia.patient_id
     WHERE ia.admission_id = :admId AND ia.status = 'active' LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function getICUCensus(organizationId, icuUnit) {
  await ensureTables();
  let where = `organization_id = :orgId AND status = 'active'`;
  const replacements = { orgId: organizationId };
  if (icuUnit) { where += ' AND icu_unit = :unit'; replacements.unit = icuUnit; }

  return sequelize.query(
    `SELECT ia.*, p.first_name || ' ' || p.last_name as patient_name, p.date_of_birth, p.gender
     FROM icu_admissions ia LEFT JOIN patients p ON p.id = ia.patient_id
     WHERE ${where} ORDER BY ia.admitted_at ASC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

// ── Ventilator charting ───────────────────────────────────────────────────────

export async function chartVentilator(data) {
  await ensureTables();
  const {
    organizationId, icuAdmissionId, patientId, chartedBy, mode,
    fio2Percent, peepCmh2o, tidalVolumeMl, rateBpm, pipCmh2o,
    plateauCmh2o, complianceMlCmh2o, spo2Percent, etco2Mmhg,
    pipAlarmHigh, peepAlarmLow, notes
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO icu_ventilator_charts (
       organization_id, icu_admission_id, patient_id, charted_by, mode,
       fio2_percent, peep_cmh2o, tidal_volume_ml, rate_bpm, pip_cmh2o,
       plateau_cmh2o, compliance_ml_cmh2o, spo2_percent, etco2_mmhg,
       pip_alarm_high, peep_alarm_low, notes
     ) VALUES (
       :orgId, :icuAdmId, :patientId, :by, :mode,
       :fio2, :peep, :tv, :rate, :pip,
       :plateau, :compliance, :spo2, :etco2,
       :pipHigh, :peepLow, :notes
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, icuAdmId: icuAdmissionId, patientId: patientId || null,
        by: chartedBy || null, mode: mode || null,
        fio2: fio2Percent || null, peep: peepCmh2o || null, tv: tidalVolumeMl || null,
        rate: rateBpm || null, pip: pipCmh2o || null, plateau: plateauCmh2o || null,
        compliance: complianceMlCmh2o || null, spo2: spo2Percent || null, etco2: etco2Mmhg || null,
        pipHigh: pipAlarmHigh || null, peepLow: peepAlarmLow || null, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getVentilatorCharts(icuAdmissionId, { limit = 24 } = {}) {
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM icu_ventilator_charts WHERE icu_admission_id = :id ORDER BY charted_at DESC LIMIT :limit`,
    { replacements: { id: icuAdmissionId, limit }, type: QueryTypes.SELECT }
  );
}

// ── Drip records ──────────────────────────────────────────────────────────────

export async function recordDrip({ organizationId, icuAdmissionId, patientId, recordedBy, drugName, concentration, rateMlHr, doseUnit, doseValue, action, stoppedReason }) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO icu_drip_records (organization_id, icu_admission_id, patient_id, recorded_by, drug_name, concentration, rate_ml_hr, dose_unit, dose_value, action, stopped_reason)
     VALUES (:orgId, :icuAdmId, :patientId, :by, :drug, :conc, :rate, :unit, :dose, :action, :reason)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, icuAdmId: icuAdmissionId, patientId: patientId || null,
        by: recordedBy || null, drug: drugName, conc: concentration || null,
        rate: rateMlHr || null, unit: doseUnit || null, dose: doseValue || null,
        action: action || 'running', reason: stoppedReason || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getActiveDrips(icuAdmissionId) {
  await ensureTables();
  return sequelize.query(
    `SELECT DISTINCT ON (drug_name) * FROM icu_drip_records
     WHERE icu_admission_id = :id AND action != 'stopped'
     ORDER BY drug_name, recorded_at DESC`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  );
}

// ── Daily goals ───────────────────────────────────────────────────────────────

export async function setDailyGoals({ organizationId, icuAdmissionId, patientId, goalDate, shift, setBy, goals, sedationTarget, painTarget, glucoseTarget, fluidBalanceMl, ventilatorWean, mobilityGoal, notes }) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO icu_daily_goals (organization_id, icu_admission_id, patient_id, goal_date, shift, set_by, goals, sedation_target, pain_target, glucose_target, fluid_balance_ml, ventilator_wean, mobility_goal, notes)
     VALUES (:orgId, :icuAdmId, :patientId, :date, :shift, :by, :goals::jsonb, :sedation, :pain, :glucose, :fluid, :wean, :mobility, :notes)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, icuAdmId: icuAdmissionId, patientId: patientId || null,
        date: goalDate || new Date(), shift: shift || 'day', by: setBy || null,
        goals: JSON.stringify(goals || []),
        sedation: sedationTarget || null, pain: painTarget || null,
        glucose: glucoseTarget || null, fluid: fluidBalanceMl || null,
        wean: ventilatorWean ?? false, mobility: mobilityGoal || null, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0] || null;
}

export async function getLatestGoals(icuAdmissionId) {
  await ensureTables();
  const [row] = await sequelize.query(
    `SELECT * FROM icu_daily_goals WHERE icu_admission_id = :id ORDER BY goal_date DESC, created_at DESC LIMIT 1`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

// ── Severity scoring ──────────────────────────────────────────────────────────

export async function recordSeverityScore({ organizationId, icuAdmissionId, patientId, scoredBy, scoreType, totalScore, components, interpretation, mortalityRisk }) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO icu_severity_scores (organization_id, icu_admission_id, patient_id, scored_by, score_type, total_score, components, interpretation, mortality_risk)
     VALUES (:orgId, :icuAdmId, :patientId, :by, :type, :score, :components::jsonb, :interp, :mortality)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, icuAdmId: icuAdmissionId, patientId: patientId || null,
        by: scoredBy || null, type: scoreType, score: totalScore,
        components: JSON.stringify(components || {}), interp: interpretation || null,
        mortality: mortalityRisk || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getScoreHistory(icuAdmissionId, scoreType) {
  await ensureTables();
  let where = 'icu_admission_id = :id';
  const replacements = { id: icuAdmissionId };
  if (scoreType) { where += ' AND score_type = :type'; replacements.type = scoreType; }

  return sequelize.query(
    `SELECT * FROM icu_severity_scores WHERE ${where} ORDER BY scored_at DESC LIMIT 50`,
    { replacements, type: QueryTypes.SELECT }
  );
}

// ── ICU events ────────────────────────────────────────────────────────────────

export async function logICUEvent({ organizationId, icuAdmissionId, patientId, eventType, severity, description, actionTaken, reportedBy, eventAt }) {
  await ensureTables();
  const [result] = await sequelize.query(
    `INSERT INTO icu_events (organization_id, icu_admission_id, patient_id, event_type, severity, description, action_taken, reported_by, event_at)
     VALUES (:orgId, :icuAdmId, :patientId, :type, :severity, :desc, :action, :by, :at)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, icuAdmId: icuAdmissionId, patientId: patientId || null,
        type: eventType, severity: severity || 'moderate', desc: description,
        action: actionTaken || null, by: reportedBy || null, at: eventAt || new Date()
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getICUEvents(icuAdmissionId) {
  await ensureTables();
  return sequelize.query(
    `SELECT * FROM icu_events WHERE icu_admission_id = :id ORDER BY event_at DESC`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  );
}

// ── ICU patient summary ───────────────────────────────────────────────────────

export async function getICUSummary(icuAdmissionId) {
  await ensureTables();
  const [admission] = await sequelize.query(
    `SELECT ia.*, p.first_name || ' ' || p.last_name as patient_name
     FROM icu_admissions ia LEFT JOIN patients p ON p.id = ia.patient_id
     WHERE ia.id = :id LIMIT 1`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  ).catch(() => [null]);

  const [latestVent] = await getVentilatorCharts(icuAdmissionId, { limit: 1 });
  const activeDrips  = await getActiveDrips(icuAdmissionId);
  const latestGoals  = await getLatestGoals(icuAdmissionId);
  const recentScores = await getScoreHistory(icuAdmissionId, null);
  const recentEvents = await getICUEvents(icuAdmissionId).then(e => e.slice(0, 5));

  return {
    admission: admission || null,
    latestVentilator: latestVent || null,
    activeDrips,
    dailyGoals: latestGoals,
    recentScores: recentScores.slice(0, 5),
    recentEvents
  };
}

/**
 * Draft a SOAP-format ICU progress note from live ventilator/drips/goals/
 * scores/events data. Returned for physician review/edit — the caller
 * submits the (possibly edited) text via createClinicalNote with
 * noteType: 'icu_progress_note', isAiGenerated: true. Documentation with
 * mandatory physician sign-off before it becomes a clinical note, so this
 * is NOT SaMD per CLAUDE.md's classification table — same as the
 * discharge-summary and referral-letter drafters.
 */
export async function generateICUProgressNoteDraft(icuAdmissionId) {
  await ensureTables();
  const summary = await getICUSummary(icuAdmissionId);
  const fallback = {
    subjective: 'ICU patient — see charted vitals, drips, and goals for this shift.',
    objective: JSON.stringify({ ventilator: summary.latestVentilator, drips: summary.activeDrips, scores: summary.recentScores }),
    assessment: 'Assessment pending physician review.',
    plan: (summary.dailyGoals?.goals || []).join('; ') || 'Continue current management, reassess at next round.',
  };
  if (!summary.admission) return { ...fallback, aiGenerated: false, model: null };

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `You are drafting a SOAP-format ICU progress note for physician review — this is a DRAFT, not a final clinical document. Use the provided ventilator settings, active drips, daily goals, severity scores, and recent events. Do not invent facts not present in the data. Output JSON: {"subjective":"","objective":"","assessment":"","plan":""}`,
        },
        {
          role: 'user',
          content: `Patient: ${summary.admission.patient_name || 'Unknown'}\nICU admission: ${JSON.stringify(summary.admission)}\nLatest ventilator: ${JSON.stringify(summary.latestVentilator)}\nActive drips: ${JSON.stringify(summary.activeDrips)}\nDaily goals: ${JSON.stringify(summary.dailyGoals)}\nRecent severity scores: ${JSON.stringify(summary.recentScores)}\nRecent events: ${JSON.stringify(summary.recentEvents)}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 700,
      responseFormat: { type: 'json_object' },
      skipCache: true,
    });
    const parsed = JSON.parse(llm.content || '{}');
    if (!parsed.subjective && !parsed.assessment) throw new Error('empty/malformed LLM response');
    return { ...fallback, ...parsed, aiGenerated: true, model: llm.model || llm.provider || 'llm' };
  } catch (err) {
    console.warn('[icu.service] LLM progress-note draft failed, falling back to template:', err.message);
    return { ...fallback, aiGenerated: false, model: null };
  }
}
