/**
 * Dialysis Module — API routes
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import dialysis from '../services/dialysis.service.js';

const router = express.Router();
const clinicalOnly = [authUser, requireRole(['doctor', 'nurse', 'admin', 'medical_director'])];

// Tenant isolation: org comes from the JWT only (never from body/params).
function orgId(req) {
  const raw = req.user?.organization_id || req.user?.tenant_id || req.hospitalId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Resolves the caller's org or answers 400. Returns null if the response was sent. */
function requireOrg(req, res) {
  const org = orgId(req);
  if (!org) {
    res.status(400).json({ success: false, error: 'Organization context missing' });
    return null;
  }
  return org;
}

/** NotFoundError/BadRequestError carry .status; anything else falls back to the route default. */
function fail(res, e, fallback = 500) {
  res.status(e?.status || fallback).json({ success: false, error: e.message });
}

// ── Session detail ───────────────────────────────────────────────────────────
router.post('/sessions/:sessionId/detail', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const detail = await dialysis.recordSessionDetail(Number(req.params.sessionId), {
      ...req.body,
      recordedBy: req.user?.email || req.user?.id || 'unknown',
    }, org);
    res.status(201).json({ success: true, data: detail });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.get('/sessions/:sessionId/detail', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const detail = await dialysis.getSessionDetail(Number(req.params.sessionId), org);
    res.json({ success: true, data: detail });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/sessions/:sessionId/readings', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const detail = await dialysis.addIntraSessionReading(Number(req.params.sessionId), req.body, org);
    res.status(201).json({ success: true, data: detail });
  } catch (e) {
    fail(res, e, 400);
  }
});

// ── Medication administration ───────────────────────────────────────────────
router.post('/sessions/:sessionId/medications', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const admin = await dialysis.recordMedicationAdministration(Number(req.params.sessionId), {
      ...req.body,
      administeredBy: req.user?.email || req.user?.id || 'unknown',
    }, org);
    res.status(201).json({ success: true, data: admin });
  } catch (e) {
    fail(res, e, 400);
  }
});

router.get('/sessions/:sessionId/medications', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const meds = await dialysis.listMedicationAdministrations(Number(req.params.sessionId), org);
    res.json({ success: true, data: meds });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ── Chairs ───────────────────────────────────────────────────────────────
router.post('/chairs', ...clinicalOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const { branchId, chairNumber } = req.body;
    if (!chairNumber) return res.status(400).json({ success: false, error: 'chairNumber is required' });
    const chair = await dialysis.createChair({ organizationId: org, branchId, chairNumber });
    res.status(201).json({ success: true, data: chair });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.get('/chairs', ...clinicalOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const chairs = await dialysis.listChairs(org);
    res.json({ success: true, data: chairs });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ── Recurring schedule ───────────────────────────────────────────────────
router.post('/schedules', ...clinicalOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const { patientId, seriesId, chairId, daysOfWeek, shift, sessionDurationMinutes, startDate, endDate } = req.body;
    if (!patientId) return res.status(400).json({ success: false, error: 'patientId is required' });
    const schedule = await dialysis.createRecurringSchedule({
      patientId, organizationId: org, seriesId, chairId, daysOfWeek, shift, sessionDurationMinutes, startDate, endDate,
    });
    res.status(201).json({ success: true, data: schedule });
  } catch (e) {
    fail(res, e, 400);
  }
});

router.get('/patients/:patientId/schedule', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const schedule = await dialysis.getActiveScheduleForPatient(Number(req.params.patientId), org);
    res.json({ success: true, data: schedule });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/schedules/:id/pause', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const schedule = await dialysis.pauseSchedule(Number(req.params.id), org);
    res.json({ success: true, data: schedule });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/schedules/:id/generate-sessions', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const created = await dialysis.generateUpcomingSessions(Number(req.params.id), org, req.body || {});
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    fail(res, e, 400);
  }
});

export default router;
