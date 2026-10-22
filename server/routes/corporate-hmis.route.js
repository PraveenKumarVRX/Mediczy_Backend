import express from 'express';
import fs from 'fs';
import { authCorporate } from '../middleware/corporate.middleware.js';
import {
  createReferral, updateReferralStatus, getReferralsByPatient,
  recordEligibilityCheck,
  issueFitnessCertificate, getFitnessCertificatesByPatient,
  issueReturnToWorkClearance,
  getFitnessCertificatesForOrganization, getFitnessCertificateById, getCorporateCertificatesByIds,
} from '../services/corporate-hmis.service.js';
import { fitnessCertificatePdfFileName, resolveFitnessCertificatePdfPath } from '../services/fitness-certificate-pdf.service.js';

import { buildCertificateArchive } from '../services/corporate-certificate-archive.service.js';
import { corporateAccessAudit } from '../services/corporate-access-audit.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const router = express.Router();
const accessAudit = corporateAccessAudit(postgresSequelize);

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
    const result = await updateReferralStatus(parseInt(req.params.referralId), corporateIdOf(req), req.body);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/corporate/referral/patient/:patientId
router.get('/referral/patient/:patientId', authCorporate, async (req, res) => {
  try {
    const data = await getReferralsByPatient(parseInt(req.params.patientId), corporateIdOf(req));
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
    const data = await getFitnessCertificatesByPatient(parseInt(req.params.patientId), corporateIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/occupational-health/fitness-certificates — every certificate for HR's own corporate,
// across all employees. Any authenticated corporate role can view (only issuing is clinical-staff-gated).
router.get('/fitness-certificates', authCorporate, async (req, res) => {
  try {
    const data = await getFitnessCertificatesForOrganization(corporateIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download existing issued PDFs, with all-or-nothing tenant validation.
router.post('/fitness-certificates/download-zip', authCorporate, async (req, res) => {
  try {
    const buffer = await buildCertificateArchive({
      ids: req.body?.certificateIds, corporateId: corporateIdOf(req),
      findCertificates: getCorporateCertificatesByIds,
      resolvePath: resolveFitnessCertificatePdfPath, fileName: fitnessCertificatePdfFileName,
    });
    await accessAudit.record(req, {
      resourceId: 'certificates:bulk',
      title: `Certificate PDFs: ${[...new Set(req.body.certificateIds)].join(', ')}`,
      action: 'download',
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="fitness-certificates.zip"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Certificate archive could not be downloaded' });
  }
});

// GET /api/v1/occupational-health/fitness-certificate/:id/pdf
router.get('/fitness-certificate/:id/pdf', authCorporate, async (req, res) => {
  try {
    const cert = await getFitnessCertificateById(req.params.id);
    if (!cert || Number(cert.organization_id) !== Number(corporateIdOf(req))) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    const filePath = resolveFitnessCertificatePdfPath(cert);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Certificate PDF not available' });
    }
    await accessAudit.record(req, { resourceId: `certificate:${cert.id}`, title: 'Fitness certificate PDF', action: 'download' });
    res.setHeader('Cache-Control', 'no-store');
    return res.download(filePath, fitnessCertificatePdfFileName(cert));
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
