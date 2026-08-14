/** Resolve study access for lab, doctor (referred), hospital, admin. */
import pool from '../../db/pgPool.js';

export async function assertStudyAccess(studyId, req) {
  const r = await pool.query(`SELECT * FROM ris_studies WHERE id = $1`, [studyId]);
  const study = r.rows[0];
  if (!study) {
    const err = new Error('Study not found');
    err.status = 404;
    throw err;
  }

  const role = req.user?.role;
  const labId = req.lab?.id;

  if (labId || role === 'lab') {
    const tid = labId || req.user?.tenantId;
    if (Number(study.lab_id) !== Number(tid)) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
  } else if (role === 'doctor') {
    if (Number(study.referring_doctor_id) !== Number(req.user?.id)) {
      const err = new Error('Access denied — not your referred study');
      err.status = 403;
      throw err;
    }
  } else if (!['admin', 'hospital', 'super-admin', 'medical_director'].includes(role)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  return { study, tenantId: study.lab_id };
}

export async function assertStudyAccessByUid(studyInstanceUID, tenantId, req) {
  const r = await pool.query(
    `SELECT * FROM ris_studies WHERE study_instance_uid = $1 AND lab_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [studyInstanceUID, tenantId],
  );
  if (!r.rows[0]) return null;
  return assertStudyAccess(r.rows[0].id, req);
}

export async function assertStudyAccessByStudyUid(studyInstanceUID, req) {
  const uid = String(studyInstanceUID || '').trim().replace(/,+$/g, '').trim();
  if (!uid) {
    const err = new Error('studyInstanceUID required');
    err.status = 400;
    throw err;
  }

  const r = await pool.query(
    `SELECT * FROM ris_studies WHERE study_instance_uid = $1 ORDER BY created_at DESC LIMIT 1`,
    [uid],
  );
  const study = r.rows[0];
  if (!study) {
    const err = new Error('Study not found');
    err.status = 404;
    throw err;
  }

  return assertStudyAccess(study.id, req);
}
