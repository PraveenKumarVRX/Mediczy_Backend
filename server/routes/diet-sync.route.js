/**
 * /api/diet — diet goals, food log and food search saved to the member's account.
 * Mounted beside routes/diet.route.js (POST /api/diet/generate, the stateless plan). Ring-fencing
 * already allows /api/diet for members. Every handler acts only on the member's own rows (RLS).
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  DietError, getGoals, saveGoals, getDay, addEntry, updateEntry, deleteEntry, summary, clearAll, searchFoods, getFood, todayIST,
  replaceDay, setWater,
} from '../services/diet-sync.service.js';

const router = express.Router();
const memberId = (req) => Number(req.user?.id);
const idParam = (value, what) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new DietError(400, 'invalid_request', `Invalid ${what} id`);
  return id;
};
const handle = (fn) => async (req, res) => {
  try {
    if (!memberId(req)) return res.status(401).json({ success: false, message: 'Sign in required' });
    return await fn(req, res);
  } catch (error) {
    if (error instanceof DietError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    console.error('[diet-sync]', error?.message || error);
    return res.status(500).json({ success: false, message: 'Could not load diet data' });
  }
};

router.get('/goals', authUser, handle(async (req, res) => res.json({ success: true, data: await getGoals(memberId(req)) })));
router.put('/goals', authUser, handle(async (req, res) => res.json({ success: true, data: await saveGoals(memberId(req), req.body) })));

router.get('/log', authUser, handle(async (req, res) => res.json({ success: true, data: await getDay(memberId(req), req.query.date || todayIST()) })));
router.post('/log', authUser, handle(async (req, res) => res.status(201).json({ success: true, data: await addEntry(memberId(req), req.body) })));
// Offline sync: replace one date's entries (and water) with what the app holds — repeatable.
router.put('/log/:date', authUser, handle(async (req, res) => res.json({ success: true, data: await replaceDay(memberId(req), req.params.date, req.body) })));
router.put('/water/:date', authUser, handle(async (req, res) => res.json({ success: true, data: await setWater(memberId(req), req.params.date, req.body?.waterMl) })));
router.patch('/log/:id', authUser, handle(async (req, res) => res.json({ success: true, data: await updateEntry(memberId(req), idParam(req.params.id, 'entry'), req.body) })));
router.delete('/log/:id', authUser, handle(async (req, res) => { await deleteEntry(memberId(req), idParam(req.params.id, 'entry')); res.json({ success: true }); }));

router.get('/summary', authUser, handle(async (req, res) => res.json({ success: true, data: await summary(memberId(req), String(req.query.from || ''), String(req.query.to || '')) })));
router.delete('/data', authUser, handle(async (req, res) => res.json({ success: true, data: await clearAll(memberId(req)) })));

router.get('/foods/search', authUser, handle(async (req, res) => res.json({ success: true, data: await searchFoods(req.query.q, req.query.limit) })));
router.get('/foods/:id', authUser, handle(async (req, res) => res.json({ success: true, data: await getFood(idParam(req.params.id, 'food')) })));

export default router;
