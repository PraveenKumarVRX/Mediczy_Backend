/**
 * Auto-register Orthanc-received DICOM studies into Lab RIS (`ris_studies`).
 *
 * Local MRI/CT PCs C-STORE (or C-MOVE pull) into Orthanc; the Orthanc bridge
 * previously only wrote `hg_dicom_*`. This service upserts the RIS worklist
 * row so Lab RIS + doctor Lab Referred see the study automatically.
 */
import pool from '../../db/pgPool.js';
import logger from '../../config/logger.js';
import { formatDicomStudyDate } from '../orthanc-pacs.service.js';
import { onDicomStudyIngested } from './imaging-ingest.service.js';
import { requestTriage } from './imaging-triage.service.js';

function numOrNull(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getDoctorDisplayName(doctorId, fallbackName = null) {
  if (!doctorId) return fallbackName || null;
  try {
    const { rows } = await pool.query(
      `SELECT CONCAT_WS(' ', NULLIF(TRIM("firstName"), ''), NULLIF(TRIM("lastName"), '')) AS name
         FROM doctors
        WHERE id = $1
        LIMIT 1`,
      [doctorId],
    );
    return rows[0]?.name || fallbackName || null;
  } catch (err) {
    logger.warn('[RIS-AutoIngest] doctor display-name lookup failed', { error: err.message });
    return fallbackName || null;
  }
}

/**
 * Resolve which lab/clinic owns an Orthanc ingest.
 * Priority: explicit → ORTHANC_DEFAULT_LAB_ID → dicom_modalities.ae_title match.
 */
export async function resolveLabIdForOrthancIngest({
  explicitLabId = null,
  remoteAet = null,
} = {}) {
  const explicit = numOrNull(explicitLabId);
  if (explicit) return explicit;

  const envLab = numOrNull(process.env.ORTHANC_DEFAULT_LAB_ID);
  if (envLab) return envLab;

  const aet = String(remoteAet || '').trim();
  if (aet) {
    try {
      const { rows } = await pool.query(
        `SELECT tenant_id
           FROM dicom_modalities
          WHERE status = 'active'
            AND UPPER(TRIM(ae_title)) = UPPER(TRIM($1))
          ORDER BY id DESC
          LIMIT 1`,
        [aet],
      );
      if (rows[0]?.tenant_id) return Number(rows[0].tenant_id);
    } catch (err) {
      logger.warn('[RIS-AutoIngest] modality AE lookup failed', { error: err.message });
    }
  }

  return null;
}

/**
 * Best-effort referring doctor from DICOM physician name / env default.
 */
export async function resolveReferringDoctor({
  referringPhysician = null,
  referringDoctorId = null,
} = {}) {
  const explicit = numOrNull(referringDoctorId);
  if (explicit) {
    return { id: explicit, name: await getDoctorDisplayName(explicit, referringPhysician) };
  }

  const envDoc = numOrNull(process.env.ORTHANC_DEFAULT_REFERRING_DOCTOR_ID);
  if (envDoc) {
    return { id: envDoc, name: await getDoctorDisplayName(envDoc, referringPhysician) };
  }

  const name = String(referringPhysician || '').trim();
  if (!name || name.length < 3) return { id: null, name: name || null };

  const cleaned = name.replace(/^dr\.?\s+/i, '').trim();
  try {
    const { rows } = await pool.query(
      `SELECT id,
              CONCAT_WS(' ', NULLIF(TRIM("firstName"), ''), NULLIF(TRIM("lastName"), '')) AS name,
              email
         FROM doctors
        WHERE COALESCE(status, 'active') IN ('active', 'verified', 'approved')
          AND (
            LOWER(TRIM(CONCAT_WS(' ', NULLIF(TRIM("firstName"), ''), NULLIF(TRIM("lastName"), '')))) = LOWER(TRIM($1))
            OR LOWER(TRIM(CONCAT_WS(' ', NULLIF(TRIM("firstName"), ''), NULLIF(TRIM("lastName"), '')))) = LOWER(TRIM($2))
            OR LOWER(CONCAT_WS(' ', NULLIF(TRIM("firstName"), ''), NULLIF(TRIM("lastName"), ''))) LIKE LOWER($3)
            OR LOWER(email) = LOWER($4)
          )
        ORDER BY id ASC
        LIMIT 1`,
      [name, cleaned, `%${cleaned}%`, name.includes('@') ? name : ''],
    );
    if (rows[0]) {
      return { id: Number(rows[0].id), name: rows[0].name || name };
    }
  } catch (err) {
    logger.warn('[RIS-AutoIngest] doctor match failed', { error: err.message });
  }

  return { id: null, name };
}

/**
 * Upsert one RIS worklist row for an Orthanc study.
 * Idempotent on (lab_id, study_instance_uid).
 */
export async function ensureRisStudyFromOrthancIngest({
  labId,
  tags = {},
  orthancStudyId = null,
  orthancInstanceId = null,
  fileMeta = {},
  referringDoctorId = null,
  remoteAet = null,
} = {}) {
  const resolvedLabId = await resolveLabIdForOrthancIngest({
    explicitLabId: labId,
    remoteAet,
  });
  if (!resolvedLabId) {
    return {
      success: false,
      skipped: true,
      reason: 'no_lab_id',
      message: 'Set ORTHANC_DEFAULT_LAB_ID or register modality AE in PACS Settings',
    };
  }

  const studyUid = String(tags.studyInstanceUID || tags.StudyInstanceUID || '').trim();
  if (!studyUid) {
    return { success: false, skipped: true, reason: 'no_study_uid' };
  }

  const patientName = String(
    tags.patientName || tags.PatientName || 'Unknown Patient',
  ).replace(/\^/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown Patient';

  // A multi-series study (MRI in particular) arrives as many separate
  // instance-level ingest calls. If any single instance's tags don't carry
  // a Modality (a scout/localizer, a non-image object, a parsing miss),
  // that must never be treated as authoritative — otherwise it silently
  // overwrites an already-known-correct modality on later upserts, and can
  // trigger AI triage under the wrong modality on first ingest. Keep the
  // raw parsed value (possibly empty) separate from the display/insert
  // default so callers below can tell "unresolved" apart from "really OT".
  const rawModality = String(tags.modality || tags.Modality || '').toUpperCase().trim();
  const modality = rawModality || 'OT';
  const accession = String(tags.accessionNumber || tags.AccessionNumber || '').trim()
    || `ACC-AUTO-${Date.now()}`;
  const studyDate = formatDicomStudyDate(tags.studyDate || tags.StudyDate)
    || new Date().toISOString().slice(0, 10);
  const studyDescription = tags.studyDescription || tags.StudyDescription || null;
  const seriesUid = tags.seriesInstanceUID || tags.SeriesInstanceUID || null;
  const sopUid = tags.sopInstanceUID || tags.SOPInstanceUID || null;
  const patientSex = String(tags.patientSex || tags.PatientSex || 'U').charAt(0).toUpperCase() || 'U';
  const patientDob = formatDicomStudyDate(tags.patientBirthDate || tags.PatientBirthDate);
  const referringPhysician = tags.referringPhysician || tags.ReferringPhysicianName || null;

  const doctor = await resolveReferringDoctor({
    referringPhysician,
    referringDoctorId,
  });

  const fileName = fileMeta.fileName || fileMeta.s3Key || `${sopUid || studyUid}.dcm`;
  const filePath = fileMeta.filePath || fileMeta.s3Key || fileName;
  const fileSize = Number(fileMeta.fileSize) || 0;
  const mimeType = fileMeta.mimeType || 'application/dicom';
  const originalName = fileMeta.originalName || fileName;

  const existing = await pool.query(
    `SELECT id, referring_doctor_id, status, image_count, modality
       FROM ris_studies
      WHERE lab_id = $1
        AND study_instance_uid = $2
      ORDER BY id DESC
      LIMIT 1`,
    [resolvedLabId, studyUid],
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    const { rows } = await pool.query(
      `UPDATE ris_studies SET
         patient_name = COALESCE(NULLIF($3, ''), patient_name),
         patient_sex = COALESCE($4, patient_sex),
         patient_dob = COALESCE($5::date, patient_dob),
         modality = COALESCE(NULLIF($6, ''), modality),
         study_description = COALESCE($7, study_description),
         accession_number = COALESCE(NULLIF($8, ''), accession_number),
         series_instance_uid = COALESCE($9, series_instance_uid),
         sop_instance_uid = COALESCE($10, sop_instance_uid),
         orthanc_study_id = COALESCE($11, orthanc_study_id),
         orthanc_instance_id = COALESCE($12, orthanc_instance_id),
         pacs_source = 'orthanc',
         is_dicom = true,
         referring_physician = COALESCE($13, referring_physician),
         referring_doctor_id = COALESCE($14, referring_doctor_id),
         referring_doctor_name = COALESCE($15, referring_doctor_name),
         study_date = COALESCE($16::date, study_date),
         status = CASE WHEN status IN ('Ordered','Scheduled') THEN 'Completed' ELSE status END,
         image_count = GREATEST(COALESCE(image_count, 1), COALESCE($17, 1)),
         file_name = COALESCE(NULLIF($18, ''), file_name),
         file_path = COALESCE(NULLIF($19, ''), file_path),
         mime_type = COALESCE(NULLIF($20, ''), mime_type),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        row.id,
        resolvedLabId,
        patientName,
        patientSex,
        patientDob,
        // Raw parsed value, NOT the 'OT' placeholder default — an instance
        // whose tags don't carry Modality must never clobber an already-set
        // real modality (see rawModality comment above).
        rawModality,
        studyDescription,
        accession,
        seriesUid,
        sopUid,
        orthancStudyId,
        orthancInstanceId,
        referringPhysician,
        doctor.id,
        doctor.name,
        studyDate,
        1,
        fileName,
        filePath,
        mimeType,
      ],
    );

    // The study's modality was unresolved ('OT' placeholder) until this
    // instance — likely the first ingest event ran before any instance
    // carried a Modality tag, so triage (if it ran at all) ran under the
    // wrong modality. Re-trigger it now that the real modality is known,
    // rather than leaving a mislabeled result cached indefinitely.
    if (row.modality === 'OT' && rawModality && rawModality !== 'OT') {
      requestTriage({
        studyId: row.id,
        studyInstanceUID: studyUid,
        tenantId: resolvedLabId,
        modality: rawModality,
        orthancStudyId,
      }).catch((err) => logger.warn('[RIS-AutoIngest] modality-resolved re-triage failed', { error: err.message }));
    }

    return {
      success: true,
      created: false,
      study: rows[0],
      labId: resolvedLabId,
    };
  }

  const { rows } = await pool.query(
    `INSERT INTO ris_studies
       (lab_id, patient_name, patient_dob, patient_sex,
        accession_number, study_instance_uid, series_instance_uid, sop_instance_uid,
        orthanc_study_id, orthanc_instance_id, pacs_source,
        modality, study_description, referring_physician,
        referring_doctor_id, referring_doctor_name,
        study_date, priority, status,
        file_name, original_name, file_path, file_size, mime_type,
        is_dicom, dicom_tags, notes, image_count, series_count)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'orthanc',$11,$12,$13,$14,$15,$16,'Routine','Completed',
        $17,$18,$19,$20,$21,true,$22,$23,1,1)
     RETURNING *`,
    [
      resolvedLabId,
      patientName,
      patientDob,
      patientSex,
      accession,
      studyUid,
      seriesUid,
      sopUid,
      orthancStudyId,
      orthancInstanceId,
      modality,
      studyDescription,
      referringPhysician,
      doctor.id,
      doctor.name,
      studyDate,
      fileName,
      originalName,
      filePath,
      fileSize,
      mimeType,
      JSON.stringify({
        autoIngest: true,
        source: 'orthanc',
        remoteAet: remoteAet || null,
        tags,
      }),
      remoteAet ? `Auto-ingested from modality AE ${remoteAet}` : 'Auto-ingested from Orthanc',
    ],
  );

  const study = rows[0];

  try {
    await onDicomStudyIngested({
      study,
      tenantId: resolvedLabId,
      orthancResult: {
        orthancStudyId,
        orthancInstanceId,
        studyInstanceUID: studyUid,
        method: 'orthanc-auto-ingest',
      },
      s3Key: filePath,
      // This is the first instance ever seen for this study — if its tags
      // didn't carry a Modality, `modality` is only the 'OT' placeholder,
      // not a real value. Skip auto-triage until a later instance resolves
      // it (see the re-triage call above on the update path).
      skipTriage: !rawModality,
    });
  } catch (err) {
    logger.warn('[RIS-AutoIngest] post-ingest hooks', { error: err.message });
  }

  logger.info('[RIS-AutoIngest] Created RIS study from Orthanc', {
    labId: resolvedLabId,
    studyId: study.id,
    studyUid,
    modality,
    referringDoctorId: doctor.id,
  });

  return {
    success: true,
    created: true,
    study,
    labId: resolvedLabId,
  };
}

/**
 * Register / refresh RIS rows for StudyInstanceUIDs already in Orthanc
 * (used after C-MOVE pull from local MRI PC).
 */
async function registerOrthancStudyResource({
  labId,
  study,
  referringDoctorId = null,
  fallbackUid = null,
} = {}) {
  const {
    listOrthancStudyInstances,
  } = await import('../orthanc-pacs.service.js');
  const { fetchOrthancInstanceMetadata } = await import('../orthanc-hypergrid-bridge.service.js');

  const studyTags = study.MainDicomTags || {};
  const patientTags = study.PatientMainDicomTags || {};
  const uid = studyTags.StudyInstanceUID || fallbackUid;
  const instances = await listOrthancStudyInstances(study.ID);
  const firstInstance = instances[0] || null;
  let instanceTags = {};
  if (firstInstance) {
    try {
      const inst = await fetchOrthancInstanceMetadata(firstInstance);
      instanceTags = inst?.MainDicomTags || {};
    } catch (_) { /* optional */ }
  }

  return ensureRisStudyFromOrthancIngest({
    labId,
    orthancStudyId: study.ID,
    orthancInstanceId: firstInstance,
    tags: {
      studyInstanceUID: studyTags.StudyInstanceUID || instanceTags.StudyInstanceUID || uid,
      patientName: patientTags.PatientName || studyTags.PatientName || instanceTags.PatientName,
      patientSex: patientTags.PatientSex || instanceTags.PatientSex,
      patientBirthDate: patientTags.PatientBirthDate || instanceTags.PatientBirthDate,
      modality: instanceTags.Modality
        || String(studyTags.ModalitiesInStudy || '').split('\\')[0]
        || studyTags.Modality,
      studyDate: studyTags.StudyDate || instanceTags.StudyDate,
      studyDescription: studyTags.StudyDescription || instanceTags.StudyDescription,
      accessionNumber: studyTags.AccessionNumber || instanceTags.AccessionNumber,
      referringPhysician: studyTags.ReferringPhysicianName || instanceTags.ReferringPhysicianName,
      seriesInstanceUID: instanceTags.SeriesInstanceUID,
      sopInstanceUID: instanceTags.SOPInstanceUID,
    },
    referringDoctorId,
    fileMeta: {
      fileName: `${studyTags.StudyInstanceUID || uid}.dcm`,
      filePath: `orthanc://${study.ID}`,
      mimeType: 'application/dicom',
    },
  });
}

