/**
 * Module Entitlement Enforcement (Workstream 12)
 * =================================================
 * Completes the "config exists, zero enforcement" gap the audit found:
 * server/config/tenant-module-packs.js and super-admin-tenant.route.js
 * already capture which modules a tenant is entitled to into
 * tenant.features.module_<key>, but nothing ever read it back. This
 * middleware is that missing read.
 *
 * Fail-open by design: if a module flag was never set for a tenant
 * (common for tenants created before this system existed, or for
 * always-on core modules that aren't part of any optionalModules list),
 * the request is allowed through. Only an EXPLICIT `false` blocks access.
 * This matches how super-admin-tenant.route.js writes the flag (true/false
 * for every key in the pack's allowed set) — undefined simply means "this
 * tenant predates entitlement tracking," not "not entitled."
 */

import Tenant from '../models/postgres/tenant.model.postgres.js';

const _cache = new Map();
const TTL_MS = 60 * 1000;

function resolveTenantId(req) {
  return req.user?.tenant_id || req.user?.organization_id || req.tenantId || req.hospitalId || null;
}

async function getTenantFeatures(tenantId) {
  const cached = _cache.get(String(tenantId));
  if (cached && Date.now() - cached.cachedAt < TTL_MS) return cached.features;

  const row = await Tenant.findByPk(tenantId, { attributes: ['id', 'features'] });
  const features = row?.features || {};
  _cache.set(String(tenantId), { features, cachedAt: Date.now() });
  return features;
}

/**
 * requireModule('ambulance') — blocks only if the tenant's Tenant.features
 * JSONB explicitly has module_ambulance === false. Anything else (missing
 * key, true) passes through.
 */
export function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return next(); // no tenant context resolvable — don't block, this route may not be tenant-scoped at all

      const features = await getTenantFeatures(tenantId);
      const flag = features[`module_${moduleKey}`];
      if (flag === false) {
        return res.status(403).json({
          success: false,
          error: 'MODULE_NOT_ENABLED',
          message: `The '${moduleKey}' module is not enabled for your organization's plan. Contact your account manager to enable it.`,
        });
      }
      next();
    } catch (e) {
      // An entitlement-check failure must never take down an otherwise-working feature.
      console.warn('[ModuleEntitlement] check failed, allowing request through:', e.message);
      next();
    }
  };
}

export function clearModuleEntitlementCache(tenantId) {
  if (tenantId) _cache.delete(String(tenantId));
  else _cache.clear();
}
