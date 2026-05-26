/**
 * Follow-up & Recovery Monitoring Service — Phase 5
 *
 * Schedules follow-up appointments after discharge, tracks
 * patient recovery check-ins (symptom logs), raises remote
 * monitoring alerts, collects patient feedback / PROMS,
 * and records clinical outcome measurements.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS follow_up_plans (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      scheduled_by      TEXT,
      follow_up_date    DATE NOT NULL,
      follow_up_time    TIME,
      department        TEXT,
      doctor_id         TEXT,
      visit_type        TEXT DEFAULT 'outpatient',  -- outpatient | telemedicine | home_visit
      reason            TEXT,
      instructions      TEXT,
      reminder_sent     BOOLEAN DEFAULT FALSE,
      status            TEXT DEFAULT 'scheduled',   -- scheduled | completed | missed | rescheduled | cancelled
      appointment_id    BIGINT,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_followup_patient ON follow_up_plans(patient_id);
    CREATE INDEX IF NOT EXISTS idx_followup_date    ON follow_up_plans(follow_up_date, status);

    CREATE TABLE IF NOT EXISTS recovery_checkins (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      follow_up_plan_id BIGINT,
      checkin_method    TEXT DEFAULT 'app',   -- app | call | whatsapp | portal
      pain_score        SMALLINT,             -- 0-10
      wound_status      TEXT,                 -- healing | infection_signs | reopened | healed
      fever             BOOLEAN,
      bleeding          BOOLEAN,
      mobility          TEXT,
      medication_adherence BOOLEAN,
      symptoms          JSONB DEFAULT '[]'::jsonb,   -- [{ symptom, severity }]
      notes             TEXT,
      flagged_for_review BOOLEAN DEFAULT FALSE,
      reviewed_by       TEXT,
      reviewed_at       TIMESTAMPTZ,
      checkin_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_recovery_patient ON recovery_checkins(patient_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_flagged ON recovery_checkins(flagged_for_review, checkin_at);

    CREATE TABLE IF NOT EXISTS remote_monitoring_alerts (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      checkin_id        BIGINT,
      alert_type        TEXT NOT NULL,  -- pain_spike | wound_infection | fever | non_adherence | missed_followup | other
      severity          TEXT DEFAULT 'medium',  -- low | medium | high | critical
      title             TEXT NOT NULL,
      description       TEXT,
      triggered_by      TEXT DEFAULT 'system',
      acknowledged      BOOLEAN DEFAULT FALSE,
      acknowledged_by   TEXT,
      acknowledged_at   TIMESTAMPTZ,
      resolved          BOOLEAN DEFAULT FALSE,
      resolved_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rma_patient    ON remote_monitoring_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_rma_unresolved ON remote_monitoring_alerts(resolved, severity, created_at DESC);

    CREATE TABLE IF NOT EXISTS patient_feedback (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      overall_rating    SMALLINT,         -- 1-5
      doctor_rating     SMALLINT,
      nursing_rating    SMALLINT,
      cleanliness_rating SMALLINT,
      food_rating       SMALLINT,
      recommend_score   SMALLINT,         -- NPS 0-10
      positive_feedback TEXT,
      improvement_areas TEXT,
      follow_up_care_rating SMALLINT,
      feedback_channel  TEXT DEFAULT 'app',
      submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_patient ON patient_feedback(patient_id);

    CREATE TABLE IF NOT EXISTS outcome_records (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      recorded_by       TEXT,
      outcome_date      DATE NOT NULL DEFAULT CURRENT_DATE,
      primary_outcome   TEXT NOT NULL,  -- recovered | improved | unchanged | deteriorated | readmitted | expired
      readmission       BOOLEAN DEFAULT FALSE,
      readmission_date  DATE,
      readmission_reason TEXT,
      complication_flag  BOOLEAN DEFAULT FALSE,
      complications      TEXT,
      wound_healing     TEXT,           -- excellent | good | delayed | poor
      functional_status TEXT,           -- fully_restored | partial | dependent
      proms_score       NUMERIC(5,2),
      proms_tool        TEXT,
      outcome_notes     TEXT,
      outcome_data      JSONB DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_outcomes_patient ON outcome_records(patient_id);
    CREATE INDEX IF NOT EXISTS idx_outcomes_org     ON outcome_records(organization_id, outcome_date);
  `);
}
ensureTables().catch(e => console.warn('[follow-up-hmis] table init:', e.message));

// ── Follow-up scheduling ──────────────────────────────────────────────────────

export async function scheduleFollowUp({
  organizationId, patientId, admissionId, scheduledBy, followUpDate,
  followUpTime, department, doctorId, visitType, reason, instructions, notes
}) {
  const [result] = await sequelize.query(
    `INSERT INTO follow_up_plans (
       organization_id, patient_id, admission_id, scheduled_by,
       follow_up_date, follow_up_time, department, doctor_id,
       visit_type, reason, instructions, notes
     ) VALUES (
       :orgId, :patientId, :admId, :by,
       :date, :time, :dept, :doctorId,
       :type, :reason, :instructions, :notes
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null, by: scheduledBy || null,
        date: followUpDate, time: followUpTime || null, dept: department || null, doctorId: doctorId || null,
        type: visitType || 'outpatient', reason: reason || null, instructions: instructions || null,
        notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getFollowUpsByPatient(patientId) {
  return sequelize.query(
    `SELECT * FROM follow_up_plans WHERE patient_id = :patientId ORDER BY follow_up_date ASC`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}

export async function updateFollowUpStatus(planId, { status, notes }) {
  await sequelize.query(
    `UPDATE follow_up_plans SET status = :status, notes = COALESCE(:notes, notes), updated_at = NOW() WHERE id = :id`,
    { replacements: { id: planId, status, notes: notes || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

// ── Recovery check-ins ────────────────────────────────────────────────────────

export async function recordRecoveryCheckin({
  organizationId, patientId, admissionId, followUpPlanId, checkinMethod,
  painScore, woundStatus, fever, bleeding, mobility, medicationAdherence,
  symptoms, notes
}) {
  const flagged = (painScore && painScore >= 7) || fever || bleeding ||
    woundStatus === 'infection_signs' || woundStatus === 'reopened' ||
    medicationAdherence === false;

  const [result] = await sequelize.query(
    `INSERT INTO recovery_checkins (
       organization_id, patient_id, admission_id, follow_up_plan_id, checkin_method,
       pain_score, wound_status, fever, bleeding, mobility, medication_adherence,
       symptoms, notes, flagged_for_review
     ) VALUES (
       :orgId, :patientId, :admId, :planId, :method,
       :pain, :wound, :fever, :bleeding, :mobility, :adherence,
       :symptoms::jsonb, :notes, :flagged
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        planId: followUpPlanId || null, method: checkinMethod || 'app',
        pain: painScore ?? null, wound: woundStatus || null,
        fever: fever ?? null, bleeding: bleeding ?? null, mobility: mobility || null,
        adherence: medicationAdherence ?? null,
        symptoms: JSON.stringify(symptoms || []), notes: notes || null, flagged
      },
      type: QueryTypes.INSERT
    }
  );

  const checkin = result[0];

  if (flagged && checkin) {
    await raiseMonitoringAlert({
      organizationId, patientId, admissionId, checkinId: checkin.id,
      alertType: painScore >= 7 ? 'pain_spike' : fever ? 'fever' : bleeding ? 'wound_infection' : 'other',
      severity: painScore >= 9 || bleeding ? 'high' : 'medium',
      title: 'Recovery check-in requires review',
      description: `Flagged from check-in: pain=${painScore}, fever=${fever}, bleeding=${bleeding}, wound=${woundStatus}`
    });
  }

  return checkin;
}

export async function getCheckinsByPatient(patientId, { limit = 20 } = {}) {
  return sequelize.query(
    `SELECT * FROM recovery_checkins WHERE patient_id = :patientId ORDER BY checkin_at DESC LIMIT :limit`,
    { replacements: { patientId, limit }, type: QueryTypes.SELECT }
  );
}

// ── Remote monitoring alerts ──────────────────────────────────────────────────

export async function raiseMonitoringAlert({
  organizationId, patientId, admissionId, checkinId,
  alertType, severity, title, description, triggeredBy
}) {
  const [result] = await sequelize.query(
    `INSERT INTO remote_monitoring_alerts (
       organization_id, patient_id, admission_id, checkin_id,
       alert_type, severity, title, description, triggered_by
     ) VALUES (
       :orgId, :patientId, :admId, :checkinId,
       :type, :severity, :title, :desc, :by
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        checkinId: checkinId || null, type: alertType, severity: severity || 'medium',
        title, desc: description || null, by: triggeredBy || 'system'
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getActiveAlerts(organizationId, { patientId, severity } = {}) {
  let where = 'resolved = FALSE AND organization_id = :orgId';
  const replacements = { orgId: organizationId };
  if (patientId) { where += ' AND patient_id = :patientId'; replacements.patientId = patientId; }
  if (severity)  { where += ' AND severity = :severity';  replacements.severity = severity; }

  return sequelize.query(
    `SELECT rma.*, p.first_name || ' ' || p.last_name as patient_name
     FROM remote_monitoring_alerts rma
     LEFT JOIN patients p ON p.id = rma.patient_id
     WHERE ${where}
     ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function acknowledgeAlert(alertId, { acknowledgedBy }) {
  await sequelize.query(
    `UPDATE remote_monitoring_alerts SET acknowledged = TRUE, acknowledged_by = :by, acknowledged_at = NOW() WHERE id = :id`,
    { replacements: { id: alertId, by: acknowledgedBy || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function resolveAlert(alertId) {
  await sequelize.query(
    `UPDATE remote_monitoring_alerts SET resolved = TRUE, resolved_at = NOW() WHERE id = :id`,
    { replacements: { id: alertId }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

// ── Patient feedback ──────────────────────────────────────────────────────────

export async function submitPatientFeedback({
  organizationId, patientId, admissionId, overallRating, doctorRating,
  nursingRating, cleanlinessRating, foodRating, recommendScore,
  positiveFeedback, improvementAreas, followUpCareRating, feedbackChannel
}) {
  const [result] = await sequelize.query(
    `INSERT INTO patient_feedback (
       organization_id, patient_id, admission_id, overall_rating, doctor_rating,
       nursing_rating, cleanliness_rating, food_rating, recommend_score,
       positive_feedback, improvement_areas, follow_up_care_rating, feedback_channel
     ) VALUES (
       :orgId, :patientId, :admId, :overall, :doctor,
       :nursing, :cleanliness, :food, :nps,
       :positive, :improvement, :fuRating, :channel
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        overall: overallRating || null, doctor: doctorRating || null,
        nursing: nursingRating || null, cleanliness: cleanlinessRating || null,
        food: foodRating || null, nps: recommendScore || null,
        positive: positiveFeedback || null, improvement: improvementAreas || null,
        fuRating: followUpCareRating || null, channel: feedbackChannel || 'app'
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

// ── Clinical outcomes ─────────────────────────────────────────────────────────

export async function recordOutcome({
  organizationId, patientId, admissionId, recordedBy, outcomeDate,
  primaryOutcome, readmission, readmissionDate, readmissionReason,
  complicationFlag, complications, woundHealing, functionalStatus,
  promsScore, promsTool, outcomeNotes, outcomeData
}) {
  const [result] = await sequelize.query(
    `INSERT INTO outcome_records (
       organization_id, patient_id, admission_id, recorded_by, outcome_date,
       primary_outcome, readmission, readmission_date, readmission_reason,
       complication_flag, complications, wound_healing, functional_status,
       proms_score, proms_tool, outcome_notes, outcome_data
     ) VALUES (
       :orgId, :patientId, :admId, :by, :date,
       :outcome, :readmit, :readmitDate, :readmitReason,
       :compFlag, :complications, :wound, :functional,
       :proms, :promsTool, :notes, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, patientId, admId: admissionId || null,
        by: recordedBy || null, date: outcomeDate || new Date(),
        outcome: primaryOutcome, readmit: readmission ?? false,
        readmitDate: readmissionDate || null, readmitReason: readmissionReason || null,
        compFlag: complicationFlag ?? false, complications: complications || null,
        wound: woundHealing || null, functional: functionalStatus || null,
        proms: promsScore || null, promsTool: promsTool || null,
        notes: outcomeNotes || null, data: JSON.stringify(outcomeData || {})
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getOutcomesByPatient(patientId) {
  return sequelize.query(
    `SELECT * FROM outcome_records WHERE patient_id = :patientId ORDER BY outcome_date DESC`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
}
