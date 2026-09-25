/**
 * Append-only action audit (audit OPS-02 / COR-02), on the existing `operations_audit_log` table.
 * Best-effort by default: a failed audit write is logged loudly but does not fail the user's action. Pass
 * { strict: true } where the action must not happen without its audit row.
 */
import pool from '../db/pgPool.js';

export async function auditAction({ module, entityType, entityId, action, actor, organizationId, details = {} }, { strict = false, client = pool } = {}) {
  try {
    await client.query(
      `INSERT INTO operations_audit_log (module, entity_type, entity_id, action, actor, details, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [module, entityType, entityId == null ? null : String(entityId), action, actor == null ? 'system' : String(actor), JSON.stringify(details), organizationId ?? null]
    );
  } catch (e) {
    console.error(`[audit] FAILED to record ${module}.${action}:`, e.message);
    if (strict) throw e;
  }
}

export default { auditAction };
