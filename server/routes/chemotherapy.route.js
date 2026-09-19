/**
 * Chemotherapy Module — API routes
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import chemotherapy from '../services/chemotherapy.service.js';

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

router.post('/sessions/:sessionId/detail', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const detail = await chemotherapy.recordCycleDetail(Number(req.params.sessionId), {
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
    const detail = await chemotherapy.getCycleDetail(Number(req.params.sessionId), org);
    res.json({ success: true, data: detail });
  } catch (e) {
    fail(res, e, 500);
  }
});

// Urgent, single-tap action — does not require the full cycle form to exist first.
router.post('/sessions/:sessionId/extravasation', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const detail = await chemotherapy.flagExtravasation(Number(req.params.sessionId), {
      actionTaken: req.body?.actionTaken,
      recordedBy: req.user?.email || req.user?.id || 'unknown',
    }, org);
    res.status(201).json({ success: true, data: detail });
  } catch (e) {
    fail(res, e, 500);
  }
});

router.post('/sessions/:sessionId/readings', ...clinicalOnly, async (req, res) => {
  try {
    const org = requireOrg(req, res);
    if (!org) return;
    const detail = await chemotherapy.addInfusionReading(Number(req.params.sessionId), req.body, org);
    res.status(201).json({ success: true, data: detail });
  } catch (e) {
    fail(res, e, 400);
  }
});

export default router;
