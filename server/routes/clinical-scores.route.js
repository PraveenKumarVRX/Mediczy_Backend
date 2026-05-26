import { Router } from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { calculate, CALCULATORS } from '../services/clinical-scores.service.js';

const router = Router();

// GET /api/v1/scores — list available calculators
router.get('/', authUser, (_req, res) => {
  res.json({ success: true, data: Object.keys(CALCULATORS) });
});

// POST /api/v1/scores/:calculator — run a score
router.post('/:calculator', authUser, async (req, res) => {
  try {
    const result = calculate(req.params.calculator, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
