/**
 * Revenue-Share & Monetisation Routes (Feasibility Plan Phase 0 + Tier 1)
 *
 * Generic ledger:
 *   GET    /api/v1/revenue-share/agreements
 *   POST   /api/v1/revenue-share/agreements
 *   POST   /api/v1/revenue-share/events            — record any revenue event (fee auto-accrues)
 *   GET    /api/v1/revenue-share/ledger
 *   GET    /api/v1/revenue-share/summary
 *   POST   /api/v1/revenue-share/ledger/:id/transition   (invoiced | paid | voided)
 *
 * M4 RCM success fee:
 *   POST   /api/v1/revenue-share/rcm/recovered     — bill 3–5% success fee on recovered claim
 *   GET    /api/v1/revenue-share/rcm/summary
 *
 * M4 denial workflow automation:
 *   POST   /api/v1/revenue-share/rcm/denial-workflow/run     — prediction → follow-up queue
 *   GET    /api/v1/revenue-share/rcm/denial-workflow/queue
 *   POST   /api/v1/revenue-share/rcm/denial-workflow/:id/claim
 *   POST   /api/v1/revenue-share/rcm/denial-workflow/:id/resolve  (recovered → fee auto-billed)
 *
 * M2 Hospital-at-Home billing:
 *   POST   /api/v1/revenue-share/homecare/episodes/:episodeId/bill
 *   POST   /api/v1/revenue-share/homecare/helpline-call
 *   POST   /api/v1/revenue-share/homecare/subscriptions/run
 *   GET    /api/v1/revenue-share/homecare/events
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  upsertAgreement, listAgreements, recordRevenueEvent,
  listLedger, ledgerSummary, transitionEntry, FEE_TYPES,
} from '../services/revenue-share/revenue-share-ledger.service.js';
import {
  recordRecoveredRevenue, getRcmFeeSummary, listRcmFeeEntries,
} from '../services/revenue-share/rcm-success-fee.service.js';
import {
  runDenialRiskWorkflow, getFollowupQueue, claimFollowup, resolveFollowup,
} from '../services/revenue-share/rcm-denial-workflow.service.js';
import {
  billHomecareEpisode, billHelplineCall, runSubscriptionBilling,
  listBillingEvents, getHomecareRevenueSummary,
} from '../services/revenue-share/homecare-billing.service.js';

const router = express.Router();
const orgId = req => req.user.organization_id || req.user.tenant_id || req.user.hospitalId || req.user.id;
const wrap = handler => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = /required|invalid|not open|not found|outside|no revenue-share agreement|illegal/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ── Generic ledger ───────────────────────────────────────────────────────────

router.get('/agreements', authUser, wrap(req => listAgreements(orgId(req), {
  scopeDomain: req.query.domain || null,
  active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : null,
})));

router.post('/agreements', authUser, wrap(req => {
  const { counterpartyType, counterpartyId, scopeDomain, scopeEntityId, feeType, feeRate, currency, effectiveFrom, effectiveTo, metadata } = req.body || {};
  if (!scopeDomain || !FEE_TYPES.includes(feeType)) {
    throw new Error('scopeDomain and a valid feeType (percent|flat|per_unit) are required');
  }
  return upsertAgreement({
    organizationId: orgId(req), counterpartyType, counterpartyId,
    scopeDomain, scopeEntityId, feeType, feeRate, currency,
    effectiveFrom, effectiveTo, metadata,
  });
}));

router.post('/events', authUser, wrap(req => {
  const { domain, sourceType, sourceId, grossAmount, description, metadata, suffix, fallbackAgreement } = req.body || {};
  if (!domain || !sourceType || sourceId == null || grossAmount == null) {
    throw new Error('domain, sourceType, sourceId and grossAmount are required');
  }
  return recordRevenueEvent({
    organizationId: orgId(req), domain, sourceType, sourceId, grossAmount,
    description, metadata, suffix, fallbackAgreement,
  });
}));

router.get('/ledger', authUser, wrap(req => listLedger(orgId(req), {
  domain: req.query.domain || null,
  status: req.query.status || null,
  sourceType: req.query.sourceType || null,
  limit: Math.min(Number(req.query.limit) || 100, 500),
  offset: Number(req.query.offset) || 0,
})));

router.get('/summary', authUser, wrap(req => ledgerSummary(orgId(req), { domain: req.query.domain || null })));

router.post('/ledger/:id/transition', authUser, wrap(req => {
  const { status, invoiceId, voidedReason } = req.body || {};
  if (!status) throw new Error('status is required (invoiced|paid|voided)');
  return transitionEntry(Number(req.params.id), orgId(req), status, { invoiceId, voidedReason });
}));

// ── M4: RCM success fee ──────────────────────────────────────────────────────

router.post('/rcm/recovered', authUser, wrap(req => {
  const { claimId, recoveredAmount, successFeePercent, metadata } = req.body || {};
  if (claimId == null || recoveredAmount == null) throw new Error('claimId and recoveredAmount are required');
  return recordRecoveredRevenue({ organizationId: orgId(req), claimId, recoveredAmount, successFeePercent, metadata });
}));

router.get('/rcm/summary', authUser, wrap(req => getRcmFeeSummary(orgId(req))));

router.get('/rcm/entries', authUser, wrap(req => listRcmFeeEntries(orgId(req), {
  status: req.query.status || null,
  limit: Math.min(Number(req.query.limit) || 100, 500),
  offset: Number(req.query.offset) || 0,
})));

// ── M4: denial workflow automation ───────────────────────────────────────────

router.post('/rcm/denial-workflow/run', authUser, wrap(req =>
  runDenialRiskWorkflow(orgId(req), { threshold: Number(req.body?.threshold) || 50 })
));

router.get('/rcm/denial-workflow/queue', authUser, wrap(req => getFollowupQueue(orgId(req), {
  status: req.query.status || 'open',
  assignedTo: req.query.assignedTo ? Number(req.query.assignedTo) : null,
})));

router.post('/rcm/denial-workflow/:id/claim', authUser, wrap(req =>
  claimFollowup(Number(req.params.id), orgId(req), req.user.id)
));

router.post('/rcm/denial-workflow/:id/resolve', authUser, wrap(req => {
  const { outcome, recoveredAmount, notes } = req.body || {};
  if (!outcome) throw new Error('outcome is required (resolved_recovered|resolved_written_off|dismissed)');
  return resolveFollowup(Number(req.params.id), orgId(req), {
    outcome, recoveredAmount, notes, resolvedBy: req.user.id,
  });
}));

// ── M2: Hospital-at-Home billing ─────────────────────────────────────────────

router.post('/homecare/episodes/:episodeId/bill', authUser, wrap(req => {
  const { baseFee, perVisitFee, visitCount, acuityMultiplier, patientId, metadata } = req.body || {};
  if (baseFee == null) throw new Error('baseFee is required');
  return billHomecareEpisode({
    organizationId: orgId(req), episodeId: req.params.episodeId,
    patientId, baseFee, perVisitFee, visitCount, acuityMultiplier, metadata,
  });
}));

router.post('/homecare/helpline-call', authUser, wrap(req => {
  const { callId, fee, episodeId, patientId, metadata } = req.body || {};
  if (callId == null || fee == null) throw new Error('callId and fee are required');
  return billHelplineCall({ organizationId: orgId(req), callId, fee, episodeId, patientId, metadata });
}));

router.post('/homecare/subscriptions/run', authUser, wrap(req => {
  const { periodKey, enrollments, metadata } = req.body || {};
  if (!periodKey) throw new Error('periodKey is required (e.g., "2026-08")');
  return runSubscriptionBilling({ organizationId: orgId(req), periodKey, enrollments, metadata });
}));

router.get('/homecare/events', authUser, wrap(req => listBillingEvents(orgId(req), {
  eventType: req.query.eventType || null,
  limit: Math.min(Number(req.query.limit) || 100, 500),
  offset: Number(req.query.offset) || 0,
})));

router.get('/homecare/summary', authUser, wrap(req => getHomecareRevenueSummary(orgId(req))));

export default router;
