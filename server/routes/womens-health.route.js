/**
 * /api/wellness/womens-health — period log, cycle estimates and the opt-in setting for the
 * member app. Lives under /api/wellness, which ring-fencing already allows for members, so no
 * new API prefix. Every handler acts only on the signed-in member's own rows (FORCED RLS).
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  WomensHealthError, getOverview, saveSettings, addCycle, updateCycle, deleteCycle, clearAll,
} from '../services/womens-health.service.js';

const router = express.Router();

const memberId = (req) => Number(req.user?.id);
const cycleId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new WomensHealthError(400, 'invalid_request', 'Invalid period id');
  return id;
};

const handle = (fn) => async (req, res) => {
  try {
    if (!memberId(req)) return res.status(401).json({ success: false, message: 'Sign in required' });
    return await fn(req, res);
  } catch (error) {
    if (error instanceof WomensHealthError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('[womens-health]', error?.message || error);
    return res.status(500).json({ success: false, message: "Could not load women's health data" });
  }
};

router.get('/', authUser, handle(async (req, res) => {
  res.json({ success: true, data: await getOverview(memberId(req), { gender: req.user.gender ?? req.user.dataValues?.gender }) });
}));

router.put('/settings', authUser, handle(async (req, res) => {
  res.json({ success: true, data: await saveSettings(memberId(req), req.body) });
}));

router.post('/cycles', authUser, handle(async (req, res) => {
  res.status(201).json({ success: true, data: await addCycle(memberId(req), req.body) });
}));

router.patch('/cycles/:id', authUser, handle(async (req, res) => {
  res.json({ success: true, data: await updateCycle(memberId(req), cycleId(req), req.body) });
}));

router.delete('/cycles/:id', authUser, handle(async (req, res) => {
  await deleteCycle(memberId(req), cycleId(req));
  res.json({ success: true });
}));

router.delete('/', authUser, handle(async (req, res) => {
  res.json({ success: true, data: await clearAll(memberId(req)) });
}));

export default router;
