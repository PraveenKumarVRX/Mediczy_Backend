/** GAP-UX-001 — Staff SSO token exchange across portals */
import express from 'express';
import jwt from 'jsonwebtoken';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET || 'dev-secret';

router.post('/exchange', authUser, (req, res) => {
  const { targetPortal } = req.body;
  const payload = {
    sub: req.user.id,
    role: req.user.role,
    organization_id: req.user.organization_id || req.user.tenant_id,
    portal: targetPortal || 'hospital',
    type: 'sso_exchange',
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
  res.json({
    success: true,
    token,
    redirect: targetPortal === 'hmis' ? '/hmis/command-center' : '/hospital/dashboard',
    expiresIn: 900,
  });
});

router.get('/session', authUser, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      role: req.user.role,
      organization_id: req.user.organization_id || req.user.tenant_id,
    },
    portals: ['hospital', 'hmis', 'doctor', 'admin'],
  });
});

export default router;
