/**
 * Tier-2 marketplace routes: specialist exchange (M6) + tele-pathology.
 * Mounted at /api/v1/marketplace
 *
 * Specialists:
 *   POST /specialists            register with rate card + commission
 *   GET  /specialists            search
 *   POST /specialists/:id/status
 * Requests:
 *   POST /requests               open a service request
 *   GET  /requests
 *   POST /requests/:id/match     rank candidates (?persist=true to auto-assign top)
 *   POST /requests/:id/assign    assign specialist + fee
 *   POST /requests/:id/complete  fee + commission accrue to shared ledger
 *   GET  /summary                marketplace revenue summary
 * Tele-pathology:
 *   POST /pathology/slides       register slide
 *   GET  /pathology/slides
 *   POST /pathology/consults     assign pathologist (adequacy-gated)
 *   GET  /pathology/consults
 *   POST /pathology/consults/:id/report | /report-amend
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  registerSpecialist, searchSpecialists, updateSpecialistStatus,
  createRequest, matchRequest, assignSpecialist, listRequests, completeRequest,
  getMarketplaceRevenueSummary,
} from '../services/marketplace/specialist-marketplace.service.js';
import {
  registerSlide, listSlides, createConsult, listConsults, submitReport, amendReport,
} from '../services/marketplace/tele-pathology.service.js';

const router = express.Router();
const orgId = req => req.user.organization_id || req.user.tenant_id || req.user.hospitalId || req.user.id;
const wrap = handler => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = /required|invalid|not found|not accepting|cannot|not adequate|already|only the/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ── Specialist registry ──────────────────────────────────────────────────────

router.post('/specialists', authUser, wrap(req => {
  const { doctorId, name, specialties, modalities, serviceTypes, languages, licenseNo, rateCard, commissionPercent, metadata } = req.body || {};
  if (!doctorId || !name) throw new Error('doctorId and name are required');
  return registerSpecialist({
    organizationId: orgId(req), doctorId: Number(doctorId), name,
    specialties, modalities, serviceTypes, languages, licenseNo, rateCard, commissionPercent, metadata,
  });
}));

router.get('/specialists', authUser, wrap(req => searchSpecialists({
  organizationId: req.query.orgScoped === 'true' ? orgId(req) : null,
  specialty: req.query.specialty || null,
  serviceType: req.query.serviceType || null,
  modality: req.query.modality || null,
})));

router.post('/specialists/:id/status', authUser, wrap(req =>
  updateSpecialistStatus(Number(req.params.id), orgId(req), {
    acceptingRequests: req.body?.acceptingRequests ?? null,
    status: req.body?.status ?? null,
  })
));

// ── Requests ─────────────────────────────────────────────────────────────────

router.post('/requests', authUser, wrap(req => {
  const { serviceType, specialty, modality, urgency, patientRef, caseSummary, attachments } = req.body || {};
  if (!serviceType) throw new Error('serviceType is required');
  return createRequest({
    organizationId: orgId(req), serviceType, specialty, modality, urgency,
    patientRef, caseSummary, attachments, requestedBy: req.user.id,
  });
}));

router.get('/requests', authUser, wrap(req => listRequests(orgId(req), {
  status: req.query.status || null,
  serviceType: req.query.serviceType || null,
  specialistId: req.query.specialistId ? Number(req.query.specialistId) : null,
})));

router.post('/requests/:id/match', authUser, wrap(req =>
  matchRequest(Number(req.params.id), orgId(req), { persist: req.query.persist === 'true' })
));

router.post('/requests/:id/assign', authUser, wrap(req => {
  const { specialistId, fee } = req.body || {};
  if (!specialistId) throw new Error('specialistId is required');
  return assignSpecialist(Number(req.params.id), orgId(req), Number(specialistId), { fee });
}));

router.post('/requests/:id/complete', authUser, wrap(req =>
  completeRequest(Number(req.params.id), orgId(req), {
    outcome: req.body?.outcome || null, reportRef: req.body?.reportRef || null,
  })
));

router.get('/summary', authUser, wrap(req => getMarketplaceRevenueSummary(orgId(req))));

// ── Tele-pathology ───────────────────────────────────────────────────────────

router.post('/pathology/slides', authUser, wrap(req => {
  const { specimenId, accessionNo, specimenType, stain, bodySite, imageUrl, digitalImageUrl, scanResolutionX, scanResolutionY, scannerVendor, tissuePresent, artifacts, clinicalHistory, priorBiopsyRef, metadata } = req.body || {};
  if (!specimenId) throw new Error('specimenId is required');
  return registerSlide({
    organizationId: orgId(req), specimenId, accessionNo, specimenType, stain, bodySite,
    imageUrl, digitalImageUrl, scanResolutionX, scanResolutionY, scannerVendor,
    tissuePresent, artifacts, clinicalHistory, priorBiopsyRef, metadata,
  });
}));

router.get('/pathology/slides', authUser, wrap(req => listSlides(orgId(req), {
  status: req.query.status || null, specimenType: req.query.specimenType || null,
})));

router.post('/pathology/consults', authUser, wrap(req => {
  const { slideId, pathologistId, pathologistName, priority, fee } = req.body || {};
  if (!slideId || !pathologistId) throw new Error('slideId and pathologistId are required');
  return createConsult({
    organizationId: orgId(req), slideId: Number(slideId), pathologistId: Number(pathologistId),
    pathologistName, priority, fee,
  });
}));

router.get('/pathology/consults', authUser, wrap(req => listConsults(orgId(req), {
  status: req.query.status || null,
  pathologistId: req.query.pathologistId ? Number(req.query.pathologistId) : null,
})));

router.post('/pathology/consults/:id/report', authUser, wrap(req =>
  submitReport(Number(req.params.id), orgId(req), {
    report: req.body?.report || {}, pathologistId: req.user.id,
  })
));

router.post('/pathology/consults/:id/report-amend', authUser, wrap(req =>
  amendReport(Number(req.params.id), orgId(req), {
    report: req.body?.report || {}, pathologistId: req.user.id, reason: req.body?.reason || null,
  })
));

export default router;

