/**
 * Specialty Clinical Modules (Upgrade Plan Track B, Phase B5)
 *
 * Every clinician-facing GET here returns approved content only. Nothing
 * a doctor sees from this API has skipped a recorded human review — see
 * services/specialty-module.service.js for why that boundary exists.
 *
 *   GET  /api/specialty-module/:specialty/order-sets            — approved only
 *   GET  /api/specialty-module/:specialty/doc-templates         — approved only
 *   GET  /api/specialty-module/:specialty/cds-rules             — approved only
 *   GET  /api/specialty-module/:specialty/prescription-templates — approved only
 *   POST /api/specialty-module/:specialty/cds-rules/evaluate    — { facts } -> triggered rules
 *
 *   POST /api/specialty-module/order-sets             — create draft (clinical staff)
 *   POST /api/specialty-module/order-sets/:id/submit  — draft -> pending_review
 *   POST /api/specialty-module/order-sets/:id/approve — pending_review -> approved (admin, requires reviewerCredential)
 *   GET  /api/specialty-module/order-sets/review-queue — all non-approved (admin)
 *   (doc-templates, cds-rules, and prescription-templates each mirror the same five endpoints)
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import specialtyModule from '../services/specialty-module.service.js';

const router = express.Router();
const CLINICAL = ['doctor', 'admin', 'nurse', 'hospital'];
const REVIEWER = ['admin', 'system_admin'];

const orgId = (req) => req.user?.organization_id || req.user?.tenant_id || req.user?.hospitalId || null;

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = /not found|required|invalid|not eligible/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

function mountResource(path, svc) {
  // Live, clinician-facing — approved only
  router.get(`/:specialty/${path}`, authUser, requireRole(CLINICAL), wrap((req) => svc.getLive({
    specialty: req.params.specialty, organizationId: req.query.organizationId || orgId(req),
  })));

  // Author a draft
  router.post(`/${path}`, authUser, requireRole(CLINICAL), wrap((req) => svc.createDraft({
    specialty: req.body.specialty,
    organizationId: req.body.organizationId || orgId(req),
    createdBy: req.user.id,
    ...req.body.fields,
  })));

  router.post(`/${path}/:id/submit`, authUser, requireRole(CLINICAL), wrap((req) => svc.submit(req.params.id)));

  // Approve — the actual review gate. reviewerCredential is a free-text
  // assertion of who is reviewing (name + qualification) — this cannot
  // cryptographically verify a real specialist reviewed it, but it creates
  // an accountable, auditable record instead of an anonymous status flip.
  router.post(`/${path}/:id/approve`, authUser, requireRole(REVIEWER), wrap((req) => svc.approve(req.params.id, {
    reviewedBy: req.user.id,
    reviewerCredential: req.body.reviewerCredential,
  })));

  router.get(`/${path}/review-queue`, authUser, requireRole(REVIEWER), wrap((req) => svc.listAll({
    specialty: req.query.specialty, organizationId: req.query.organizationId || orgId(req),
  })));
}

mountResource('order-sets', {
  getLive: specialtyModule.getLiveOrderSets,
  createDraft: specialtyModule.createOrderSetDraft,
  submit: specialtyModule.submitOrderSetForReview,
  approve: specialtyModule.approveOrderSet,
  listAll: specialtyModule.listOrderSets,
});

mountResource('doc-templates', {
  getLive: specialtyModule.getLiveDocTemplates,
  createDraft: specialtyModule.createDocTemplateDraft,
  submit: specialtyModule.submitDocTemplateForReview,
  approve: specialtyModule.approveDocTemplate,
  listAll: specialtyModule.listDocTemplates,
});

mountResource('cds-rules', {
  getLive: specialtyModule.getLiveCdsRules,
  createDraft: specialtyModule.createCdsRuleDraft,
  submit: specialtyModule.submitCdsRuleForReview,
  approve: specialtyModule.approveCdsRule,
  listAll: specialtyModule.listCdsRules,
});

mountResource('prescription-templates', {
  getLive: specialtyModule.getLivePrescriptionTemplates,
  createDraft: specialtyModule.createPrescriptionTemplateDraft,
  submit: specialtyModule.submitPrescriptionTemplateForReview,
  approve: specialtyModule.approvePrescriptionTemplate,
  listAll: specialtyModule.listPrescriptionTemplates,
});

router.post('/:specialty/cds-rules/evaluate', authUser, requireRole(CLINICAL), wrap((req) => specialtyModule.evaluateCdsRules({
  specialty: req.params.specialty,
  organizationId: req.body.organizationId || orgId(req),
  facts: req.body.facts || {},
})));

export default router;
