/**
 * Employee insurance link + in-app enrolment for SmartCRM corporates (ADR-001).
 * Mounted under /api/employee (already on the ring-fencing allow-list for
 * user/patient tokens). Every route acts only for req.user.id — no route takes
 * a user, member, corporate or emp id from the request.
 *
 *   GET    /insurance/link            link state + whether the member can link
 *   POST   /insurance/link            { consent: true, policyVersion }  -> link + first refresh
 *   DELETE /insurance/link            unlink, withdraw consent, hide projected rows
 *   POST   /insurance/refresh         re-read SmartCRM (throttled per member)
 *
 *   GET    /enrolment/window
 *   POST   /enrolment/session
 *   GET    /enrolment/draft     PUT /enrolment/draft     DELETE /enrolment/draft
 *   POST   /enrolment/quote
 *   POST   /enrolment/payment/initiate   (Idempotency-Key required)
 *   GET    /enrolment/payment/status
 *   POST   /enrolment/submit             (Idempotency-Key required)
 *
 *   GET    /insurance/claims             the member's claims from SmartCRM
 *   GET    /insurance/e-card?policyId=&memberId=   e-card PDF (self or a dependant)
 *
 * Everything is inert unless SMARTCRM_INTEGRATION_ENABLED=true and the
 * member's corporate has a binding switched on.
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { SmartCrmError } from '../services/smartcrm/config.js';
import {
  describeLink, eligibility, getActiveLink, linkMember, refreshMember, unlinkMember,
} from '../services/smartcrm/member-link.service.js';
import { runOperation } from '../services/smartcrm/enrolment.service.js';
import { listMemberClaims, getMemberEcard } from '../services/smartcrm/member-documents.service.js';
import { loadBinding } from '../services/smartcrm/config.js';

const router = express.Router();

const requestIdOf = (req) => req.requestId || req.get?.('x-request-id') || null;

function sendError(res, error) {
  if (error instanceof SmartCrmError) {
    return res.status(error.status).json({
      success: false, code: error.code, message: error.message,
      ...(error.details && !('upstreamStatus' in error.details) ? { details: error.details } : {}),
    });
  }
  console.error('[employee-insurance]', error);
  return res.status(500).json({ success: false, code: 'INTERNAL', message: 'Something went wrong.' });
}

/** Query params the enrolment GETs may forward (SmartCRM's names); nothing else is passed on. */
const FORWARDABLE_QUERY = ['enrollment_session_token', 'payment_ref'];
const pickQuery = (q = {}) => Object.fromEntries(
  FORWARDABLE_QUERY.filter((k) => typeof q[k] === 'string' && q[k].length <= 200).map((k) => [k, q[k]])
);
const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

router.get('/insurance/link', authUser, async (req, res) => {
  try {
    const link = await getActiveLink(req.user.id);
    const binding = link ? await loadBinding(link.corporate_id) : null;
    const can = link ? null : await eligibility(req.user.id);
    return res.json({ success: true, data: { ...describeLink(link, binding), canLink: can } });
  } catch (error) { return sendError(res, error); }
});

router.post('/insurance/link', authUser, async (req, res) => {
  try {
    const { consent, policyVersion } = bodyOf(req);
    const { link, created } = await linkMember({
      userId: req.user.id, consent, policyVersion,
      ip: req.ip, userAgent: req.get('user-agent'), requestId: requestIdOf(req),
    });
    let sync = null;
    try {
      // Forced only for a new link; re-posting an existing link must not be
      // a way around the per-member refresh throttle.
      sync = await refreshMember({ userId: req.user.id, force: created, requestId: requestIdOf(req) });
    } catch (error) {
      // The link stands; the first read failing is reported, not hidden.
      sync = { refreshed: false, code: error.code || 'ERROR', message: error.message };
    }
    const current = (await getActiveLink(req.user.id)) || link;
    return res.status(created ? 201 : 200).json({
      success: true,
      data: { ...describeLink(current, await loadBinding(current.corporate_id)), sync },
    });
  } catch (error) { return sendError(res, error); }
});

router.delete('/insurance/link', authUser, async (req, res) => {
  try {
    const result = await unlinkMember({ userId: req.user.id, requestId: requestIdOf(req) });
    return res.json({ success: true, data: result });
  } catch (error) { return sendError(res, error); }
});

router.post('/insurance/refresh', authUser, async (req, res) => {
  try {
    const result = await refreshMember({ userId: req.user.id, requestId: requestIdOf(req) });
    return res.json({ success: true, data: result });
  } catch (error) { return sendError(res, error); }
});

router.get('/insurance/claims', authUser, async (req, res) => {
  try {
    const claims = await listMemberClaims({ userId: req.user.id, requestId: requestIdOf(req) });
    return res.json({ success: true, data: { claims, source: 'smartcrm' } });
  } catch (error) { return sendError(res, error); }
});

// policyId / memberId are the wallet's own ids (GET /api/employee/policies);
// the service checks they are a SmartCRM row of the caller's family.
router.get('/insurance/e-card', authUser, async (req, res) => {
  try {
    const file = await getMemberEcard({
      userId: req.user.id, policyId: req.query.policyId, memberId: req.query.memberId, requestId: requestIdOf(req),
    });
    if (file.url) return res.redirect(302, file.url);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(file.buffer);
  } catch (error) { return sendError(res, error); }
});

const ENROLMENT_ROUTES = [
  ['get',    '/enrolment/window',           'window'],
  ['post',   '/enrolment/session',          'session'],
  ['get',    '/enrolment/draft',            'draftGet'],
  ['put',    '/enrolment/draft',            'draftPut'],
  ['delete', '/enrolment/draft',            'draftDelete'],
  ['post',   '/enrolment/quote',            'quote'],
  ['post',   '/enrolment/payment/initiate', 'paymentInitiate'],
  ['get',    '/enrolment/payment/status',   'paymentStatus'],
  ['post',   '/enrolment/submit',           'submit'],
];

for (const [method, path, operation] of ENROLMENT_ROUTES) {
  router[method](path, authUser, async (req, res) => {
    try {
      const sendsBody = method === 'post' || method === 'put';
      const result = await runOperation(operation, {
        userId: req.user.id,
        body: sendsBody ? bodyOf(req) : undefined,
        query: method === 'get' ? pickQuery(req.query) : undefined,
        idempotencyKey: req.get('idempotency-key') || undefined,
        requestId: requestIdOf(req),
      });
      if (result.replayed) res.set('Idempotent-Replayed', 'true');
      // SmartCRM's own status and body: 201 saved, 202 pending HR with
      // request_id, 402 payment pending, 400 with detail.
      return res.status(result.status || 200).json(result.body ?? {});
    } catch (error) { return sendError(res, error); }
  });
}

export default router;
