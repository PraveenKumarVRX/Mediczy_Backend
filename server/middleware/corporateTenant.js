/**
 * Corporate Tenant Ring-Fencing Middleware
 * ==========================================
 * Enforces multi-tenant data isolation for all corporate-scoped API endpoints.
 *
 * Security principles implemented:
 *  1. Every request that touches corporate data must declare which corporate it targets.
 *  2. The declared corporate is resolved to its canonical integer id (used by all FKs).
 *  3. Team users may only access corporates they are explicitly associated with.
 *  4. Admin users bypass the association check but still get the resolved id attached.
 *  5. Corporate portal users (userType === 'corporate') are hard-scoped to their own id.
 *  6. Broker users are hard-scoped to their own broker_id.
 *
 * Usage in a route:
 *   import { requireCorporateAccess, resolveCorporateId } from '../middleware/corporateTenant.js';
 *
 *   // Resolve :corporateId param (accepts numeric id OR unique_id like "C1ZNHW")
 *   router.get('/corporate-employees/:corporateId',
 *     authUser,
 *     requireRole(['admin','team','corporate_admin']),
 *     requireCorporateAccess,          // validates & attaches req.resolvedCorporate
 *     async (req, res) => {
 *       const { id, unique_id } = req.resolvedCorporate;
 *       ...
 *     }
 *   );
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a corporate identifier (numeric id or unique_id string) to a full
 * corporate record.  Returns null when not found.
 */
async function resolveCorporate(identifier) {
  if (!identifier) return null;

  const isNumeric = /^\d+$/.test(String(identifier));
  const [corp] = await postgresSequelize.query(
    isNumeric
      ? `SELECT id, unique_id AS "uniqueId", "companyName", status FROM corporates WHERE id = :id LIMIT 1`
      : `SELECT id, unique_id AS "uniqueId", "companyName", status FROM corporates WHERE unique_id = :uid LIMIT 1`,
    {
      replacements: isNumeric ? { id: parseInt(identifier, 10) } : { uid: String(identifier).toUpperCase() },
      type: QueryTypes.SELECT
    }
  );
  return corp || null;
}

/**
 * Check whether a team-portal user (by userId) is explicitly associated with
 * the given corporate.
 */
async function teamUserHasCorporateAccess(userId, corporateId) {
  const [row] = await postgresSequelize.query(
    `SELECT 1 FROM user_associations
     WHERE "userId"      = :userId
       AND "entityType"  = 'corporate'
       AND "entityId"    = :corporateId
       AND status        = 'active'
     LIMIT 1`,
    {
      replacements: { userId, corporateId },
      type: QueryTypes.SELECT
    }
  );
  return !!row;
}

// ---------------------------------------------------------------------------
// Exported middleware factories
// ---------------------------------------------------------------------------

/**
 * requireCorporateAccess
 * -----------------------
 * Resolves the corporate identified by `:corporateId` in the URL params (or
 * `corporateId` in the request body) and enforces access control.
 *
 * After passing, sets:
 *   req.resolvedCorporate = { id, uniqueId, companyName, status }
 *
 * Handles both numeric IDs and human-readable unique_ids transparently.
 */
