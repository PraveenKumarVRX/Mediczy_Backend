/**
 * Vitals & Early Warning Score Service
 *
 * Implements NEWS2 (National Early Warning Score 2) computation
 * and triggers deterioration alerts when thresholds are breached.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { computeNews2 } from './news2.service.js';

// ── NEWS2 (WP-1.8) ──────────────────────────────────────────────────────────
// The real, single-source scoring engine lives in news2.service.js — computeNEWS2 below is a compatibility
// shim over it for existing callers that pass the old snake_case shape and expect a plain number back (a
// missing parameter still silently contributed 0 under that old contract; callers that care about
// completeness, provisional consciousness or the band should call computeNews2() from news2.service.js
// directly instead, as saveVitals below now does).
export function computeNEWS2(vital = {}) {
  return computeNews2({
    respiratoryRate: vital.respiratory_rate,
    spo2: vital.spo2,
    spo2Scale: vital.spo2_scale || 1,
    onOxygen: Boolean(vital.on_oxygen),
    systolicBp: vital.bp_systolic,
    pulse: vital.pulse,
    consciousness: vital.consciousness || null,
    legacyGcsScore: vital.gcs_score,
    temperature: vital.temperature,
  }).score;
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
  notes,
  // WP-1.8: parameters the old score ignored or approximated. spo2Scale is normally set once per admission by
  // a clinician (ip_admissions.spo2_target_scale), not chosen at each reading — pass it explicitly only to
  // override that. consciousness is the AVPU/ACVPU letter; when it's not captured yet the shared scorer falls
  // back to gcsScore and marks the result provisional, exactly like the old behaviour, but flagged as such.
  onOxygen = false,
  spo2Scale,
  consciousness
}) {
  let scale = spo2Scale;
  if (scale == null && admissionId) {
    const [adm] = await sequelize.query(
      `SELECT spo2_target_scale FROM ip_admissions WHERE id = :admId AND organization_id = :orgId`,
      { replacements: { admId: admissionId, orgId: organizationId }, type: QueryTypes.SELECT }
    ).catch(() => [null]);
    scale = adm?.spo2_target_scale || 1;
  }
  scale = scale === 2 ? 2 : 1;

  const result2 = computeNews2({
    respiratoryRate, spo2, spo2Scale: scale, onOxygen: Boolean(onOxygen),
    systolicBp: bpSystolic, pulse, consciousness: consciousness || null, legacyGcsScore: gcsScore, temperature,
  });
  const news2 = result2.score;
  const si = shockIndex(pulse, bpSystolic);

  const [result] = await sequelize.query(
    `INSERT INTO vital_records (
      organization_id, admission_id, patient_id, recorded_by, recorded_at, source, device_id,
      temperature, pulse, bp_systolic, bp_diastolic, spo2, respiratory_rate,
      gcs_score, pain_score, urine_output_ml, blood_glucose, weight_kg,
      fio2, peep, tidal_volume, news2_score, shock_index, notes,
      oxygen_supplemental, consciousness, spo2_scale, news2_complete, news2_provisional, news2_band
    ) VALUES (
      :orgId, :admId, :patientId, :recordedBy, NOW(), :source, :deviceId,
      :temp, :pulse, :sbp, :dbp, :spo2, :rr,
      :gcs, :pain, :urine, :glucose, :weight,
      :fio2, :peep, :tv, :news2, :si, :notes,
      :onOxygen, :consciousness, :scale, :complete, :provisional, :band
    ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId, admId: admissionId || null, patientId, recordedBy: recordedBy || null,
        source, deviceId: deviceId || null, temp: temperature || null, pulse: pulse || null,
        sbp: bpSystolic || null, dbp: bpDiastolic || null, spo2: spo2 || null, rr: respiratoryRate || null,
        gcs: gcsScore || null, pain: painScore || null, urine: urineOutputMl || null,
        glucose: bloodGlucose || null, weight: weightKg || null,
        fio2: fio2 || null, peep: peep || null, tv: tidalVolume || null,
        news2, si, notes: notes || null,
        onOxygen: Boolean(onOxygen), consciousness: consciousness || null, scale,
        complete: result2.complete, provisional: result2.provisional, band: result2.band
      },
      type: QueryTypes.INSERT
    }
  );

  const record = result[0];

  // Trigger early warning alert if score warrants it — an incomplete reading also gets a (lower-severity) alert
  // so an incomplete vitals set is never silently treated the same as "checked and fine".
  if (admissionId && (news2 >= 3 || !result2.complete)) {
    await triggerAlert(organizationId, admissionId, patientId, record.id, news2, result2.complete);
  }

  // Hypoglycemia alert
  if (admissionId && bloodGlucose !== null && bloodGlucose !== undefined && bloodGlucose < 3.9) {
    await createAlert(organizationId, admissionId, patientId, record.id, 'hypoglycemia', 'high', news2,
      `Blood glucose critically low: ${bloodGlucose} mmol/L`);
  }

  return { ...record, news2_score: news2, news2_complete: result2.complete, news2_provisional: result2.provisional, news2_band: result2.band, news2_missing: result2.missing };
}

async function triggerAlert(organizationId, admissionId, patientId, vitalRecordId, news2, complete = true) {
  const severity = complete ? news2Severity(news2) : (news2Severity(news2) || 'low');
  if (!severity) return;

  // Avoid duplicate alerts within last 30 minutes
  const [recent] = await sequelize.query(
    `SELECT id FROM early_warning_alerts
     WHERE admission_id = :admId AND resolved = false AND triggered_at > NOW() - INTERVAL '30 minutes'
     LIMIT 1`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
  if (recent) return;

  const message = !complete
    ? `Vitals set incomplete (NEWS2 ${news2} from what was recorded) — a missing parameter is not the same as a normal one; complete the set.`
    : `NEWS2 score ${news2}: ${severity.toUpperCase()} — Patient requires ${
        severity === 'critical' ? 'immediate medical review' :
        severity === 'high' ? 'urgent medical review within 30 minutes' :
        'review within 1 hour'
      }`;

  // 'incomplete_vitals' would need its own alert_type enum value (ALTER TYPE, which the app role can't run —
  // it doesn't own that type); 'deterioration' is reused for both, distinguished by the message text above.
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
