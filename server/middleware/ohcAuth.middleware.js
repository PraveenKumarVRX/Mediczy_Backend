/** Authentication for the OHC workspace and for care-unit administration. Factories: the pool/service/token store are injected. */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { OHC_AUDIENCE } from '../services/care-units/ohc.service.js';

const deny = (res, status, code, message) => res.status(status).json({ success: false, code, message });

export function createAuthOhc({ ohc, isTokenRevoked = async () => false }) {
  return async function authOhc(req, res, next) {
    try {
      const h = req.headers.authorization;
      if (!h?.startsWith('Bearer ')) return deny(res, 401, 'unauthenticated', 'No token provided');
      let d;
      try { d = jwt.verify(h.slice(7), JWT_CONFIG.SECRET); }
      catch (e) { return deny(res, 401, e.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token', 'Invalid or expired token'); }
      if (d.aud !== OHC_AUDIENCE || d.userType !== 'ohc' || !['ohc_doctor', 'ohc_staff'].includes(d.role) || d.tokenType !== 'access' || !d.id) {
        return deny(res, 403, 'wrong_account_type', 'Not an OHC account');
      }
      if (await isTokenRevoked(d.jti)) return deny(res, 401, 'token_revoked', 'Session has been revoked');
      const { principal } = await ohc.loadPrincipal(d.id);
      if (!principal) return deny(res, 403, 'account_unavailable', 'This account is not currently active at an OHC');
      req.ohc = principal;
      return next();
    } catch (err) { console.error('[authOhc]', err.message); return deny(res, 500, 'auth_error', 'Authentication error'); }
  };
}

/**
 * Hospital / clinic administrator → the operator they administer. The operator is read from the DATABASE (users.organization_uid, or
 * the tenant id for the legacy hospital account), never from a client claim, and must be a hospital or clinic.
 */
export function createAuthOperatorAdmin({ pool }) {
  return async function authOperatorAdmin(req, res, next) {
    try {
      const h = req.headers.authorization;
      if (!h?.startsWith('Bearer ')) return deny(res, 401, 'unauthenticated', 'No token provided');
      let d;
      try { d = jwt.verify(h.slice(7), JWT_CONFIG.SECRET); } catch { return deny(res, 401, 'invalid_token', 'Invalid or expired token'); }
      const role = d.role || d.userType;
      let ownerUid = null;
      if (role === 'hospital' && d.id) {   // the legacy hospital account: the row id IS the tenant id (utils/tenant-identity.js)
        const { rows } = await pool.query(`SELECT unique_id FROM tenants WHERE id = $1 AND type::text = 'hospital'`, [d.id]);
        ownerUid = rows[0]?.unique_id || null;
      } else if (['hospital_admin', 'clinic_admin'].includes(role) && d.id) {
        const { rows } = await pool.query(`SELECT organization_uid FROM users WHERE id = $1 AND role = $2 AND status::text = 'active'`, [d.id, role]);
        ownerUid = rows[0]?.organization_uid || null;
      } else {
        return deny(res, 403, 'forbidden', 'Only a hospital or clinic administrator can manage care units');
      }
      if (!ownerUid) return deny(res, 403, 'TENANT_CONTEXT_REQUIRED', 'This account is not attached to a hospital or clinic');
      const kind = (await pool.query(`SELECT kind FROM entity_registry WHERE uid = $1 AND retired_at IS NULL`, [ownerUid])).rows[0]?.kind;
      if (!['hospital', 'clinic'].includes(kind)) return deny(res, 403, 'forbidden', 'Care units belong to a hospital or clinic');
      req.operator = { type: 'operator', ownerUid, ref: `operator:${ownerUid}:${d.id}` };
      return next();
    } catch (err) { console.error('[authOperatorAdmin]', err.message); return deny(res, 500, 'auth_error', 'Authentication error'); }
  };
}
