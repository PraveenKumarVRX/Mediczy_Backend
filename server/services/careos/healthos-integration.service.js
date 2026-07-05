/**
 * HealthOS — Platform integration bridges (FHIR labs, Apple Health, homecare)
 */
import pool from '../../db/pgPool.js';
import { ingestLabResult } from './lab-connector.service.js';
import { ingestWearableReading } from './wearables-monitoring.service.js';

export async function syncLabsFromFhir(patientId, organizationId) {
  const synced = [];
  const { rows } = await pool.query(
    `SELECT id, patient_id, test_name, value, numeric_value, unit, reference_range, flag, is_abnormal, report_date
     FROM lab_results WHERE patient_id = $1 ORDER BY report_date DESC NULLS LAST LIMIT 50`,
    [patientId]
  ).catch(() => ({ rows: [] }));

  for (const r of rows) {
    const fhirId = `lab_results-${r.id}`;
    const exists = await pool.query(
      `SELECT 1 FROM healthos_lab_results WHERE fhir_resource_id = $1 LIMIT 1`,
      [fhirId]
    ).catch(() => ({ rows: [] }));
    if (exists.rows[0]) continue;

    const severity = r.is_abnormal || ['H', 'L', 'critical'].includes(String(r.flag || '').toLowerCase())
      ? 'warning' : 'normal';
    const lab = await ingestLabResult({
      organizationId,
      patientId,
      testName: r.test_name || r.testName || 'Lab test',
      resultValue: String(r.value ?? r.numeric_value ?? ''),
      resultUnit: r.unit,
      referenceRange: r.reference_range,
      severity,
      fhirResourceId: fhirId,
    });
    synced.push(lab);
  }
  return { synced: synced.length, results: synced };
}

export async function syncWearablesFromAppleHealth(userId, patientId, organizationId) {
  const synced = [];
  const { rows } = await pool.query(
    `SELECT * FROM fitness_data WHERE user_id = $1 ORDER BY date DESC LIMIT 14`,
    [userId]
  ).catch(() => ({ rows: [] }));

  const metrics = [
    { field: 'heart_rate_avg', type: 'heart_rate', unit: 'bpm' },
    { field: 'oxygen_saturation', type: 'spo2', unit: '%' },
    { field: 'steps', type: 'steps', unit: 'count' },
    { field: 'blood_pressure_systolic', type: 'bp_systolic', unit: 'mmHg' },
    { field: 'body_temperature', type: 'temperature', unit: 'C' },
  ];

  for (const row of rows) {
    for (const m of metrics) {
      const val = row[m.field];
      if (val == null) continue;
      const recordedAt = row.date || row.created_at;
      const dup = await pool.query(
        `SELECT 1 FROM healthos_wearable_readings
         WHERE patient_id = $1 AND metric_type = $2 AND recorded_at = $3 LIMIT 1`,
        [patientId, m.type, recordedAt]
      ).catch(() => ({ rows: [] }));
      if (dup.rows[0]) continue;

      const reading = await ingestWearableReading({
        organizationId,
        patientId,
        source: 'apple_health',
        metricType: m.type,
        value: Number(val),
        unit: m.unit,
        recordedAt,
      });
      synced.push(reading);
    }
  }
  return { synced: synced.length, readings: synced };
}

export async function listPatientImagingStudies(patientId, tenantId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.study_instance_uid, s.study_uid, s.patient_id,
            s.modality, s.study_date, s.study_description, s.patient_name,
            COUNT(i.id) AS instance_count
     FROM hg_dicom_studies s
     LEFT JOIN hg_dicom_instances i
       ON (i.study_instance_uid = s.study_instance_uid OR i.study_id = s.id)
     WHERE s.patient_id = $1 AND s.tenant_id = $2
     GROUP BY s.id
     ORDER BY s.study_date DESC NULLS LAST, s.created_at DESC
     LIMIT 50`,
    [patientId, tenantId]
  ).catch(() => ({ rows: [] }));
  return rows.map((r) => ({
    ...r,
    studyUID: r.study_instance_uid || r.study_uid,
    dicomwebUrl: `/api/hypergrid/dicom/studies/${r.study_instance_uid || r.study_uid}`,
  }));
}

export async function getImagingStudy(studyUID, tenantId) {
  const { rows } = await pool.query(
    `SELECT * FROM hg_dicom_studies
     WHERE (study_instance_uid = $1 OR study_uid = $1) AND tenant_id = $2 LIMIT 1`,
    [studyUID, tenantId]
  ).catch(() => ({ rows: [] }));
  const study = rows[0];
  if (!study) return null;
  const uid = study.study_instance_uid || study.study_uid;
  const { rows: instances } = await pool.query(
    `SELECT * FROM hg_dicom_instances
     WHERE study_instance_uid = $1 OR study_id = $2`,
    [uid, study.id]
  ).catch(() => ({ rows: [] }));
  return {
    study,
    instances,
    studyUID: uid,
    dicomwebBase: `/api/hypergrid/dicom/studies/${uid}`,
  };
}

export default { syncLabsFromFhir, syncWearablesFromAppleHealth, listPatientImagingStudies, getImagingStudy };
