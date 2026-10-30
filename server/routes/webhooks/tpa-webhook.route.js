/**
 * TPA / Insurer Inbound Webhook Route — Eve-Healthcare pattern ported to Mediqzy
 *
 * Demonstrates the combined idempotency + HMAC verification pattern for inbound
 * payer callbacks (claim status updates, pre-auth decisions, remittance advices).
 *
 *   POST /api/webhooks/tpa/:provider
 *
 * Flow:
 *   1. express.json `verify` captures req.rawBody (wired in app.js)
 *   2. verifyWebhookHmac(provider) validates the HMAC signature
 *   3. idempotent-webhook service checks for duplicate event_id
 *   4. Route handler processes the event (claim status, remittance, etc.)
 *   5. Event is marked processed/failed
 *
 * Mounted in server/app.js as: app.use('/api/webhooks/tpa', tpaWebhookRouter)
 */
import express from 'express';
import { verifyWebhookHmac } from '../../middleware/hmac-webhook.middleware.js';
import { isDuplicate, recordEvent, markProcessed, markFailed } from '../../services/idempotent-webhook.service.js';

const router = express.Router();

/**
 * POST /api/webhooks/tpa/:provider
 * Inbound webhook from a TPA or insurer (e.g. Heritage, MD India, Star Health).
 *
 * Expected headers:
 *   X-Hub-Signature-256 or X-Razorpay-Signature or X-Webhook-Signature
 *   X-Event-ID: idempotency key (required)
 *   X-Event-Type: claim.status | preauth.decision | remittance | payment
 *
 * Expected body: JSON payload from the payer
 */
router.post('/:provider', verifyWebhookHmac, async (req, res) => {
  const { provider } = req.params;
  const { webhook } = req;
  const eventId = req.headers['x-event-id'];
  const eventType = req.headers['x-event-type'] || 'claim.status';
  const organizationId = req.user?.organizationId || req.user?.hospitalId || null;
  const claimNumber = req.body?.claimNumber || req.body?.claim_number || null;

  // 1. Require idempotency key
  if (!eventId) {
    return res.status(400).json({
      success: false,
      message: 'Missing X-Event-ID idempotency header'
    });
  }

  // 2. Check for duplicate delivery
  try {
    const existing = await isDuplicate(eventId, { source: 'tpa', provider });
    if (existing.exists) {
      // Duplicate — acknowledge without reprocessing (prevents redelivery loops)
      return res.status(202).json({
        success: true,
        message: 'Duplicate webhook event already processed',
        event_id: eventId,
        duplicate: true,
        original_received_at: existing.record?.received_at
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Idempotency check failed',
      error: error.message
    });
  }

  // 3. Record the event before processing (durable log)
  let recorded;
  try {
    recorded = await recordEvent({
      eventId,
      source: 'tpa',
      provider,
      eventType,
      organizationId,
      claimNumber,
      payload: req.body || {},
      headers: req.headers || {},
      hmacSignature: req.headers['x-hub-signature-256'] ||
                   req.headers['x-razorpay-signature'] ||
                   req.headers['x-webhook-signature'],
      hmacVerified: Boolean(webhook?.verified)
    });
  } catch (error) {
    if (error.isDuplicate) {
      return res.status(202).json({
        success: true,
        message: 'Duplicate webhook event (race condition)',
        event_id: eventId,
        duplicate: true
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to record webhook event',
      error: error.message
    });
  }

  // 4. Process the event (placeholder — integrate with claims lifecycle service)
  try {
    // TODO: Connect to tpa-claims-lifecycle.service.js or insuranceClaim model
    // to update claim status, post remittance, create denial, etc.
    console.log(`[tpa-webhook] Processing ${eventType} from ${provider}: ${eventId}`);

    await markProcessed(eventId, { processed_at: new Date().toISOString() });

    return res.status(200).json({
      success: true,
      message: 'Webhook event processed',
      event_id: eventId,
      provider,
      event_type: eventType,
      hmac_verified: webhook?.verified || false
    });
  } catch (error) {
    await markFailed(eventId, error.message);
    return res.status(500).json({
      success: false,
      message: 'Webhook event processing failed',
      event_id: eventId,
      error: error.message
    });
  }
});

export default router;
