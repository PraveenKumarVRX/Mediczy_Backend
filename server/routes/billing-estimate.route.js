import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createEstimate, getEstimatesByAdmission, updateEstimateStatus,
  addNonPayableItem, getNonPayableItems, syncOtConsumablesToEstimate
} from '../services/billing-estimate.service.js';

const router = express.Router();

// POST /api/v1/billing/estimate
router.post('/estimate', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await createEstimate({ ...req.body, organizationId, preparedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/billing/estimate/:admissionId
router.get('/estimate/:admissionId', authUser, async (req, res) => {
  try {
    const data = await getEstimatesByAdmission(parseInt(req.params.admissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/billing/estimate/:estimateId/status
router.patch('/estimate/:estimateId/status', authUser, async (req, res) => {
  try {
    const result = await updateEstimateStatus(parseInt(req.params.estimateId), req.body.status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/billing/estimate/:estimateId/sync-ot
router.post('/estimate/:estimateId/sync-ot', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await syncOtConsumablesToEstimate(
      parseInt(req.body.admissionId),
      parseInt(req.params.estimateId),
      organizationId
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/billing/non-payable
router.post('/non-payable', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await addNonPayableItem({ ...req.body, organizationId, approvedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/billing/non-payable/:admissionId
router.get('/non-payable/:admissionId', authUser, async (req, res) => {
  try {
    const data = await getNonPayableItems(parseInt(req.params.admissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
