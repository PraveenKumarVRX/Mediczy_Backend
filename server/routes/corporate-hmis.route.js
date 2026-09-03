import express from 'express';
import { authCorporate } from '../middleware/corporate.middleware.js';
import {
  createReferral, updateReferralStatus, getReferralsByPatient,
  recordEligibilityCheck,
  issueFitnessCertificate, getFitnessCertificatesByPatient,
  issueReturnToWorkClearance
} from '../services/corporate-hmis.service.js';

const router = express.Router();

// Fitness certificates and return-to-work clearances are clinical
// documents — issuing them should come from the corporate's own clinical
// staff: OHC (a day-care clinic owned/run by the corporate, role:
// corporate_ohc) or CMO (role: corporate_cmo). Plain hr_staff, and any
// other authCorporate session, can view but not issue one on their own
// say-so; the super-HR (corporate_admin) and root corporate login retain
// override access since they're accountable for the whole account.
const CLINICAL_ISSUER_ROLES = ['corporate', 'corporate_admin', 'corporate_cmo', 'corporate_ohc'];
function requireClinicalIssuer(req, res) {
  if (!CLINICAL_ISSUER_ROLES.includes(req.user?.role)) {
    res.status(403).json({
      success: false,
      message: 'Only the corporate\'s OHC/CMO staff or the account owner can issue this',
    });
    return false;
  }
  return true;
}

const corporateIdOf = (req) => req.user?.corporateId || req.user?.organization_id;
const issuerIdOf = (req) => req.user?.userId || req.user?.id;

// ── Corporate referrals ───────────────────────────────────────────────────────

// POST /api/v1/corporate/referral
router.post('/referral', authCorporate, async (req, res) => {
  try {
    const organizationId = corporateIdOf(req);
    const result = await createReferral({ ...req.body, organizationId, contactedBy: issuerIdOf(req) });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/corporate/referral/:referralId/status
router.patch('/referral/:referralId/status', authCorporate, async (req, res) => {
  try {
    const result = await updateReferralStatus(parseInt(req.params.referralId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/corporate/referral/patient/:patientId
router.get('/referral/patient/:patientId', authCorporate, async (req, res) => {
  try {
    const data = await getReferralsByPatient(parseInt(req.params.patientId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Eligibility ───────────────────────────────────────────────────────────────

// POST /api/v1/corporate/eligibility
router.post('/eligibility', authCorporate, async (req, res) => {
  try {
    const organizationId = corporateIdOf(req);
    const result = await recordEligibilityCheck({ ...req.body, organizationId, checkedBy: issuerIdOf(req) });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Fitness certificates ──────────────────────────────────────────────────────

// POST /api/v1/occupational-health/fitness-certificate
router.post('/fitness-certificate', authCorporate, async (req, res) => {
  if (!requireClinicalIssuer(req, res)) return;
  try {
    const organizationId = corporateIdOf(req);
    const result = await issueFitnessCertificate({ ...req.body, organizationId, issuedBy: issuerIdOf(req) });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/occupational-health/fitness-certificate/patient/:patientId
router.get('/fitness-certificate/patient/:patientId', authCorporate, async (req, res) => {
  try {
    const data = await getFitnessCertificatesByPatient(parseInt(req.params.patientId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/occupational-health/return-to-work
router.post('/return-to-work', authCorporate, async (req, res) => {
  if (!requireClinicalIssuer(req, res)) return;
  try {
    const organizationId = corporateIdOf(req);
    const result = await issueReturnToWorkClearance({ ...req.body, organizationId, issuedBy: issuerIdOf(req) });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
