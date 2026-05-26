import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createReferral, updateReferralStatus, getReferralsByPatient,
  recordEligibilityCheck,
  issueFitnessCertificate, getFitnessCertificatesByPatient,
  issueReturnToWorkClearance
} from '../services/corporate-hmis.service.js';

const router = express.Router();

// ── Corporate referrals ───────────────────────────────────────────────────────

// POST /api/v1/corporate/referral
router.post('/referral', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await createReferral({ ...req.body, organizationId, contactedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/corporate/referral/:referralId/status
router.patch('/referral/:referralId/status', authUser, async (req, res) => {
  try {
    const result = await updateReferralStatus(parseInt(req.params.referralId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/corporate/referral/patient/:patientId
router.get('/referral/patient/:patientId', authUser, async (req, res) => {
  try {
    const data = await getReferralsByPatient(parseInt(req.params.patientId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Eligibility ───────────────────────────────────────────────────────────────

// POST /api/v1/corporate/eligibility
router.post('/eligibility', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await recordEligibilityCheck({ ...req.body, organizationId, checkedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Fitness certificates ──────────────────────────────────────────────────────

// POST /api/v1/occupational-health/fitness-certificate
router.post('/fitness-certificate', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await issueFitnessCertificate({ ...req.body, organizationId, issuedBy: req.body.issuedBy || req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/occupational-health/fitness-certificate/patient/:patientId
router.get('/fitness-certificate/patient/:patientId', authUser, async (req, res) => {
  try {
    const data = await getFitnessCertificatesByPatient(parseInt(req.params.patientId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/occupational-health/return-to-work
router.post('/return-to-work', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await issueReturnToWorkClearance({ ...req.body, organizationId, issuedBy: req.body.issuedBy || req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
