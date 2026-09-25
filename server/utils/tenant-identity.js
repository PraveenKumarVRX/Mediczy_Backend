/**
 * Single place that decides which tenant (hospital / organization) an authenticated token belongs to.
 *
 * Audit finding SEC-01: hospital middleware used `hospital_id || tenant_id || id || hospitalId` and never read
 * `organization_id`, which is exactly what department logins mint ({ id, role, organization_id }). For those
 * users the tenant silently became their own USER id. `id` is only a tenant id for the legacy hospital account
 * (role 'hospital', where the row id IS the hospital id), so it is accepted for that role and nothing else.
 *
 * Returns the tenant id, or null when the token carries no tenant — callers must treat null as "not attached
 * to a hospital" (403), never fall back to another identifier.
 */
const LEGACY_HOSPITAL_ROLES = new Set(['hospital']);

export function resolveTenantId(claims = {}) {
  const explicit = claims.hospital_id || claims.tenant_id || claims.organization_id || claims.hospitalId;
  if (explicit) return explicit;
  const role = claims.role || claims.userType;
  if (LEGACY_HOSPITAL_ROLES.has(role) && claims.id) return claims.id;
  return null;
}

/** Express helper: returns the tenant id or sends the 403 and returns null. */
export function requireTenant(req, res, claims = req.user) {
  const tenantId = resolveTenantId(claims);
  if (!tenantId) {
    res.status(403).json({
      success: false,
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'This account is not attached to a hospital. Ask an administrator to attach it.',
    });
    return null;
  }
  return tenantId;
}

export default { resolveTenantId, requireTenant };
