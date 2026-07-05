/**
 * HealthOS Stage 3 — Secure document / imaging exchange (FHIR DocumentBundle)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';
import { logFederationAudit } from './care-federation.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function shareDocument({ referralId, globalSessionId, patientId, documentType, title, fhirBundle, dicomStudyUid, sharedByOrgId, sharedByUserId }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO healthos_document_exchanges
      (referral_id, global_session_id, patient_id, document_type, title, fhir_bundle, dicom_study_uid, shared_by_org_id, shared_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
    [referralId || null, globalSessionId || null, patientId, documentType, title, JSON.stringify(fhirBundle || {}), dicomStudyUid, sharedByOrgId, sharedByUserId]
  );
  await logFederationAudit({
    sessionId: globalSessionId,
    actorUserId: sharedByUserId, actorOrgId: sharedByOrgId,
    action: 'document_shared', resourceType: documentType, resourceId: String(rows[0].id), patientId,
    metadata: { title, dicomStudyUid },
  });
  return rows[0];
}

export async function listDocuments({ patientId, referralId, globalSessionId }) {
  await ensure();
  const params = [patientId];
  let sql = `SELECT id, patient_id, referral_id, global_session_id, document_type, title, dicom_study_uid, shared_by_org_id, created_at
    FROM healthos_document_exchanges WHERE patient_id = $1`;
  if (referralId) { params.push(referralId); sql += ` AND referral_id = $${params.length}`; }
  if (globalSessionId) { params.push(globalSessionId); sql += ` AND global_session_id = $${params.length}`; }
  sql += ` ORDER BY created_at DESC LIMIT 50`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getDocumentBundle(documentId, requesterOrgId, requesterUserId) {
  await ensure();
  const { rows } = await pool.query(`SELECT * FROM healthos_document_exchanges WHERE id = $1`, [documentId]);
  const doc = rows[0];
  if (!doc) return null;
  await logFederationAudit({
    sessionId: doc.global_session_id,
    actorUserId: requesterUserId, actorOrgId: requesterOrgId,
    action: 'document_accessed', resourceType: doc.document_type, resourceId: String(documentId), patientId: doc.patient_id,
  });
  return doc;
}

export default { shareDocument, listDocuments, getDocumentBundle };
