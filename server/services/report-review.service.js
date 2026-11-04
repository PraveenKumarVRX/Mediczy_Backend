/**
 * report-review.service.js  (WP3 Stage C — clinician verify gate for extracted observations)
 * ===========================================================================================
 * Lists pending report observations and lets an authorized reviewer verify/reject them. Verified
 * rows are the only ones trusted consumers will read (that read-flip is Stage D; this stage builds
 * the gate without changing any consumer). Org-scoped and role-gated; every decision is audit-logged
 * to ai_quality_gate_log.
 *
 * Stage C does NOT auto-verify: a model confidence number is not demonstrated correctness (CTO review),
 * so trust requires an explicit human decision here.
 */

import pool from '../db/pgPool.js';
import { enqueueDocumentDelivery, buildDocumentPayload } from './report-delivery.service.js';

const UNRESTRICTED_ROLES = new Set(['medical_director', 'admin', 'super_admin', 'superadmin']);

/** Which org uids may this reviewer act on. Unrestricted for MD/admin; else the reviewer's own orgs. */
async function reviewerScope(reviewerUserId, role, db) {
  if (UNRESTRICTED_ROLES.has(String(role))) return { unrestricted: true, orgs: [] };
  const { rows } = await db.query(
    `SELECT u.organization_uid, u.tenant_uid, c.unique_id AS corp_uid
       FROM users u LEFT JOIN corporates c ON c.id = u.corporate_id
      WHERE u.id = $1 LIMIT 1`, [reviewerUserId]);
  const orgs = [...new Set([rows[0]?.organization_uid, rows[0]?.tenant_uid, rows[0]?.corp_uid].filter(Boolean))];
  return { unrestricted: false, orgs };
}

export async function listReviewQueue({ reviewerUserId, role, limit = 50, offset = 0, organizationUid = null }, db = pool) {
  const scope = await reviewerScope(reviewerUserId, role, db);
  const where = [`lr.verification_status = 'pending'`];
  const params = [];
  if (!scope.unrestricted) {
    if (!scope.orgs.length) return { items: [], total: 0, scope };
    params.push(scope.orgs); where.push(`lr.organization_uid = ANY($${params.length})`);
  }
  if (organizationUid) { params.push(organizationUid); where.push(`lr.organization_uid = $${params.length}`); }
  const whereSql = where.join(' AND ');
  const { rows: totalRows } = await db.query(`SELECT count(*)::int AS n FROM lab_results lr WHERE ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT lr.id, lr.subject_uid, lr.organization_uid, lr."testName", lr.canonical_name, lr.loinc_code,
            lr."value", lr."numericValue", lr.unit, lr."referenceRange", lr.flag, lr."isAbnormal",
            lr.confidence, lr.page, lr.source_text, lr."reportId", lr."reportDate", lr."createdAt"
       FROM lab_results lr WHERE ${whereSql}
      ORDER BY lr."createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows, total: totalRows[0].n, scope };
}

/** @param {'verified'|'rejected'} status */
export async function setVerification({ id, status, reviewerUserId, role, reason = null }, db = pool) {
  if (!['verified', 'rejected'].includes(status)) throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  const scope = await reviewerScope(reviewerUserId, role, db);
  const { rows: found } = await db.query(
    `SELECT id, organization_uid, patient_id, "reportId", verification_status FROM lab_results WHERE id = $1 LIMIT 1`, [id]);
  const obs = found[0];
  if (!obs) throw Object.assign(new Error('Observation not found'), { statusCode: 404 });
  if (!scope.unrestricted && !(obs.organization_uid && scope.orgs.includes(obs.organization_uid)))
    throw Object.assign(new Error('Not authorized for this observation\'s organization'), { statusCode: 403 });

  const { rows: updated } = await db.query(
    `UPDATE lab_results SET verification_status = $2, verified_by = $3, verified_at = NOW(), "updatedAt" = NOW()
      WHERE id = $1 RETURNING id, verification_status, verified_by, verified_at`,
    [id, status, reviewerUserId]);

  // Audit trail — awaited so the decision is reliably recorded; a log failure is logged, not fatal.
  await db.query(
    `INSERT INTO ai_quality_gate_log (gate_type, patient_id, passed, severity, context, checked_at)
     VALUES ('report_observation_review', $1, $2, $3, $4::jsonb, NOW())`,
    [obs.patient_id ?? null, status === 'verified', status === 'verified' ? 'info' : 'warning',
     JSON.stringify({ observation_id: id, status, reviewer_user_id: reviewerUserId, reason, organization_uid: obs.organization_uid })]
  ).catch((e) => console.error('[report-review] audit log write failed:', e.message));

  // Stage F: a verify/reject changes the document's verified set → enqueue a (revisioned) delivery.
  if (obs.reportId) enqueueDocumentDelivery(obs.reportId, db).catch((e) => console.error('[report-review] enqueue delivery failed:', e.message));

  return updated[0];
}

/** Pull: the verified extraction for one document (org-authorized). */
export async function getDocumentExtraction({ reportId, reviewerUserId, role }, db = pool) {
  const payload = await buildDocumentPayload(reportId, 0, db);
  if (!payload) return null;
  const scope = await reviewerScope(reviewerUserId, role, db);
  if (!scope.unrestricted && !(payload.organization_uid && scope.orgs.includes(payload.organization_uid)))
    throw Object.assign(new Error('Not authorized for this document\'s organization'), { statusCode: 403 });
  return payload;
}

/** Pull/trends: a subject's VERIFIED observations (optionally one analyte), newest first, org-scoped. */
export async function getSubjectObservations({ subjectUid, reviewerUserId, role, canonicalName = null }, db = pool) {
  const scope = await reviewerScope(reviewerUserId, role, db);
  const where = [`subject_uid = $1`, `verification_status = 'verified'`];
  const params = [subjectUid];
  if (!scope.unrestricted) {
    if (!scope.orgs.length) return [];
    params.push(scope.orgs); where.push(`organization_uid = ANY($${params.length})`);
  }
  if (canonicalName) { params.push(canonicalName); where.push(`canonical_name = $${params.length}`); }
  const { rows } = await db.query(
    `SELECT canonical_name, loinc_code, "testName", "value", "numericValue", unit, "referenceRange",
            flag, "isAbnormal", "reportDate", "createdAt"
       FROM lab_results WHERE ${where.join(' AND ')}
      ORDER BY COALESCE("reportDate","createdAt") DESC LIMIT 500`, params);
  return rows;
}

export default { listReviewQueue, setVerification, getDocumentExtraction, getSubjectObservations };
