import { Router } from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  searchDrug, getDrugById, getRenalAdjustment, listRenalAdjustments,
  searchKnowledge,
  listProcedures, getProcedure,
  getPregnancyCategory,
} from '../services/bedside-reference.service.js';

const router = Router();

// ── Drug formulary ───────────────────────────────────────────────────────────

// GET /api/v1/reference/drugs?q=metformin&limit=10
router.get('/drugs', authUser, async (req, res) => {
  try {
    const { q = '', limit = 10 } = req.query;
    if (q.length < 2) return res.status(400).json({ success: false, message: 'Query must be at least 2 characters' });
    const drugs = await searchDrug(q, parseInt(limit));
    res.json({ success: true, data: drugs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reference/drugs/:id
router.get('/drugs/:id', authUser, async (req, res) => {
  try {
    const drug = await getDrugById(req.params.id);
    if (!drug) return res.status(404).json({ success: false, message: 'Drug not found' });
    res.json({ success: true, data: drug });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reference/drugs/renal?generic=ramipril
router.get('/drugs/renal', authUser, (req, res) => {
  const { generic } = req.query;
  if (!generic) return res.status(400).json({ success: false, message: 'generic param required' });
  const adjustment = getRenalAdjustment(generic);
  res.json({ success: true, data: adjustment });
});

// GET /api/v1/reference/drugs/renal-table — full renal adjustment table
router.get('/drugs/renal-table', authUser, (_req, res) => {
  res.json({ success: true, data: listRenalAdjustments() });
});

// ── Knowledge base search ────────────────────────────────────────────────────

// POST /api/v1/reference/search — semantic knowledge base search
router.post('/search', authUser, async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    if (!query || query.trim().length < 3) return res.status(400).json({ success: false, message: 'query must be at least 3 characters' });
    const results = await searchKnowledge(query, Math.min(parseInt(limit), 20));
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Procedure checklists ─────────────────────────────────────────────────────

// GET /api/v1/reference/procedures — list all procedures
router.get('/procedures', authUser, (_req, res) => {
  res.json({ success: true, data: listProcedures() });
});

// GET /api/v1/reference/procedures/:id — get checklist for a procedure
router.get('/procedures/:id', authUser, (req, res) => {
  const proc = getProcedure(req.params.id);
  if (!proc) return res.status(404).json({ success: false, message: 'Procedure not found' });
  res.json({ success: true, data: proc });
});

export default router;
