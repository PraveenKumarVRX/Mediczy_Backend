/**
 * Care Series — API routes (recurring-treatment workflow)
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import careSeries from '../services/care-series.service.js';

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

router.post('/series', ...clinicalOnly, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const { patientId, domainKey, seriesType, plannedSessions, protocolReference } = req.body;
    if (!patientId || !seriesType) return res.status(400).json({ success: false, error: 'patientId and seriesType are required' });
    const series = await careSeries.startSeries({
      patientId, organizationId: org, domainKey, seriesType, plannedSessions, protocolReference,
      createdBy: req.user?.email || req.user?.id || 'unknown',
    });
    res.status(201).json({ success: true, data: series });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.get('/patients/:patientId/series', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const series = await careSeries.getActiveSeriesForPatient(Number(req.params.patientId), org);
    res.json({ success: true, data: series });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/series/:id/complete', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const series = await careSeries.completeSeries(Number(req.params.id), org);
    res.json({ success: true, data: series });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/series/:id/sessions', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const { sessionNumber, scheduledAt } = req.body;
    if (!sessionNumber) return res.status(400).json({ success: false, error: 'sessionNumber is required' });
    const session = await careSeries.scheduleSession({ seriesId: Number(req.params.id), sessionNumber, scheduledAt, organizationId: org });
    res.status(201).json({ success: true, data: session });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/sessions/:id/record', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const { vitals, notes, status } = req.body;
    const session = await careSeries.recordSession({
      sessionId: Number(req.params.id), vitals, notes, status,
      recordedBy: req.user?.email || req.user?.id || 'unknown',
      organizationId: org,
    });
    res.json({ success: true, data: session });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.get('/series/:id/history', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const history = await careSeries.getSeriesHistory(Number(req.params.id), org);
    res.json({ success: true, data: history });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.get('/series/:id/guidance', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const guidance = await careSeries.getSeriesGuidance(Number(req.params.id), org);
    res.json({ success: true, data: guidance });
  } catch (e) {
    fail(res, e, 500);
  }
});

export default router;
