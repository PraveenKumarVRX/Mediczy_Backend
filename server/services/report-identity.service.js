/**
 * report-identity.service.js
 * ==========================
 * Step 1 of the report-OCR pipeline (docs/ai/REPORT_OCR_STEP1_IDENTITY_AND_CONTRACT.md).
 *
 * Resolves a matched report to a TYPED subject + organization identity on the entity-UID registry,
 * so observations are never keyed on bare integers and are always org-scoped.
 *
 * Identity model:
 *   - subject_uid  = the person (we use the `users` row — the login identity — as the canonical
 *                    subject; kind = 'user'), confirmed against entity_registry.
 *   - patient_uid  = the clinical link, populated ONLY when a `patients` row already exists for the
 *                    user. We never create a patients row just to satisfy a scorer (per CTO review).
 *   - organization_uid = the corporate/tenant context, for scoping every read/write/dedupe/delivery.
 */

import pool from '../db/pgPool.js';

/**
 * @param {object} match - from emailAutoProcess / app upload. Any of:
 *   { userId, corporateId, tenantId }
 * @param {object} [db=pool]
 * @returns {Promise<{subject_uid:string|null, subject_kind:string|null, patient_uid:string|null, organization_uid:string|null}>}
 */
export async function resolveReportSubject(match = {}, db = pool) {
  const { userId = null, corporateId = null, tenantId = null } = match;
  const out = { subject_uid: null, subject_kind: null, patient_uid: null, organization_uid: null };

  if (userId) {
    // Canonical subject = the user row, verified present in the registry.
    const { rows } = await db.query(
      `SELECT u.unique_id
         FROM users u
         JOIN entity_registry er ON er.uid = u.unique_id AND er.source_table = 'users'
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    if (rows[0]?.unique_id) {
      out.subject_uid = rows[0].unique_id;
      out.subject_kind = 'user';
    }

    // Clinical link only if a patient row already exists — never provision one here.
    const { rows: pr } = await db.query(
      `SELECT unique_id FROM patients WHERE "userId" = $1 AND unique_id IS NOT NULL LIMIT 1`,
      [userId]
    );
    if (pr[0]?.unique_id) out.patient_uid = pr[0].unique_id;
  }

  // Organization scope: prefer the explicit corporate, else the tenant.
  if (corporateId) {
    const { rows } = await db.query(
      `SELECT unique_id FROM corporates WHERE id = $1 AND unique_id IS NOT NULL LIMIT 1`,
      [corporateId]
    );
    if (rows[0]?.unique_id) out.organization_uid = rows[0].unique_id;
  }
  if (!out.organization_uid && tenantId) {
    const { rows } = await db.query(
      `SELECT unique_id FROM tenants WHERE id = $1 AND unique_id IS NOT NULL LIMIT 1`,
      [tenantId]
    );
    if (rows[0]?.unique_id) out.organization_uid = rows[0].unique_id;
  }

  return out;
}

export default { resolveReportSubject };
