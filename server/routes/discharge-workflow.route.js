import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createDischargeDraft, getDraftByAdmission, updateDraftContent,
  signDischargePacket, sendDischargePacket
} from '../services/discharge-workflow.service.js';
import { getDischargeReadiness } from '../services/adt.service.js';
import { enforceDischargeSignConsent } from '../services/consent-enforcement.service.js';

const router = express.Router();

// GET /api/v1/discharge/readiness/:admissionId — document §8 Phase 5 canonical path
// Alias of GET /api/v1/adt/discharge/readiness/:admissionId
router.get('/readiness/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await getDischargeReadiness(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/discharge/draft
router.post('/draft', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await createDischargeDraft({
      ...req.body,
      organizationId,
      preparedBy: req.user.id
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/discharge/draft/:admissionId
router.get('/draft/:admissionId', authUser, async (req, res) => {
  try {
    const result = await getDraftByAdmission(parseInt(req.params.admissionId));
    if (!result) return res.status(404).json({ success: false, message: 'No draft found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/discharge/draft/:packetId
router.patch('/draft/:packetId', authUser, async (req, res) => {
  try {
    const result = await updateDraftContent(parseInt(req.params.packetId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/discharge/sign  (body: { packetId, patientId, override? })
// POST /api/v1/discharge/sign/:packetId  (RESTful alias used by frontend)
router.post('/sign', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    await enforceDischargeSignConsent({
      organizationId,
      patientId: req.body.patientId,
      override: req.body.override || null
    });
    const packetId = req.body.packetId;
    const result = await signDischargePacket(parseInt(packetId), { signedBy: req.user.id, finalContent: req.body.finalContent });
    res.json(result);
  } catch (err) {
    if (err.consentBlocked) return res.status(403).json({ success: false, message: err.message, consentBlocked: true, consentType: err.consentType });
    res.status(400).json({ success: false, message: err.message });
  }
});
router.post('/sign/:packetId', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    await enforceDischargeSignConsent({
      organizationId,
      patientId: req.body.patientId,
      override: req.body.override || null
    });
    const result = await signDischargePacket(parseInt(req.params.packetId), {
      signedBy: req.user.id,
      finalContent: req.body.finalContent
    });
    res.json(result);
  } catch (err) {
    if (err.consentBlocked) return res.status(403).json({ success: false, message: err.message, consentBlocked: true, consentType: err.consentType });
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/discharge/packet/send  (body: { packetId })
// POST /api/v1/discharge/packet/send/:packetId  (RESTful alias used by frontend)
router.post('/packet/send', authUser, async (req, res) => {
  try {
    const packetId = req.body.packetId;
    const result = await sendDischargePacket(parseInt(packetId), {
      channel: req.body.channel,
      deliveryAddress: req.body.deliveryAddress,
      sentBy: req.user.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
router.post('/packet/send/:packetId', authUser, async (req, res) => {
  try {
    const result = await sendDischargePacket(parseInt(req.params.packetId), {
      channel: req.body.channel,
      deliveryAddress: req.body.deliveryAddress,
      sentBy: req.user.id
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
