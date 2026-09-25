import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createDischargeDraft, getDraftByAdmission, updateDraftContent,
  signDischargePacket, sendDischargePacket, getPacketScope
} from '../services/discharge-workflow.service.js';
import { getDischargeReadiness } from '../services/adt.service.js';
import { enforceDischargeSignConsent } from '../services/consent-enforcement.service.js';
import { requireTenant } from '../utils/tenant-identity.js';
import {
  DISCHARGE_SIGN_ROLES, requireSessionRole, sessionOverride, sendRouteError,
} from '../utils/discharge-policy.js';

const router = express.Router();

// GET /api/v1/discharge/readiness/:admissionId — document §8 Phase 5 canonical path
// Alias of GET /api/v1/adt/discharge/readiness/:admissionId
router.get('/readiness/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = requireTenant(req, res);
    if (!organizationId) return;
    const result = await getDischargeReadiness(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    sendRouteError(res, err, 500);
  }
});

// POST /api/v1/discharge/draft
router.post('/draft', authUser, async (req, res) => {
  try {
    const organizationId = requireTenant(req, res);
    if (!organizationId) return;
    const result = await createDischargeDraft({
      ...req.body,
      organizationId,
      preparedBy: req.user.id
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    sendRouteError(res, err);
  }
});

// GET /api/v1/discharge/draft/:admissionId
router.get('/draft/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = requireTenant(req, res);
    if (!organizationId) return;
    const result = await getDraftByAdmission(parseInt(req.params.admissionId), organizationId);
    if (!result) return res.status(404).json({ success: false, message: 'No draft found' });
    res.json({ success: true, data: result });
  } catch (err) {
    sendRouteError(res, err, 500);
  }
});

// PATCH /api/v1/discharge/draft/:packetId
router.patch('/draft/:packetId', authUser, async (req, res) => {
  try {
    const organizationId = requireTenant(req, res);
    if (!organizationId) return;
    const result = await updateDraftContent(parseInt(req.params.packetId), req.body, organizationId);
    res.json(result);
  } catch (err) {
    sendRouteError(res, err);
  }
});

/**
 * Signing a discharge is a clinical act: only permitted roles may do it, the packet must belong to the caller's
 * hospital, consent is checked against the PACKET's patient (never a body-supplied one), and an override — if
 * requested — is attributed to the authenticated caller, never to an approver named in the request body.
 */
async function handleSign(req, res, packetId) {
  try {
    const organizationId = requireTenant(req, res);
    if (!organizationId) return;
    const scope = await getPacketScope(parseInt(packetId), organizationId);
    if (!scope) return res.status(404).json({ success: false, code: 'DISCHARGE_DRAFT_NOT_FOUND', message: 'Discharge draft not found' });

    const override = sessionOverride(req.user, req.body.override);
    await enforceDischargeSignConsent({ organizationId, patientId: scope.patientId, override });
    const result = await signDischargePacket(parseInt(packetId), {
      signedBy: req.user.id,
      finalContent: req.body.finalContent,
      organizationId,
      override
    });
    res.json(result);
  } catch (err) {
    if (err.consentBlocked) return res.status(403).json({ success: false, message: err.message, consentBlocked: true, consentType: err.consentType });
    if (err.code === 'DISCHARGE_READINESS_BLOCKED') return res.status(409).json({ success: false, code: err.code, message: err.message, mandatoryPending: err.mandatoryPending });
    sendRouteError(res, err);
  }
}

// POST /api/v1/discharge/sign  (body: { packetId, override?: { reasonCode } })
// POST /api/v1/discharge/sign/:packetId  (RESTful alias used by frontend)
router.post('/sign', authUser, requireSessionRole(DISCHARGE_SIGN_ROLES), (req, res) => handleSign(req, res, req.body.packetId));
router.post('/sign/:packetId', authUser, requireSessionRole(DISCHARGE_SIGN_ROLES), (req, res) => handleSign(req, res, req.params.packetId));

async function handleSend(req, res, packetId) {
  try {
    const organizationId = requireTenant(req, res);
    if (!organizationId) return;
    const result = await sendDischargePacket(parseInt(packetId), {
      channel: req.body.channel,
      deliveryAddress: req.body.deliveryAddress,
      sentBy: req.user.id,
      organizationId
    });
    res.json({ success: true, data: result });
  } catch (err) {
    sendRouteError(res, err);
  }
}

// POST /api/v1/discharge/packet/send  (body: { packetId })
// POST /api/v1/discharge/packet/send/:packetId  (RESTful alias used by frontend)
router.post('/packet/send', authUser, (req, res) => handleSend(req, res, req.body.packetId));
router.post('/packet/send/:packetId', authUser, (req, res) => handleSend(req, res, req.params.packetId));

export default router;
