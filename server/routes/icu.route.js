import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import {
  admitToICU, dischargeFromICU, getActiveICUAdmission, getICUCensus,
  chartVentilator, getVentilatorCharts,
  recordDrip, getActiveDrips,
  setDailyGoals, getLatestGoals,
  recordSeverityScore, getScoreHistory,
  logICUEvent, getICUEvents,
  getICUSummary
} from '../services/icu.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// ── ICU admissions ────────────────────────────────────────────────────────────

// POST /api/v1/icu/admit
router.post('/admit', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await admitToICU({ ...req.body, organizationId, admittingDoctorId: req.body.admittingDoctorId || req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const status = err.code === '23505' || err.message?.includes('already') ? 409 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/v1/icu/:icuAdmissionId/discharge
router.post('/:icuAdmissionId/discharge', authUser, requireModule('icu'), async (req, res) => {
  try {
    const result = await dischargeFromICU(parseInt(req.params.icuAdmissionId), {
      dischargeDestination: req.body.dischargeDestination,
      dischargedBy: req.user.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/admission/:admissionId
router.get('/admission/:admissionId', authUser, requireModule('icu'), async (req, res) => {
  try {
    const result = await getActiveICUAdmission(parseInt(req.params.admissionId));
    if (!result) return res.status(404).json({ success: false, message: 'No active ICU admission' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/census
router.get('/census', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getICUCensus(organizationId, req.query.unit);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/:icuAdmissionId/summary
router.get('/:icuAdmissionId/summary', authUser, requireModule('icu'), async (req, res) => {
  try {
    const data = await getICUSummary(parseInt(req.params.icuAdmissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Ventilator charting ───────────────────────────────────────────────────────

// POST /api/v1/icu/:icuAdmissionId/ventilator
router.post('/:icuAdmissionId/ventilator', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await chartVentilator({ ...req.body, icuAdmissionId: parseInt(req.params.icuAdmissionId), organizationId, chartedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/:icuAdmissionId/ventilator
router.get('/:icuAdmissionId/ventilator', authUser, requireModule('icu'), async (req, res) => {
  try {
    const data = await getVentilatorCharts(parseInt(req.params.icuAdmissionId), {
      limit: req.query.limit ? parseInt(req.query.limit) : 24
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Drip records ──────────────────────────────────────────────────────────────

// POST /api/v1/icu/:icuAdmissionId/drips
router.post('/:icuAdmissionId/drips', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await recordDrip({ ...req.body, icuAdmissionId: parseInt(req.params.icuAdmissionId), organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/:icuAdmissionId/drips
router.get('/:icuAdmissionId/drips', authUser, requireModule('icu'), async (req, res) => {
  try {
    const data = await getActiveDrips(parseInt(req.params.icuAdmissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Daily goals ───────────────────────────────────────────────────────────────

// POST /api/v1/icu/:icuAdmissionId/goals
router.post('/:icuAdmissionId/goals', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await setDailyGoals({ ...req.body, icuAdmissionId: parseInt(req.params.icuAdmissionId), organizationId, setBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/:icuAdmissionId/goals
router.get('/:icuAdmissionId/goals', authUser, requireModule('icu'), async (req, res) => {
  try {
    const data = await getLatestGoals(parseInt(req.params.icuAdmissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Severity scoring ──────────────────────────────────────────────────────────

// POST /api/v1/icu/:icuAdmissionId/score
router.post('/:icuAdmissionId/score', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await recordSeverityScore({ ...req.body, icuAdmissionId: parseInt(req.params.icuAdmissionId), organizationId, scoredBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/:icuAdmissionId/score
router.get('/:icuAdmissionId/score', authUser, requireModule('icu'), async (req, res) => {
  try {
    const data = await getScoreHistory(parseInt(req.params.icuAdmissionId), req.query.type);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ICU events ────────────────────────────────────────────────────────────────

// POST /api/v1/icu/:icuAdmissionId/events
router.post('/:icuAdmissionId/events', authUser, requireModule('icu'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await logICUEvent({ ...req.body, icuAdmissionId: parseInt(req.params.icuAdmissionId), organizationId, reportedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/icu/:icuAdmissionId/events
router.get('/:icuAdmissionId/events', authUser, requireModule('icu'), async (req, res) => {
  try {
    const data = await getICUEvents(parseInt(req.params.icuAdmissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
