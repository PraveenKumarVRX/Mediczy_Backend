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
  if (!WEBHOOK_SECRET) return next();
  const token = req.headers['x-orthanc-secret'] || req.query.secret;
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }
  return next();
}

router.post('/webhook', verifyWebhook, async (req, res) => {
  try {
    const event = req.body?.Event || req.body?.event;
    if (event && event !== 'NewInstance') {
      return res.json({ success: true, skipped: true, event });
    }
    const result = await handleOrthancNewInstance(req.body);
    return res.json({ success: true, ...result });
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
