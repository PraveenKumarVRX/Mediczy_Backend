/** Fail closed for configured mobile origins; use entity UIDs, never ambiguous numeric IDs. */
export async function mobileUserBelongsToTenant(req, userId) {
  if (!req.mobileTenant) return true;
  const { default: pool } = await import('../db/pgPool.js');
  const { rows } = await pool.query(`
    SELECT 1 FROM users u JOIN tenants t ON t.id = $2
    WHERE u.id = $1 AND (
      u.organization_uid = t.unique_id OR EXISTS (
        SELECT 1 FROM corporates c WHERE c.unique_id = u.organization_uid
        AND COALESCE(c.owned_by_tenant_id, c.tenant_id) = t.id
      )
    ) LIMIT 1`, [userId, req.mobileTenant.id]);
  return rows.length === 1;
}