/**
 * Register / refresh RIS rows for StudyInstanceUIDs already in Orthanc
 * (used after C-MOVE pull from local MRI PC).
 */
export async function ensureRisStudiesForStudyUids({
  labId,
  studyInstanceUIDs = [],
  referringDoctorId = null,
} = {}) {
  const { fetchOrthancStudyByUid } = await import('../orthanc-pacs.service.js');
  const results = [];
  for (const uid of studyInstanceUIDs) {
    try {
      const study = await fetchOrthancStudyByUid(String(uid));
      if (!study) {
        results.push({ uid, success: false, reason: 'not_in_orthanc' });
        continue;
      }
      const out = await registerOrthancStudyResource({
        labId,
        study,
        referringDoctorId,
        fallbackUid: uid,
      });
      results.push({ uid, ...out });
    } catch (err) {
      results.push({ uid, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Backfill Lab RIS from studies already sitting in Orthanc
 * (MRI PC pushed earlier, webhook missed, or first-time setup).
 */
export async function syncRisStudiesFromOrthanc({
  labId,
  limit = 100,
  referringDoctorId = null,
} = {}) {
  const resolvedLabId = await resolveLabIdForOrthancIngest({ explicitLabId: labId });
  if (!resolvedLabId) {
    return {
      success: false,
      message: 'Set ORTHANC_DEFAULT_LAB_ID or pass labId',
      results: [],
    };
  }

  const { listOrthancStudies } = await import('../orthanc-pacs.service.js');
  const studies = await listOrthancStudies({ limit });
  const results = [];
  for (const study of studies) {
    const uid = study?.MainDicomTags?.StudyInstanceUID || study?.ID;
    try {
      const out = await registerOrthancStudyResource({
        labId: resolvedLabId,
        study,
        referringDoctorId,
        fallbackUid: uid,
      });
      results.push({ uid, ...out });
    } catch (err) {
      results.push({ uid, success: false, error: err.message });
    }
  }

  return {
    success: true,
    labId: resolvedLabId,
    scanned: studies.length,
    created: results.filter((r) => r.created).length,
    updated: results.filter((r) => r.success && !r.created).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export default {
  resolveLabIdForOrthancIngest,
  resolveReferringDoctor,
  ensureRisStudyFromOrthancIngest,
  ensureRisStudiesForStudyUids,
  syncRisStudiesFromOrthanc,
};
