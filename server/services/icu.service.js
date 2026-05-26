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

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS icu_admissions (
      id                    BIGSERIAL PRIMARY KEY,
      organization_id       BIGINT,
      admission_id          BIGINT NOT NULL,
      patient_id            BIGINT NOT NULL,
      icu_unit              TEXT,               -- MICU | SICU | NICU | PICU | CCU | general
      bed_number            TEXT,
      admitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      discharged_at         TIMESTAMPTZ,
      discharge_destination TEXT,              -- ward | stepdown | ot | expired | transferred
      admitting_reason      TEXT,
      admitting_doctor_id   TEXT,
      status                TEXT DEFAULT 'active',  -- active | discharged
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_icu_active_admission
      ON icu_admissions(admission_id) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_icu_unit ON icu_admissions(organization_id, icu_unit, status);

    CREATE TABLE IF NOT EXISTS icu_ventilator_charts (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      icu_admission_id    BIGINT NOT NULL,
      patient_id          BIGINT,
      charted_by          TEXT,
      mode                TEXT,      -- AC/VC | SIMV | PSV | CPAP | HFNC | BiPAP
      fio2_percent        SMALLINT,
      peep_cmh2o          NUMERIC(5,1),
      tidal_volume_ml     SMALLINT,
      rate_bpm            SMALLINT,
      pip_cmh2o           NUMERIC(5,1),
      plateau_cmh2o       NUMERIC(5,1),
      compliance_ml_cmh2o NUMERIC(6,2),
      spo2_percent        SMALLINT,
      etco2_mmhg          SMALLINT,
      pip_alarm_high      NUMERIC(5,1),
      peep_alarm_low      NUMERIC(5,1),
      notes               TEXT,
      charted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vent_icu_adm ON icu_ventilator_charts(icu_admission_id, charted_at DESC);

    CREATE TABLE IF NOT EXISTS icu_drip_records (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      recorded_by       TEXT,
      drug_name         TEXT NOT NULL,
      concentration     TEXT,           -- e.g. "1mg/ml", "4mcg/ml"
      rate_ml_hr        NUMERIC(8,2),
      dose_unit         TEXT,           -- mcg/kg/min | mcg/min | mg/hr | units/hr
      dose_value        NUMERIC(10,3),
      action            TEXT DEFAULT 'running',   -- started | running | titrated | stopped
      stopped_reason    TEXT,
      recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_drip_icu_adm ON icu_drip_records(icu_admission_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS icu_daily_goals (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      goal_date         DATE NOT NULL DEFAULT CURRENT_DATE,
      shift             TEXT DEFAULT 'day',   -- day | night
      set_by            TEXT,
      goals             JSONB DEFAULT '[]'::jsonb,   -- [{ category, goal, completed }]
      sedation_target   TEXT,                -- RASS score target e.g. "-1 to 0"
      pain_target       TEXT,
      glucose_target    TEXT,
      fluid_balance_ml  INTEGER,
      ventilator_wean   BOOLEAN DEFAULT FALSE,
      mobility_goal     TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_goals_icu_adm ON icu_daily_goals(icu_admission_id, goal_date DESC);

    CREATE TABLE IF NOT EXISTS icu_severity_scores (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      scored_by         TEXT,
      score_type        TEXT NOT NULL,   -- SOFA | APACHE_II | GCS | SAPS_II | NEWS2
      total_score       NUMERIC(6,2),
      components        JSONB DEFAULT '{}'::jsonb,
      interpretation    TEXT,           -- mild | moderate | severe | critical
      mortality_risk    NUMERIC(5,2),   -- percent
      scored_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scores_icu_adm ON icu_severity_scores(icu_admission_id, scored_at DESC);

    CREATE TABLE IF NOT EXISTS icu_events (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      event_type        TEXT NOT NULL,   -- deterioration | cardiac_arrest | code_blue | extubation | reintubation | complication | family_meeting | other
      severity          TEXT DEFAULT 'moderate',  -- mild | moderate | severe | critical
      description       TEXT NOT NULL,
      action_taken      TEXT,
      reported_by       TEXT,
      event_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_events_icu_adm ON icu_events(icu_admission_id, event_at DESC);
  `);
}
ensureTables().catch(e => console.warn('[icu] table init:', e.message));

// ── ICU admission ─────────────────────────────────────────────────────────────

export async function admitToICU({ organizationId, admissionId, patientId, icuUnit, bedNumber, admittingReason, admittingDoctorId }) {
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
  await sequelize.query(
    `UPDATE icu_admissions SET status = 'discharged', discharged_at = NOW(), discharge_destination = :dest, updated_at = NOW() WHERE id = :id`,
    { replacements: { id: icuAdmissionId, dest: dischargeDestination || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function getActiveICUAdmission(admissionId) {
  const [row] = await sequelize.query(
    `SELECT ia.*, p.first_name || ' ' || p.last_name as patient_name
     FROM icu_admissions ia LEFT JOIN patients p ON p.id = ia.patient_id
     WHERE ia.admission_id = :admId AND ia.status = 'active' LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function getICUCensus(organizationId, icuUnit) {
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
  return sequelize.query(
    `SELECT * FROM icu_ventilator_charts WHERE icu_admission_id = :id ORDER BY charted_at DESC LIMIT :limit`,
    { replacements: { id: icuAdmissionId, limit }, type: QueryTypes.SELECT }
  );
}

// ── Drip records ──────────────────────────────────────────────────────────────

export async function recordDrip({ organizationId, icuAdmissionId, patientId, recordedBy, drugName, concentration, rateMlHr, doseUnit, doseValue, action, stoppedReason }) {
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
  return sequelize.query(
    `SELECT DISTINCT ON (drug_name) * FROM icu_drip_records
     WHERE icu_admission_id = :id AND action != 'stopped'
     ORDER BY drug_name, recorded_at DESC`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  );
}

// ── Daily goals ───────────────────────────────────────────────────────────────

export async function setDailyGoals({ organizationId, icuAdmissionId, patientId, goalDate, shift, setBy, goals, sedationTarget, painTarget, glucoseTarget, fluidBalanceMl, ventilatorWean, mobilityGoal, notes }) {
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
  const [row] = await sequelize.query(
    `SELECT * FROM icu_daily_goals WHERE icu_admission_id = :id ORDER BY goal_date DESC, created_at DESC LIMIT 1`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

// ── Severity scoring ──────────────────────────────────────────────────────────

export async function recordSeverityScore({ organizationId, icuAdmissionId, patientId, scoredBy, scoreType, totalScore, components, interpretation, mortalityRisk }) {
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
  return sequelize.query(
    `SELECT * FROM icu_events WHERE icu_admission_id = :id ORDER BY event_at DESC`,
    { replacements: { id: icuAdmissionId }, type: QueryTypes.SELECT }
  );
}

// ── ICU patient summary ───────────────────────────────────────────────────────

export async function getICUSummary(icuAdmissionId) {
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
