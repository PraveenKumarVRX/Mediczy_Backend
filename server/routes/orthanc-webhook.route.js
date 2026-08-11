/**
 * Orthanc webhook → HyperGrid STOW-RS bridge
 * POST /api/orthanc/webhook
 */
import express from 'express';
import { handleOrthancNewInstance, syncOrthancStudy } from '../services/orthanc-hypergrid-bridge.service.js';
import logger from '../config/logger.js';

const router = express.Router();
const WEBHOOK_SECRET = process.env.ORTHANC_WEBHOOK_SECRET || process.env.MEDICZY_INTERNAL_TOKEN || '';

function verifyWebhook(req, res, next) {
  // Fail closed: never accept Orthanc webhooks when no shared secret is configured.
  if (!WEBHOOK_SECRET) {
    logger.error('[OrthancWebhook] ORTHANC_WEBHOOK_SECRET unset — rejecting request');
    return res.status(503).json({
      success: false,
      message: 'Webhook authentication not configured (ORTHANC_WEBHOOK_SECRET required)',
    });
  }
  const token = req.headers['x-orthanc-secret'] || req.query.secret;
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }
  return next();
}

router.post('/webhook', verifyWebhook, async (req, res) => {
  try {
    const event = req.body?.Event || req.body?.event || 'NewInstance';
    // NewInstance = each C-STORE; StableStudy = study finished settling (preferred)
    if (event && !['NewInstance', 'StableStudy', 'stable-study'].includes(event)) {
      return res.json({ success: true, skipped: true, event });
    }
    const payload = {
      ...req.body,
      // Orthanc StableStudy uses ID = study id
      ...(event === 'StableStudy' || event === 'stable-study'
        ? { studyId: req.body?.ID || req.body?.id, ID: undefined }
        : {}),
    };
    const result = await handleOrthancNewInstance(payload);
    return res.json({ success: true, event, ...result });
  } catch (err) {
    logger.error('[OrthancWebhook] Error', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sync-study/:studyId', verifyWebhook, async (req, res) => {
  try {
    const results = await syncOrthancStudy(req.params.studyId);
    return res.json({ success: true, count: results.length, results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'orthanc-bridge',
    orthancUrl: process.env.ORTHANC_URL || 'http://127.0.0.1:8042',
  });
});

export default router;
