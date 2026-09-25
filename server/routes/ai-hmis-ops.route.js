/**
 * AI HMIS Operations Routes
 * GET  /api/v1/ai-ops/capacity-forecast        — 24h bed census prediction
 * GET  /api/v1/ai-ops/documentation-audit      — missing docs across active admissions
 * GET  /api/v1/ai-ops/workload-balance         — ward nurse workload analysis
 * POST /api/v1/ai-ops/bed-allocation           — smart bed recommendation
 * GET  /api/v1/ai-ops/discharge-summary/:id    — structured discharge data synthesis
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getCapacityForecast,
  getDocumentationAudit,
  getWorkloadBalance,
  getSmartBedAllocation,
  getDischargeSummaryData,
} from '../services/ai-hmis-ops.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();
const orgId = req => resolveTenantId(req.user);

// GET /api/v1/ai-ops/capacity-forecast?hours=24
router.get('/capacity-forecast', authUser, async (req, res) => {
  try {
    const horizonHours = Math.min(parseInt(req.query.hours) || 24, 72);
    const data = await getCapacityForecast(orgId(req), { horizonHours });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ai-ops/documentation-audit
router.get('/documentation-audit', authUser, async (req, res) => {
  try {
    const data = await getDocumentationAudit(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ai-ops/workload-balance
router.get('/workload-balance', authUser, async (req, res) => {
  try {
    const data = await getWorkloadBalance(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/ai-ops/bed-allocation
router.post('/bed-allocation', authUser, async (req, res) => {
  try {
    const { admissionType, diagnosisCode, gender, requiresIsolation, requiresIcu } = req.body;
    const data = await getSmartBedAllocation({
      admissionType, diagnosisCode, gender,
      requiresIsolation: Boolean(requiresIsolation),
      requiresIcu: Boolean(requiresIcu),
      organizationId: orgId(req),
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ai-ops/discharge-summary/:admissionId
router.get('/discharge-summary/:admissionId', authUser, async (req, res) => {
  try {
    const data = await getDischargeSummaryData(parseInt(req.params.admissionId), orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

export default router;
