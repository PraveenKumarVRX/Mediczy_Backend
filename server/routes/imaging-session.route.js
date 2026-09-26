/**
 * Imaging session — short-lived PACS cookie for nginx auth_request on /pacs/*
 *
 * POST /api/imaging/session          — issue HttpOnly pacs_session cookie
 * GET  /api/imaging/session/validate — nginx auth_request (internal)
 * DELETE /api/imaging/session        — clear cookie
 */
import express from 'express';
import { resolveImagingTenantId } from '../utils/tenant-identity.js';
import jwt from 'jsonwebtoken';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { getOrthancHealth } from '../services/orthanc-pacs.service.js';
import pool from '../db/pgPool.js';

const router = express.Router();
const PACS_COOKIE = 'pacs_session';
const PACS_ROLES = new Set(['doctor', 'admin', 'hospital', 'lab', 'super-admin', 'medical_director']);
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 60 * 60 * 1000,
  path: '/',
};

function signPacsToken(user, tenantId) {
  return jwt.sign(
    {
      sub: user.id || user.userId,
      tenantId,
      role: user.role,
      purpose: 'pacs',
    },
    JWT_CONFIG.SECRET,
    { expiresIn: '1h' },
  );
}

// A doctor's own id is not a tenant — the hospital/lab whose PACS device produced the
// study is. Doctor JWTs carry no tenantId at all (see doctor.enhanced.route.js), so the
// naive `user.tenantId || user.id` fallback used to sign a session scoped to the doctor's
// own id, which never matches any real hg_dicom_studies row. Resolve the real tenant from
// the specific study the doctor is entitled to view via a ris_studies referral, so the
// session is scoped only to what they were actually referred, not a blanket tenant grant.
async function resolveTenantId(user, studyInstanceUID) {
  // Audit follow-up: the old fallbacks used `user.id` as a tenant "that won't resolve this study". That only holds
  // while the account id happens to equal no imaging tenant — doctor 70 equals tenant 70. The safe "resolves nothing"
  // tenant is NO tenant: the viewer opens and simply shows no data.
  if (user.role !== 'doctor') return resolveImagingTenantId(user);   // explicit tenantId, or a legacy lab/hospital account id
  if (!studyInstanceUID) return null;                                // no study context — session resolves no data
  const referral = await pool.query(
    `SELECT lab_id, tenant_id FROM ris_studies WHERE referring_doctor_id = $1 AND study_instance_uid = $2 LIMIT 1`,
    [user.id, studyInstanceUID],
  );
  if (!referral.rows.length) return null;                            // not entitled — resolves nothing
  return referral.rows[0]?.tenant_id || referral.rows[0]?.lab_id || null;
}

function authImagingUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authUser(req, res, () => {
      if (!PACS_ROLES.has(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Imaging access denied for this role' });
      }
      return next();
    });
  }
  return authLab(req, res, () => {
    req.user = {
      id: req.lab?.id,
      tenantId: req.lab?.id,
      role: 'lab',
      name: req.lab?.labName || req.lab?.name,
    };
    return next();
  });
}

router.post('/session', authImagingUser, async (req, res) => {
  const tenantId = await resolveTenantId(req.user, req.body?.studyInstanceUID);
  const token = signPacsToken(req.user, tenantId);
  res.cookie(PACS_COOKIE, token, COOKIE_OPTS);
  const orthanc = await getOrthancHealth();
  return res.json({
    success: true,
    expiresIn: 3600,
    ohifBasePath: '/ohif',
    viewerPath: '/ohif/viewer',
    orthanc: orthanc.ok ? { ok: true, name: orthanc.name } : { ok: false },
  });
});

router.get('/session/validate', (req, res) => {
  const token = req.cookies?.[PACS_COOKIE];
  if (!token) return res.status(401).end();
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    if (decoded.purpose !== 'pacs') return res.status(401).end();
    return res.status(200).end();
  } catch {
    return res.status(401).end();
  }
});

router.delete('/session', (_req, res) => {
  res.clearCookie(PACS_COOKIE, { path: '/' });
  return res.json({ success: true });
});

router.get('/health', async (_req, res) => {
  const orthanc = await getOrthancHealth();
  res.json({ success: true, service: 'imaging-session', orthanc });
});

export default router;
