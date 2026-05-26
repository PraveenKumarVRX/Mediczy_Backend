import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createPreauthRequest, submitPreauth, updatePreauthStatus,
  attachDocument, getPreauthByAdmission, getPreauthList, getPreauthById
} from '../services/hmis-preauth.service.js';

const router = express.Router();

// POST /api/v1/insurance/preauth
router.post('/preauth', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await createPreauthRequest({ ...req.body, organizationId, submittedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/insurance/preauth/:preauthId/submit
router.post('/preauth/:preauthId/submit', authUser, async (req, res) => {
  try {
    const result = await submitPreauth(parseInt(req.params.preauthId), { submittedBy: req.user.id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/insurance/preauth/:preauthId/status
router.patch('/preauth/:preauthId/status', authUser, async (req, res) => {
  try {
    const result = await updatePreauthStatus(parseInt(req.params.preauthId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/insurance/preauth/:preauthId/document
router.post('/preauth/:preauthId/document', authUser, async (req, res) => {
  try {
    const result = await attachDocument({ ...req.body, preauthId: parseInt(req.params.preauthId), uploadedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/insurance/preauth  (list)
router.get('/preauth', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { status, limit, offset } = req.query;
    const data = await getPreauthList(organizationId, {
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/insurance/preauth/admission/:admissionId
router.get('/preauth/admission/:admissionId', authUser, async (req, res) => {
  try {
    const data = await getPreauthByAdmission(parseInt(req.params.admissionId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/insurance/preauth/:preauthId
router.get('/preauth/:preauthId', authUser, async (req, res) => {
  try {
    const data = await getPreauthById(parseInt(req.params.preauthId));
    if (!data) return res.status(404).json({ success: false, message: 'Pre-auth not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/insurance/case/:id/status — document §8 Phase 4
// Look up pre-auth status by admission ID (the "case" in insurance context)
router.get('/case/:id/status', authUser, async (req, res) => {
  try {
    const admissionId = parseInt(req.params.id);
    const records = await getPreauthByAdmission(admissionId);
    if (!records || records.length === 0) {
      return res.json({ success: true, data: { admissionId, preauthStatus: 'not_initiated', records: [] } });
    }
    const latest = records[0];
    res.json({
      success: true,
      data: {
        admissionId,
        preauthId:    latest.id,
        preauthStatus: latest.status,
        preAuthNumber: latest.pre_auth_number || null,
        approvedAmount: latest.approved_amount || null,
        validUntil:   latest.valid_until || null,
        denialReason: latest.denial_reason || null,
        records,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
