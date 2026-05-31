/**
 * RLS Context Middleware
 * Sets PostgreSQL session variables that drive Row-Level Security policies.
 * Must be applied AFTER auth middleware so req.user is populated.
 *
 * Sets:
 *   app.current_org_id     → maps to organization_id on PHI tables
 *   app.current_user_id    → maps to user id for patient-own-record access
 *   app.is_platform_admin  → bypasses tenant isolation for platform admins
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

function normalizeRlsContext(context = {}) {
  return {
    orgId: parseInt(context.orgId || 0, 10),
    userId: parseInt(context.userId || 0, 10),
    isPlatformAdmin: !!context.isPlatformAdmin,
  };
}

/**
 * Sequelize transaction-aware RLS context setter.
 * Call this at the START of any transaction that touches PHI tables.
 *
 * @param {import('sequelize').Transaction} transaction
 * @param {{ orgId: number, userId: number, isPlatformAdmin?: boolean }} context
 */
export async function setRlsContext(transaction, { orgId, userId, isPlatformAdmin = false }) {
  const ctx = normalizeRlsContext({ orgId, userId, isPlatformAdmin });
  const q = (sql, replacements) => postgresSequelize.query(sql, { transaction, replacements, raw: true });
  await q("SELECT set_config('app.current_org_id', :orgId, true)", { orgId: String(ctx.orgId) });
  await q("SELECT set_config('app.current_user_id', :userId, true)", { userId: String(ctx.userId) });
  await q("SELECT set_config('app.is_platform_admin', :isPlatformAdmin, true)", {
    isPlatformAdmin: ctx.isPlatformAdmin ? 'true' : 'false',
  });
}

/**
 * Raw pg transaction helper for PHI/RLS-protected queries.
 *
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, userId: number, isPlatformAdmin?: boolean }} context
 * @param {(client: import('pg').PoolClient) => Promise<any>} callback
 */
export async function withRlsTransaction(pool, context, callback) {
  const ctx = normalizeRlsContext(context);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [String(ctx.orgId)]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(ctx.userId)]);
    await client.query("SELECT set_config('app.is_platform_admin', $1, true)", [ctx.isPlatformAdmin ? 'true' : 'false']);

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Express middleware — attaches normalized RLS context to the request.
 *
 * Raw pg routes should call req.withRlsTransaction(pool, callback).
 * Sequelize routes should call req.setSequelizeRlsContext(transaction) at the
 * start of any transaction that touches RLS-protected PHI tables.
 */
export function rlsContextMiddleware(req, res, next) {
  const buildRlsContext = () => {
    const principal = req.user || req.doctor || {};
    const orgId =
      principal.organization_id ||
      principal.organizationId ||
      principal.orgId ||
      principal.org_id ||
      principal.hospitalId ||
      principal.tenant_id ||
      0;
    const userId = principal.id || principal.userId || principal.sub || 0;
    const isPlatformAdmin = !!(
      (principal.isAdmin || principal.is_admin) &&
      (principal.role === 'system_admin' || principal.role === 'platform_admin')
    );

    return normalizeRlsContext({ orgId, userId, isPlatformAdmin });
  };

  Object.defineProperty(req, 'rlsContext', {
    configurable: true,
    enumerable: true,
    get: () => buildRlsContext(),
  });

  req.withRlsTransaction = (pool, callback) => withRlsTransaction(pool, buildRlsContext(), callback);
  req.setSequelizeRlsContext = (transaction) => setRlsContext(transaction, buildRlsContext());

  next();
}

export default rlsContextMiddleware;