export const requireCorporateAccess = async (req, res, next) => {
  try {
    const userType   = req.userType;          // set by ringFencingMiddleware
    const user       = req.user;              // decoded JWT payload

    // ------------------------------------------------------------------
    // 1. Determine the requested corporate identifier from multiple sources
    // ------------------------------------------------------------------
    const rawId =
      req.params.corporateId ||
      req.params.corpId ||
      req.params.id ||              // PUT /corporates/:id, DELETE /corporates/:id
      req.body?.corporateId ||
      req.body?.corporate_id ||
      req.query?.corporateId ||
      req.query?.corporate_id;

    if (!rawId) {
      return res.status(400).json({
        success: false,
        message: 'corporateId is required',
        code: 'CORPORATE_ID_MISSING'
      });
    }

    // ------------------------------------------------------------------
    // 2. Resolve the identifier to a full record
    // ------------------------------------------------------------------
    const corp = await resolveCorporate(rawId);

    if (!corp) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found',
        code: 'CORPORATE_NOT_FOUND'
      });
    }

    // ------------------------------------------------------------------
    // 3. Enforce tenant isolation based on caller role
    // ------------------------------------------------------------------

    // Corporate portal user → hard-scoped to their own record
    if (userType === 'corporate') {
      const callerCorpId = user.corporateId || user.id;
      if (parseInt(callerCorpId, 10) !== corp.id) {
        console.warn(
          `[CorporateTenant] Corporate user ${callerCorpId} attempted cross-tenant access to corp ${corp.id}`
        );
        return res.status(403).json({
          success: false,
          message: 'Access denied – you may only access your own corporate data',
          code: 'CROSS_TENANT_DENIED'
        });
      }
    }

    // Team user → must have an active association with the corporate
    else if (userType === 'team') {
      const userId  = user.id || user.userId;
      const isAdmin = user.isAdmin === true || user.role === 'admin';

      if (!isAdmin) {
        const allowed = await teamUserHasCorporateAccess(userId, corp.id);
        if (!allowed) {
          console.warn(
            `[CorporateTenant] Team user ${userId} has no association with corp ${corp.id} (${corp.companyName})`
          );
          return res.status(403).json({
            success: false,
            message: 'Access denied – you are not assigned to this corporate',
            code: 'CORPORATE_ACCESS_DENIED'
          });
        }
      }
    }

    // Admin → always allowed (audit log only)
    else if (userType === 'admin') {
      // pass through
    }

    // Any other user type should not be calling corporate management endpoints
    else {
      return res.status(403).json({
        success: false,
        message: 'Access denied – insufficient role for corporate management',
        code: 'ROLE_INSUFFICIENT'
      });
    }

    // ------------------------------------------------------------------
    // 4. Attach resolved corporate to the request for downstream use
    // ------------------------------------------------------------------
    req.resolvedCorporate = corp;

    console.log(
      `[CorporateTenant] ✅ ${userType} (id=${user.id || user.userId}) → corp ${corp.id} (${corp.uniqueId} / ${corp.companyName})`
    );

    return next();
  } catch (err) {
    console.error('[CorporateTenant] Middleware error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal error during corporate access check',
      code: 'TENANT_CHECK_ERROR'
    });
  }
};

/**
 * requireBrokerAccess
 * --------------------
 * Resolves the broker identified by `:brokerId` and hard-scopes broker portal
 * users to their own record.  Admins and team users pass through.
 *
 * After passing, sets:
 *   req.resolvedBroker = { id, broker_uid, broker_name, status }
 */
export const requireBrokerAccess = async (req, res, next) => {
  try {
    const userType = req.userType;
    const user     = req.user;

    const rawId =
      req.params.brokerId ||
      req.body?.brokerId   ||
      req.body?.broker_id  ||
      req.query?.brokerId  ||
      req.query?.broker_id;

    if (!rawId) {
      return res.status(400).json({
        success: false,
        message: 'brokerId is required',
        code: 'BROKER_ID_MISSING'
      });
    }

    const isNumeric = /^\d+$/.test(String(rawId));
    const [broker] = await postgresSequelize.query(
      isNumeric
        ? `SELECT id, broker_uid, broker_name, status FROM insurance_brokers WHERE id = :id LIMIT 1`
        : `SELECT id, broker_uid, broker_name, status FROM insurance_brokers WHERE broker_uid = :uid LIMIT 1`,
      {
        replacements: isNumeric ? { id: parseInt(rawId, 10) } : { uid: String(rawId) },
        type: QueryTypes.SELECT
      }
    );

    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Broker not found',
        code: 'BROKER_NOT_FOUND'
      });
    }

    // Broker portal users hard-scoped to their own record
    if (userType === 'broker') {
      const callerBrokerId = user.brokerId || user.id;
      if (parseInt(callerBrokerId, 10) !== broker.id) {
        console.warn(
          `[BrokerTenant] Broker user ${callerBrokerId} attempted cross-tenant access to broker ${broker.id}`
        );
        return res.status(403).json({
          success: false,
          message: 'Access denied – you may only access your own broker data',
          code: 'CROSS_BROKER_TENANT_DENIED'
        });
      }
    } else if (userType !== 'admin' && userType !== 'team') {
      return res.status(403).json({
        success: false,
        message: 'Access denied – insufficient role for broker management',
        code: 'ROLE_INSUFFICIENT'
      });
    }

    req.resolvedBroker = broker;

    console.log(
      `[BrokerTenant] ✅ ${userType} (id=${user.id || user.userId}) → broker ${broker.id} (${broker.broker_uid} / ${broker.broker_name})`
    );

    return next();
  } catch (err) {
    console.error('[BrokerTenant] Middleware error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal error during broker access check',
      code: 'BROKER_TENANT_CHECK_ERROR'
    });
  }
};

/**
 * scopeCorporateQuery
 * --------------------
 * Express helper (not middleware) — returns the numeric corporateId from
 * req.resolvedCorporate.  Throws if middleware wasn't run.
 */
export const scopeCorporateId = (req) => {
  if (!req.resolvedCorporate) {
    throw new Error('requireCorporateAccess middleware must run before scopeCorporateId()');
  }
  return req.resolvedCorporate.id;
};

export default { requireCorporateAccess, requireBrokerAccess, scopeCorporateId };
