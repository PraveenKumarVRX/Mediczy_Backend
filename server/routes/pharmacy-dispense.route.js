/** GAP-IPD-004 — Pharmacy dispense from eMAR bridge */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { listPendingDispense, markDispensed } from '../services/emar-pharmacy-bridge.service.js';

const router = express.Router();
const orgId = (req) => req.user.organization_id || req.user.tenant_id || req.user.id;

router.get('/pending', authUser, async (req, res) => {
  const data = await listPendingDispense(orgId(req), { wardId: req.query.wardId ? parseInt(req.query.wardId, 10) : undefined });
  res.json({ success: true, data });
});

router.post('/:id/dispense', authUser, async (req, res) => {
  const row = await markDispensed(parseInt(req.params.id, 10), orgId(req), req.user.id);
  res.json({ success: true, data: row });
});

export default router;
