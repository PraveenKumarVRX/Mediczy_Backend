/**
 * Phlebotomist authentication.
 *
 * Accepts only an ACCESS token issued for the phlebotomy audience. A lab token, a doctor token or a patient token
 * carries a different role/audience and is refused here, and a phlebotomist token is refused by every other
 * portal's middleware (none of them accept role 'phlebotomist', and ring-fencing confines it to /api/phlebotomy).
 * The worker's current standing — status, qualification, memberships, owner status — is re-read from the
 * database on every request.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { PHLEBOTOMY_AUDIENCE } from '../services/collection/phlebotomist.service.js';

const deny = (res, status, code, message) => res.status(status).json({ success: false, code, message });

export function createAuthPhlebotomist({ phlebotomistService, isTokenRevoked = async () => false }) {
  return async function authPhlebotomist(req, res, next) {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return deny(res, 401, 'unauthenticated', 'No token provided');
      let decoded;
      try {
        decoded = jwt.verify(header.slice(7), JWT_CONFIG.SECRET);
      } catch (err) {
        return deny(res, 401, err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token', 'Invalid or expired token');
      }
      if (decoded.role !== 'phlebotomist' || decoded.aud !== PHLEBOTOMY_AUDIENCE || decoded.tokenType !== 'access' || !decoded.id) {
        return deny(res, 403, 'wrong_account_type', 'Not a phlebotomist account');
      }
      if (await isTokenRevoked(decoded.jti)) return deny(res, 401, 'token_revoked', 'Session has been revoked');

      const { principal } = await phlebotomistService.loadPrincipal(decoded.id);
      if (!principal) return deny(res, 403, 'account_unavailable', 'This account is not currently active');
      const expectedOwnerUid = req.mobileTenant?.config.apps.find(app => app.product === 'phlebo')?.ownerUid;
      if (req.mobileTenant && !expectedOwnerUid) return deny(res, 403, 'wrong_organisation', 'Collection owner is not configured.');
      if (expectedOwnerUid) {
        principal.memberships = principal.memberships.filter(m => m.ownerUid === expectedOwnerUid);
        if (!principal.memberships.length) return deny(res, 403, 'wrong_organisation', 'Account does not belong to this organisation.');
      }
      req.phleb = principal;
      return next();
    } catch (err) {
      console.error('[authPhlebotomist] error:', err.message);
      return deny(res, 500, 'auth_error', 'Authentication error');
    }
  };
}
