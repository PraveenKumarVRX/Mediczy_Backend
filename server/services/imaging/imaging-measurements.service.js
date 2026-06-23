/**
 * Phase C/D: Measurements + lesion tracking from OHIF/collab annotations.
 */
import pool from '../../db/pgPool.js';
import { recordLongitudinalEvent } from './imaging-longitudinal.service.js';

export async function saveMeasurement({
  studyId,
  studyInstanceUID,
  tenantId,
  lesionLabel,
  location,
  sizeMm,
  volumeMm3,
  priorSizeMm,
  tool = 'manual',
  data = {},
  createdBy,
}) {
  const growthMm = priorSizeMm != null && sizeMm != null ? sizeMm - priorSizeMm : null;
  const r = await pool.query(
    `INSERT INTO imaging_measurements
       (study_id, study_instance_uid, tenant_id, lesion_label, location,
        size_mm, volume_mm3, prior_size_mm, growth_mm, tool, data, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
     RETURNING *`,
    [
      studyId, studyInstanceUID, tenantId, lesionLabel, location,
      sizeMm, volumeMm3, priorSizeMm, growthMm, tool, JSON.stringify(data), createdBy,
    ],
  );

  if (lesionLabel && sizeMm != null) {
    await trackLesion({
      tenantId,
      patientKey: data.patientName || studyInstanceUID,
      lesionId: `${lesionLabel}:${location || 'unknown'}`.toLowerCase().replace(/\s+/g, '_'),
      studyInstanceUID,
      studyDate: data.studyDate || null,
      sizeMm,
      volumeMm3,
      location,
    });
  }

  return r.rows[0];
}

export async function trackLesion({
  tenantId, patientKey, lesionId, studyInstanceUID, studyDate, sizeMm, volumeMm3, location, metadata = {},
}) {
  const r = await pool.query(
    `INSERT INTO imaging_lesion_tracking
       (tenant_id, patient_key, lesion_id, study_instance_uid, study_date, size_mm, volume_mm3, location, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (tenant_id, lesion_id, study_instance_uid)
     DO UPDATE SET size_mm = EXCLUDED.size_mm, volume_mm3 = EXCLUDED.volume_mm3, tracked_at = NOW()
     RETURNING *`,
    [tenantId, patientKey, lesionId, studyInstanceUID, studyDate, sizeMm, volumeMm3, location, JSON.stringify(metadata)],
  );

  const prior = await pool.query(
    `SELECT size_mm, study_date FROM imaging_lesion_tracking
     WHERE tenant_id = $1 AND lesion_id = $2 AND study_instance_uid != $3
     ORDER BY study_date DESC NULLS LAST LIMIT 1`,
    [tenantId, lesionId, studyInstanceUID],
  );

  if (prior.rows[0] && sizeMm != null) {
    const growth = sizeMm - Number(prior.rows[0].size_mm);
    await recordLongitudinalEvent({
      tenantId,
      patientKey,
      studyInstanceUID,
      eventType: 'lesion_growth',
      summary: `Lesion ${lesionId}: ${prior.rows[0].size_mm}mm → ${sizeMm}mm (${growth > 0 ? '+' : ''}${growth.toFixed(1)}mm)`,
      metadata: { lesionId, priorSize: prior.rows[0].size_mm, currentSize: sizeMm, growth },
    });
  }

  return r.rows[0];
}

export async function listMeasurements(studyInstanceUID, tenantId) {
  const r = await pool.query(
    `SELECT * FROM imaging_measurements WHERE study_instance_uid = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [studyInstanceUID, tenantId],
  );
  return r.rows;
}

export async function getLesionTimeline(tenantId, patientKey, lesionId) {
  const r = await pool.query(
    `SELECT * FROM imaging_lesion_tracking
     WHERE tenant_id = $1 AND patient_key = $2 AND ($3::text IS NULL OR lesion_id = $3)
     ORDER BY study_date ASC NULLS LAST, tracked_at ASC`,
    [tenantId, patientKey, lesionId || null],
  );
  return r.rows;
}

export async function syncFromCollabAnnotation({
  sessionId, annotation, studyInstanceUID, tenantId, studyId, patientName,
}) {
  const data = annotation.data || {};
  const sizeMm = data.size_mm || data.diameter_mm || data.measurement_mm;
  if (!sizeMm) return null;
  return saveMeasurement({
    studyId,
    studyInstanceUID,
    tenantId,
    lesionLabel: data.label || annotation.tool || 'lesion',
    location: data.location || data.series || null,
    sizeMm: Number(sizeMm),
    volumeMm3: data.volume_mm3 ? Number(data.volume_mm3) : null,
    tool: annotation.tool || 'ohif',
    data: { ...data, patientName, sessionId, annotationId: annotation.id },
    createdBy: annotation.user_id,
  });
}
