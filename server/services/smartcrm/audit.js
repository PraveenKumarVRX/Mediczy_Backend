/**
 * One row in careos_federation_audit_log per partner call or link change,
 * accepted or refused. Records who acted, for which member, what was asked
 * and the result — never the partner key and never the payload.
 *
 * Fail-open, as SmartCRM's own partner audit is: a failed audit write is
 * logged loudly and the request still completes. The partner call itself is
 * audited on SmartCRM's side too, so a lost row here is not a lost trail.
 */
import pool from '../../db/pgPool.js';

export async function auditPartnerEvent({
  action, userId = null, corporateId = null, requestId = null,
  resourceType = 'smartcrm_member', resourceId = null, metadata = {},
}, db = pool) {
  try {
    await db.query(
      `INSERT INTO careos_federation_audit_log
         (actor_user_id, action, resource_type, resource_id, patient_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $1, $5::jsonb, NOW())`,
      // actor_org_id stays NULL: it is an organisation reference, and putting
      // a corporates id there would mix id spaces. The corporate is metadata.
      [
        userId,
        String(action).slice(0, 120),
        resourceType,
        resourceId === null || resourceId === undefined ? null : String(resourceId).slice(0, 120),
        JSON.stringify({ source_system: 'smartcrm', corporate_id: corporateId, request_id: requestId || null, ...metadata }),
      ]
    );
  } catch (error) {
    console.error(`[smartcrm-audit] FAILED to record ${action} for user ${userId}: ${error.message}`);
  }
}

export default { auditPartnerEvent };
