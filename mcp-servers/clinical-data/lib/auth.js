/**
 * Authentication/authorization for clinical tools — deliberately NOT a
 * parallel auth system. Every tool call must carry a real, currently-valid
 * JWT issued by the live app's own login flow; this verifies it with the
 * exact same secret (`server/config/auth.config.js`'s JWT_CONFIG) the main
 * app uses, then hands the decoded identity to the exact same
 * assertStudyAccess() function the live RIS/doctor routes call for every
 * request. A caller with an expired, forged, or wrong-tenant token gets
 * rejected exactly as it would by the real API — this tool surface has no
 * weaker (or stronger) authorization than the app it wraps.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../../server/config/auth.config.js';
import { assertStudyAccess } from '../../../server/services/imaging/imaging-study-access.service.js';

export function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('A valid session token is required (the "token" argument)');
    err.status = 401;
    throw err;
  }
  try {
    return jwt.verify(token, JWT_CONFIG.SECRET);
  } catch (e) {
    const err = new Error(`Invalid or expired token: ${e.message}`);
    err.status = 401;
    throw err;
  }
}

/** Builds the minimal req-shaped object assertStudyAccess() actually reads
 * (req.user.*, req.lab.id) from a verified JWT payload — the same shapes
 * real login flows already issue (lab: {id/labId, role:'lab'}; doctor:
 * {id, role:'doctor'}; admin/hospital/medical_director: {id, role}). */
function buildReqLike(decoded) {
  const req = { user: decoded };
  if (decoded.role === 'lab') {
    req.lab = { id: decoded.id || decoded.labId };
  }
  return req;
}

/** Verify the token AND that this identity may access this specific study.
 * Throws (status 401/403/404) exactly as the real API would — never
 * silently narrows to "no data", since that would hide a real access
 * problem from the caller instead of surfacing it. */
export async function authorizeStudyAccess(token, studyId) {
  const decoded = verifyToken(token);
  const reqLike = buildReqLike(decoded);
  const { study, tenantId } = await assertStudyAccess(studyId, reqLike);
  return { decoded, study, tenantId };
}
