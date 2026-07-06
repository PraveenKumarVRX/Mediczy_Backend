/** Phase 1: Modality worklist sync — hospital orders ↔ Orthanc ↔ ris_studies */
import pool from '../../db/pgPool.js';
import { publishEvent } from '../hypergrid-event-bus.service.js';

export async function syncWorklistToHypergrid(tenantId) {
  const r = await pool.query(
    `SELECT * FROM hg_dicom_worklist WHERE tenant_id = $1 AND status NOT IN ('completed','cancelled')
     ORDER BY scheduled_date ASC LIMIT 200`,
    [tenantId],
  );
  return r.rows;
}

export async function createWorklistFromOrder({
  tenantId, patientId, patientName, modality, scheduledDate, scheduledTime,
  requestedProcedure, accessionNumber, referringPhysician, priority = 'routine',
}) {
  const r = await pool.query(
    `INSERT INTO hg_dicom_worklist
       (tenant_id, patient_id, patient_name, modality, scheduled_date, scheduled_time,
        requested_procedure, accession_number, referring_physician, priority, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'scheduled') RETURNING *`,
    [tenantId, patientId, patientName, modality, scheduledDate, scheduledTime || null,
      requestedProcedure, accessionNumber, referringPhysician, priority],
  );
  await publishEvent({
    type: 'ModalityWorklistItemCreated',
    source: 'imaging-mwl',
    tenantId,
    patientId,
    payload: r.rows[0],
  });
  return r.rows[0];
}

export async function linkStudyToWorklist(worklistId, studyInstanceUID, studyId = null) {
  await pool.query(
    `UPDATE hg_dicom_worklist SET study_instance_uid = $2, status = 'completed' WHERE id = $1`,
    [worklistId, studyInstanceUID],
  );
  if (studyId) {
    await pool.query(
      `UPDATE ris_studies SET status = 'Completed' WHERE id = $1 AND status IN ('Ordered','Scheduled','InProgress')`,
      [studyId],
    );
  }
}
