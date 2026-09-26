/**
 * Tenant for the HyperGrid admin/integration routes (edge gateways, MQTT devices, events, twins, terminology,
 * marketplace, connectors).
 *
 * These used `req.user.tenantId || req.user.id`, i.e. the caller's own USER id as the tenant — and `requireRole(['hospital'])`
 * admits every hospital staff role. Integer ids are not unique across account tables, so that was both wrong and
 * collision-prone. All of these tables are empty in production, so the model is defined here, correctly:
 *
 *   1. an explicit `tenantId` claim minted by the server;
 *   2. otherwise the caller's hospital tenant from their token (organization_id / tenant_id / hospital_id, or the
 *      legacy hospital account) — see utils/tenant-identity.js;
 *   3. a PLATFORM ADMIN (no tenant of their own) must name the tenant explicitly with `tenantId` in the query or body,
 *      and it must exist in `tenants`;
 *   4. anyone else is refused.
 * The result is `req.hgTenantId`.
 */
import pool from '../db/pgPool.js';
import { resolveTenantId } from './tenant-identity.js';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'system_admin', 'super_admin', 'platform_admin', 'super-admin']);
const positiveInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

const deny = (res, status, code, message) => res.status(status).json({ success: false, code, message });

export async function requireHgTenant(req, res, next) {
  try {
    const user = req.user || {};
    const own = positiveInt(user.tenantId) || positiveInt(resolveTenantId(user));
    if (own) { req.hgTenantId = own; return next(); }

    if (PLATFORM_ADMIN_ROLES.has(user.role)) {
      const asked = positiveInt(req.query?.tenantId ?? req.body?.tenantId);
      if (!asked) return deny(res, 400, 'TENANT_REQUIRED', 'A platform admin must specify tenantId');
      const { rows } = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [asked]);
      if (!rows[0]) return deny(res, 404, 'TENANT_NOT_FOUND', 'No such tenant');
      req.hgTenantId = asked;
      return next();
    }
    return deny(res, 403, 'TENANT_CONTEXT_REQUIRED', 'This account is not attached to a tenant');
  } catch (err) {
    console.error('[hypergrid-tenant] lookup failed:', err.message);
    return deny(res, 503, 'TENANT_LOOKUP_UNAVAILABLE', 'Tenant could not be verified');
  }
}

export default { requireHgTenant };
