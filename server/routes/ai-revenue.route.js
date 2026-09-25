/**
 * AI Revenue Intelligence Routes
 * GET  /api/v1/ai-revenue/billing-gaps         — uncaptured revenue opportunities
 * GET  /api/v1/ai-revenue/leakage-score        — overall revenue health score
 * POST /api/v1/ai-revenue/smart-orders         — AI order set by diagnosis
 * GET  /api/v1/ai-revenue/denial-risk          — claim denial risk scoring
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  getBillingGapAnalysis,
  getRevenueLeakageScore,
  getSmartOrderSets,
  getDenialRiskScoring,
  runClaimScrubShadow,
} from '../services/ai-revenue-intelligence.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();
const orgId = req => resolveTenantId(req.user);

// GET /api/v1/ai-revenue/billing-gaps
router.get('/billing-gaps', authUser, async (req, res) => {
  try {
    const data = await getBillingGapAnalysis(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ai-revenue/leakage-score
router.get('/leakage-score', authUser, async (req, res) => {
  try {
    const data = await getRevenueLeakageScore(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/ai-revenue/smart-orders
router.post('/smart-orders', authUser, async (req, res) => {
  try {
    const { diagnosisCode, admissionType, patientId } = req.body;
    if (!diagnosisCode) return res.status(400).json({ success: false, message: 'diagnosisCode is required' });
    const data = await getSmartOrderSets({
      diagnosisCode, admissionType, patientId,
      organizationId: orgId(req),
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ai-revenue/denial-risk
router.get('/denial-risk', authUser, async (req, res) => {
  try {
    const data = await getDenialRiskScoring(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/ai-revenue/claim-scrub-shadow/:authId — Upgrade Plan Phase B4
// Shadow mode only: computes and logs an AI coding-vs-documentation scrub,
// admin-only diagnostic. Not exposed to coding staff until its accuracy has
// been reviewed against real adjudicated outcomes (see plan exit criteria).
router.post('/claim-scrub-shadow/:authId', authUser, requireRole(['admin', 'system_admin']), async (req, res) => {
  try {
    const data = await runClaimScrubShadow(req.params.authId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
