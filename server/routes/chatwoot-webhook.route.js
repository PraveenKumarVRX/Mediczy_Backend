import express from 'express';
import { chatwootBridge, handleChatwootTwilioInbound } from '../services/chatwoot-bridge.service.js';

const router = express.Router();
const fail = (res, error) => res.status(error.statusCode || 503).json({ success: false,
  message: error.statusCode ? error.message : 'Chatwoot bridge is unavailable' });

router.post('/webhook', async (req, res) => {
  try {
    const result = await chatwootBridge.webhook({ payload: req.body, rawBody: req.rawBody,
      timestamp: req.get('x-chatwoot-timestamp'), signature: req.get('x-chatwoot-signature') });
    res.json({ success: true, data: result });
  } catch (error) { fail(res, error); }
});

router.post('/channels/twilio', async (req, res) => {
  try {
    const result = await handleChatwootTwilioInbound(req);
    if (!result.handled) return res.status(404).json({ success: false, message: 'No tenant inbox is configured for this recipient' });
    res.type('text/xml').send('<Response></Response>');
  } catch (error) { fail(res, error); }
});

export default router;
