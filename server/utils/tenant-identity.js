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


/**
 * Imaging (HyperGrid DICOM) tenant — a DIFFERENT id space from the hospital tenant: it is the lab / imaging-centre
 * account id. Integer ids are NOT unique across account tables: production hospitals, labs and users all contain ids
 * 70, 2368, 2429 and 2433, and doctor ids (27–1800) overlap lab ids (1–2434). The route used `tenantId || id` for every
 * token, so any authenticated account whose own id equalled an imaging tenant id was served that tenant's studies.
 *
 * Accepted: an explicit `tenantId` claim (minted by the server), or the id of a LAB account — the only role whose
 * token is validated against the labs table (authLab). A hospital/clinic/doctor/admin id is never a lab id, however
 * often the integers happen to match. Everything else → null (the caller must refuse).
 *
 * The durable fix is a globally unique tenant key (users/doctors/hospitals/tenants already carry a UUID `uid`, and
 * every table but patients an alphanumeric `unique_id`): tokens would carry a tenant UID that is resolved against the
 * tenant registry, and the imaging tables would be keyed on it. That is a multi-table migration; until then this is
 * fail-closed.
 */
const IMAGING_ACCOUNT_ROLES = new Set(['lab']);

export function resolveImagingTenantId(user = {}) {
  const explicit = Number(user.tenantId);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const role = user.role || user.userType;
  const id = Number(user.id);
  if (IMAGING_ACCOUNT_ROLES.has(role) && Number.isInteger(id) && id > 0) return id;
  return null;
}

export default { resolveTenantId, requireTenant, resolveImagingTenantId };
