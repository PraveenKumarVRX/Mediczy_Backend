/**
 * Vitals & Early Warning Score Service
 *
 * Implements NEWS2 (National Early Warning Score 2) computation
 * and triggers deterioration alerts when thresholds are breached.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

// ── NEWS2 Scoring Tables ──────────────────────────────────────────────────────

function scoreRespRate(rr) {
  if (rr == null) return 0;
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

function scoreSpo2(spo2, onOxygen = false) {
  if (spo2 == null) return 0;
  if (onOxygen) {
    if (spo2 >= 97) return 3;
    if (spo2 >= 95) return 2;
    if (spo2 >= 93) return 1;
    return 0;
  }
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}

function scoreBpSystolic(sbp) {
  if (sbp == null) return 0;
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}

function scorePulse(pulse) {
  if (pulse == null) return 0;
  if (pulse <= 40) return 3;
  if (pulse <= 50) return 1;
  if (pulse <= 90) return 0;
  if (pulse <= 110) return 1;
  if (pulse <= 130) return 2;
  return 3;
}

function scoreTemperature(temp) {
  if (temp == null) return 0;
  if (temp <= 35.0) return 3;
  if (temp <= 36.0) return 1;
  if (temp <= 38.0) return 0;
  if (temp <= 39.0) return 1;
  return 2;
}

function scoreGcs(gcs) {
  if (gcs == null) return 0;
  return gcs < 15 ? 3 : 0;
}

export function computeNEWS2(vital) {
  const score =
    scoreRespRate(vital.respiratory_rate) +
    scoreSpo2(vital.spo2) +
    scoreBpSystolic(vital.bp_systolic) +
    scorePulse(vital.pulse) +
    scoreTemperature(vital.temperature) +
    scoreGcs(vital.gcs_score);
  return score;
}

function news2Severity(score) {
  if (score >= 7) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  if (score >= 1) return 'low';
  return null;
}

function shockIndex(pulse, sbp) {
  if (!pulse || !sbp || sbp === 0) return null;
  return parseFloat((pulse / sbp).toFixed(2));
}

// ── Core Operations ───────────────────────────────────────────────────────────

export async function saveVitals({
  organizationId,
  admissionId,
  patientId,
  recordedBy,
  source = 'manual',
  deviceId,
  temperature,
  pulse,
  bpSystolic,
  bpDiastolic,
  spo2,
  respiratoryRate,
  gcsScore,
  painScore,
  urineOutputMl,
  bloodGlucose,
  weightKg,
  fio2,
  peep,
  tidalVolume,
  notes
}) {
  const news2 = computeNEWS2({ respiratory_rate: respiratoryRate, spo2, bp_systolic: bpSystolic, pulse, temperature, gcs_score: gcsScore });
  const si = shockIndex(pulse, bpSystolic);

  const [result] = await sequelize.query(
    `INSERT INTO vital_records (
      organization_id, admission_id, patient_id, recorded_by, recorded_at, source, device_id,
      temperature, pulse, bp_systolic, bp_diastolic, spo2, respiratory_rate,
      gcs_score, pain_score, urine_output_ml, blood_glucose, weight_kg,
      fio2, peep, tidal_volume, news2_score, shock_index, notes
    ) VALUES (
      :orgId, :admId, :patientId, :recordedBy, NOW(), :source, :deviceId,
      :temp, :pulse, :sbp, :dbp, :spo2, :rr,
      :gcs, :pain, :urine, :glucose, :weight,
      :fio2, :peep, :tv, :news2, :si, :notes
    ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId, admId: admissionId || null, patientId, recordedBy: recordedBy || null,
        source, deviceId: deviceId || null, temp: temperature || null, pulse: pulse || null,
        sbp: bpSystolic || null, dbp: bpDiastolic || null, spo2: spo2 || null, rr: respiratoryRate || null,
        gcs: gcsScore || null, pain: painScore || null, urine: urineOutputMl || null,
        glucose: bloodGlucose || null, weight: weightKg || null,
        fio2: fio2 || null, peep: peep || null, tv: tidalVolume || null,
        news2, si, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );

  const record = result[0];

  // Trigger early warning alert if score warrants it
  if (admissionId && news2 >= 3) {
    await triggerAlert(organizationId, admissionId, patientId, record.id, news2);
  }

  // Hypoglycemia alert
  if (admissionId && bloodGlucose !== null && bloodGlucose !== undefined && bloodGlucose < 3.9) {
    await createAlert(organizationId, admissionId, patientId, record.id, 'hypoglycemia', 'high', news2,
      `Blood glucose critically low: ${bloodGlucose} mmol/L`);
  }

  return { ...record, news2_score: news2 };
}

async function triggerAlert(organizationId, admissionId, patientId, vitalRecordId, news2) {
  const severity = news2Severity(news2);
  if (!severity) return;

  // Avoid duplicate alerts within last 30 minutes
  const [recent] = await sequelize.query(
    `SELECT id FROM early_warning_alerts
     WHERE admission_id = :admId AND resolved = false AND triggered_at > NOW() - INTERVAL '30 minutes'
     LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  if (recent) return;

  const message = `NEWS2 score ${news2}: ${severity.toUpperCase()} — Patient requires ${
    severity === 'critical' ? 'immediate medical review' :
    severity === 'high' ? 'urgent medical review within 30 minutes' :
    'review within 1 hour'
  }`;

  await createAlert(organizationId, admissionId, patientId, vitalRecordId, 'deterioration', severity, news2, message);
}

async function createAlert(organizationId, admissionId, patientId, vitalRecordId, alertType, severity, news2, message) {
  await sequelize.query(
    `INSERT INTO early_warning_alerts (organization_id, admission_id, vital_record_id, patient_id, alert_type, severity, news2_score, alert_message, triggered_at)
     VALUES (:orgId, :admId, :vitalId, :patientId, :type, :severity, :news2, :message, NOW())`,
    {
      replacements: {
        orgId: organizationId, admId: admissionId, vitalId: vitalRecordId, patientId,
        type: alertType, severity, news2: news2 || null, message
      },
      type: QueryTypes.INSERT
    }
  );
}

export async function getVitalsTrend(admissionId, organizationId, { hours = 24 } = {}) {
  return sequelize.query(
    `SELECT * FROM vital_records
     WHERE admission_id = :admId AND organization_id = :orgId
       AND recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
     ORDER BY recorded_at DESC`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
}

export async function getActiveAlerts(organizationId, { admissionId, wardId, severity } = {}) {
  let where = 'a.organization_id = :orgId AND a.resolved = false';
  const replacements = { orgId: organizationId };

  if (admissionId) { where += ' AND a.admission_id = :admId'; replacements.admId = admissionId; }
  if (severity) { where += ' AND a.severity = :severity'; replacements.severity = severity; }
  if (wardId) {
    where += ' AND EXISTS (SELECT 1 FROM ip_admissions adm JOIN beds b ON b.id = adm.bed_id WHERE adm.id = a.admission_id AND b.ward_id = :wardId)';
    replacements.wardId = wardId;
  }

  return sequelize.query(
    `SELECT a.*, adm.admission_number, b.bed_number, w.name as ward_name
     FROM early_warning_alerts a
     LEFT JOIN ip_admissions adm ON adm.id = a.admission_id
     LEFT JOIN beds b ON b.id = adm.bed_id
     LEFT JOIN wards w ON w.id = b.ward_id
     WHERE ${where}
     ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, a.triggered_at DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function acknowledgeAlert(alertId, organizationId, acknowledgedBy) {
  await sequelize.query(
    `UPDATE early_warning_alerts SET acknowledged_by = :by, acknowledged_at = NOW() WHERE id = :alertId AND organization_id = :orgId`,
    { replacements: { by: acknowledgedBy, alertId, orgId: organizationId }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function resolveAlert(alertId, organizationId) {
  await sequelize.query(
    `UPDATE early_warning_alerts SET resolved = true WHERE id = :alertId AND organization_id = :orgId`,
    { replacements: { alertId, orgId: organizationId }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function getLatestVitals(admissionId, organizationId) {
  const [latest] = await sequelize.query(
    `SELECT * FROM vital_records WHERE admission_id = :admId AND organization_id = :orgId ORDER BY recorded_at DESC LIMIT 1`,
    { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  return latest || null;
}
