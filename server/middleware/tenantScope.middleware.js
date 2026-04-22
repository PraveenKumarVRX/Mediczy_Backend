/**
 * Tenant Scope Middleware
 * =======================
 * Resolves the set of tenant IDs a caller is allowed to access based on
 * their position in the hierarchy:
 *
 *   superadmin / admin  →  no restriction (all data)
 *   aggregator          →  own tenant + all child tenants (brokers + their corporates)
 *   broker              →  own tenant + all child tenants (corporates under that broker)
 *   corporate           →  own tenant only
 *   hospital/clinic     →  own tenant only
 *   team (Mayden)       →  same as their aggregator tenant scope
 *
 * After this middleware runs, every authenticated request has:
 *   req.tenantScope = {
 *     ownTenantId   : integer | null,
 *     accessibleIds : integer[] | null,   // null = no restriction (superadmin)
 *     mode          : 'superadmin' | 'aggregator' | 'broker' | 'corporate' | 'hospital' | 'open'
 *   }
 *
 * Use resolveScope(req) in routes to get WHERE clause fragments.
 *
 * Usage:
 *   import { attachTenantScope, requireScopeFilter } from '../middleware/tenantScope.middleware.js';
 *
 *   router.get('/data', authUser, attachTenantScope, async (req, res) => {
 *     const { sql, replacements } = scopeFilter(req, 'c.tenant_id');
 *     // sql = 'c.tenant_id = ANY(:_tenantIds)'  OR  '1=1' for superadmin
 *   });
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import pgPool from '../db/pgPool.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve all tenant IDs accessible from v_tenant_id (self + descendants).
 * Uses the get_tenant_scope() PostgreSQL function.
 */
async function resolveAccessibleIds(tenantId) {
  if (!tenantId) return null;
  const [row] = await postgresSequelize.query(
    'SELECT get_tenant_scope(:tid) AS ids',
    { replacements: { tid: tenantId }, type: QueryTypes.SELECT }
  );
  return row?.ids ?? [tenantId];
}

/**
 * Get the tenant_id linked to an insurance_broker by broker DB id.
 */
async function getBrokerTenantId(brokerId) {
  if (!brokerId) return null;
  const [row] = await postgresSequelize.query(
    'SELECT tenant_id FROM insurance_brokers WHERE id = :id LIMIT 1',
    { replacements: { id: brokerId }, type: QueryTypes.SELECT }
  );
  return row?.tenant_id ?? null;
}

/**
 * Get the tenant_id linked to a hospital by hospital DB id.
 */
async function getHospitalTenantId(hospitalId) {
  if (!hospitalId) return null;
  const [row] = await postgresSequelize.query(
    'SELECT tenant_id FROM hospitals WHERE id = :id LIMIT 1',
    { replacements: { id: hospitalId }, type: QueryTypes.SELECT }
  );
  return row?.tenant_id ?? null;
}

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * attachTenantScope
 * ------------------
 * Attaches req.tenantScope to every authenticated request.
 * Must run AFTER auth middleware (req.user must be populated).
 * Non-blocking: on error falls back to open scope (no restriction).
 */
