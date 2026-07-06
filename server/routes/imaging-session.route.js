/**
 * Imaging session — short-lived PACS cookie for nginx auth_request on /pacs/*
 *
 * POST /api/imaging/session          — issue HttpOnly pacs_session cookie
 * GET  /api/imaging/session/validate — nginx auth_request (internal)
 * DELETE /api/imaging/session        — clear cookie
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { getOrthancHealth } from '../services/orthanc-pacs.service.js';

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

function signPacsToken(user) {
  return jwt.sign(
    {
      sub: user.id || user.userId,
      tenantId: user.tenantId || user.id,
      role: user.role,
      purpose: 'pacs',
    },
    JWT_CONFIG.SECRET,
    { expiresIn: '1h' },
  );
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
  const token = signPacsToken(req.user);
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
