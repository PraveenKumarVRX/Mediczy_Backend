import express from 'express';
import {
  hospitalRegister,
  hospitalLogin,
  hospitalLoginV2,
  hospitalLoginTenant,
  hospitalProfile,
  hospitalCreateCorporate,
  hospitalListCorporates,
  hospitalVerify,
  hospitalLogout
} from '../hospital-auth.route.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';

const router = express.Router();

// Backwards-compatible aliases (no /auth prefix)
router.post('/register', hospitalRegister);
router.post('/login', authLimiter, hospitalLogin);
router.post('/login/v2', authLimiter, hospitalLoginV2);
router.post('/login-tenant', authLimiter, hospitalLoginTenant);
router.get('/profile', authUser, requireRole('hospital'), hospitalProfile);
router.get('/verify', hospitalVerify);
router.post('/logout', hospitalLogout);
router.post('/corporates', authUser, requireRole('hospital'), hospitalCreateCorporate);
router.get('/corporates', authUser, requireRole('hospital'), hospitalListCorporates);

export default router;