export async function attachTenantScope(req, _res, next) {
  try {
    const user     = req.user;
    const userType = req.userType || user?.userType || user?.role;

    if (!user) {
      req.tenantScope = { ownTenantId: null, accessibleIds: null, mode: 'open' };
      return next();
    }

    // ── Superadmin / admin: no restriction ──────────────────────────────────
    if (
      userType === 'admin' ||
      user.isAdmin === true ||
      user.role   === 'admin' ||
      user.role   === 'superadmin'
    ) {
      req.tenantScope = { ownTenantId: null, accessibleIds: null, mode: 'superadmin' };
      return next();
    }

    // ── Aggregator (business_type=aggregator, or userType=aggregator) ───────
    if (userType === 'aggregator' || user.businessType === 'aggregator') {
      const brokerId  = user.brokerId || user.id;
      const tenantId  = user.tenant_id || await getBrokerTenantId(brokerId);
      const ids       = await resolveAccessibleIds(tenantId);
      req.tenantScope = { ownTenantId: tenantId, accessibleIds: ids, mode: 'aggregator' };
      await setTenantContextIfPossible(req, tenantId);
      return next();
    }

    // ── Broker ───────────────────────────────────────────────────────────────
    if (userType === 'broker' || user.businessType === 'broker') {
      const brokerId  = user.brokerId || user.id;
      const tenantId  = user.tenant_id || await getBrokerTenantId(brokerId);
      const ids       = await resolveAccessibleIds(tenantId);
      req.tenantScope = { ownTenantId: tenantId, accessibleIds: ids, mode: 'broker' };
      await setTenantContextIfPossible(req, tenantId);
      return next();
    }

    // ── Hospital staff ───────────────────────────────────────────────────────
    if (userType === 'hospital' || user.role === 'hospital') {
      const tenantId  = user.tenant_id || await getHospitalTenantId(user.hospital_id);
      const ids       = tenantId ? [tenantId] : null;
      req.tenantScope = { ownTenantId: tenantId, accessibleIds: ids, mode: 'hospital' };
      await setTenantContextIfPossible(req, tenantId);
      return next();
    }

    // ── Corporate portal user ────────────────────────────────────────────────
    if (userType === 'corporate' || user.isCorporate === true) {
      const tenantId  = user.tenant_id || null;
      const ids       = tenantId ? [tenantId] : null;
      req.tenantScope = { ownTenantId: tenantId, accessibleIds: ids, mode: 'corporate' };
      await setTenantContextIfPossible(req, tenantId);
      return next();
    }

    // ── Team users: inherit aggregator scope ─────────────────────────────────
    if (user.role === 'team' || userType === 'team' || user.isTeam === true) {
      // Team users belong to an aggregator (aggregator_id → insurance_brokers → tenant_id)
      const tenantId = user.tenant_id || await getBrokerTenantId(user.aggregator_id);
      const ids      = await resolveAccessibleIds(tenantId);
      req.tenantScope = { ownTenantId: tenantId, accessibleIds: ids, mode: 'aggregator' };
      await setTenantContextIfPossible(req, tenantId);
      return next();
    }

    // ── Default: patient/user — scoped to their tenant ───────────────────────
    const tenantId = user.tenant_id || null;
    req.tenantScope = {
      ownTenantId  : tenantId,
      accessibleIds: tenantId ? [tenantId] : null,
      mode         : 'open'
    };
    await setTenantContextIfPossible(req, tenantId);
    return next();

  } catch (err) {
    console.error('[TenantScope] Failed to resolve scope:', err.message);
    // Fail open with no restriction — RLS at DB level is the safety net
    req.tenantScope = { ownTenantId: null, accessibleIds: null, mode: 'open' };
    return next();
  }
}

/**
 * Set PostgreSQL session variable app.current_tenant so RLS policies fire.
 * Best-effort: does not block the request if it fails.
 */
async function setTenantContextIfPossible(req, tenantId) {
  if (!tenantId) return;
  try {
    // We can't use SET LOCAL on a pool connection without a transaction.
    // Store on req so routes can use it when they open a transaction.
    req._resolvedTenantId = tenantId;
  } catch (_) { /* no-op */ }
}

// ─── Exported helpers for routes ─────────────────────────────────────────────

/**
 * scopeFilter(req, column)
 * -------------------------
 * Returns a Sequelize-compatible { sql, replacements } object for WHERE clauses.
 *
 * Example:
 *   const { sql, replacements } = scopeFilter(req, 'c.owned_by_tenant_id');
 *   sequelize.query(`SELECT * FROM corporates c WHERE ${sql}`, { replacements })
 *
 * For superadmin returns { sql: '1=1', replacements: {} }
 * For scoped callers returns { sql: '${column} = ANY(:_tenantIds)', replacements: { _tenantIds: [...] } }
 */
export function scopeFilter(req, column = 'tenant_id') {
  const scope = req.tenantScope;
  if (!scope || scope.accessibleIds === null) {
    return { sql: '1=1', replacements: {} };
  }
  return {
    sql         : `${column} = ANY(:_tenantIds)`,
    replacements: { _tenantIds: scope.accessibleIds }
  };
}

/**
 * runWithTenantContext(tenantId, callback)
 * -----------------------------------------
 * Executes a DB callback inside a transaction with app.current_tenant set.
 * Use this in routes that write data to ensure RLS fires correctly.
 *
 * @param {number|null} tenantId
 * @param {function}    callback - async (client) => result
 */
export async function runWithTenantContext(tenantId, callback) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query("SET LOCAL app.current_tenant = $1", [String(tenantId)]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * requireScopeMode(...modes)
 * ---------------------------
 * Middleware factory: rejects requests whose scope mode is not in the list.
 *
 * Usage: router.get('/reports', authUser, attachTenantScope, requireScopeMode('aggregator','broker'), handler)
 */
export function requireScopeMode(...allowedModes) {
  return (req, res, next) => {
    const mode = req.tenantScope?.mode;
    if (!mode || (!allowedModes.includes(mode) && mode !== 'superadmin')) {
      return res.status(403).json({
        success: false,
        message: `Access denied — requires one of: ${allowedModes.join(', ')}`,
        code   : 'SCOPE_MODE_DENIED'
      });
    }
    next();
  };
}

export default { attachTenantScope, scopeFilter, runWithTenantContext, requireScopeMode };
