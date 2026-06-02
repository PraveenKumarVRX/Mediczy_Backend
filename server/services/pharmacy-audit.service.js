import { db } from '../db/index.js';

export async function logPharmacyAudit({
  pharmacyId,
  actorId,
  actorType = 'pharmacy',
  action,
  resourceType,
  resourceId,
  details = {},
  req
}) {
  if (!pharmacyId || !action || !resourceType) {
    return null;
  }

  try {
    const result = await db.query(
      `
        INSERT INTO pharmacy_audit_logs
        (pharmacy_id, actor_id, actor_type, action, resource_type, resource_id, details, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `,
      [
        pharmacyId,
        actorId || null,
        actorType,
        action,
        resourceType,
        resourceId ? String(resourceId) : null,
        JSON.stringify(details || {}),
        req?.ip || null,
        req?.headers?.['user-agent'] || null
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[PharmacyAudit] Failed to write audit log:', error.message);
    return null;
  }
}

export default { logPharmacyAudit };
