import express from 'express';
import { hospitalContextFromToken } from '../middleware/hospitalContext.middleware.js';
import {
  createEstimate, getEstimatesByAdmission, updateEstimateStatus,
  addNonPayableItem, getNonPayableItems, syncOtConsumablesToEstimate
} from '../services/billing-estimate.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();
router.use(hospitalContextFromToken);

const orgId = (req) => req.hospitalId || req.hospitalOrgId || resolveTenantId(req.user);

// POST /api/v1/billing/estimate
router.post('/estimate', async (req, res) => {
  try {
    const result = await createEstimate({ ...req.body, organizationId: orgId(req), preparedBy: req.userId || req.user?.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/billing/estimate/:admissionId
router.get('/estimate/:admissionId', async (req, res) => {
  try {
    const data = await getEstimatesByAdmission(parseInt(req.params.admissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/billing/estimate/:estimateId/status
router.patch('/estimate/:estimateId/status', async (req, res) => {
  try {
    const result = await updateEstimateStatus(parseInt(req.params.estimateId), req.body.status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/billing/estimate/:estimateId/sync-ot
router.post('/estimate/:estimateId/sync-ot', async (req, res) => {
  try {
    const result = await syncOtConsumablesToEstimate(
      parseInt(req.body.admissionId),
      parseInt(req.params.estimateId),
      orgId(req)
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/billing/non-payable
router.post('/non-payable', async (req, res) => {
  try {
    const result = await addNonPayableItem({ ...req.body, organizationId: orgId(req), approvedBy: req.userId || req.user?.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/billing/non-payable/:admissionId
router.get('/non-payable/:admissionId', async (req, res) => {
  try {
    const data = await getNonPayableItems(parseInt(req.params.admissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
