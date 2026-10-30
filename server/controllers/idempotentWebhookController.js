/**
 * Idempotent Webhook Controller — Admin endpoints for webhook event management
 *
 * Eve-Healthcare pattern: `POST /api/v1/admin/webhooks/{event_id}/retry` allows
 * manual background retry of failed webhooks. Ported to Mediqzy's insurance/RCM
 * module so operations staff can retry failed TPA / insurer / NHCX callbacks.
 */
import { listEvents, getEvent, markFailed, markProcessed, isDuplicate } from '../services/idempotent-webhook.service.js';

export async function listWebhookEvents(req, res) {
  try {
    const {
      organizationId,
      source,
      provider,
      status,
      claimNumber,
      limit,
      offset
    } = req.query;

    const result = await listEvents({
      organizationId: organizationId ? parseInt(organizationId, 10) : undefined,
      source,
      provider,
      processingStatus: status,
      claimNumber,
      limit,
      offset
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[idempotentWebhook] list error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getWebhookEvent(req, res) {
  try {
    const { eventId } = req.params;
    const event = await getEvent(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Webhook event not found' });
    }
    return res.json({ success: true, event });
  } catch (error) {
    console.error('[idempotentWebhook] get error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function retryWebhookEvent(req, res) {
  try {
    const { eventId } = req.params;
    const { reprocess = true } = req.body || {};

    const event = await getEvent(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Webhook event not found' });
    }

    if (event.processingStatus === 'processed') {
      return res.status(409).json({
        success: false,
        message: 'Event already processed',
        event
      });
    }

    // If a duplicate was previously detected, clear the duplicate flag so it can be re-evaluated
    if (event.processingStatus === 'duplicate') {
      // Re-check idempotency at the DB level
      const dup = await isDuplicate(eventId);
      if (dup.exists) {
        return res.status(409).json({
          success: false,
          message: 'Event still recorded as processed/duplicate',
          event
        });
      }
    }

    // Mark as pending for reprocessing
    const pool = (await import('../db/pgPool.js')).default;
    await pool.query(
      `UPDATE webhook_event_log
       SET processing_status = 'pending',
           retry_count = 0,
           error_message = NULL,
           processed = FALSE,
           processed_at = NULL,
           updated_at = NOW()
       WHERE event_id = $1`,
      [eventId]
    );

    return res.json({
      success: true,
      message: 'Webhook event queued for retry',
      eventId,
      reprocess
    });
  } catch (error) {
    console.error('[idempotentWebhook] retry error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function webhookEventStats(req, res) {
  try {
    const { organizationId } = req.query;
    const pool = (await import('../db/pgPool.js')).default;

    const params = [];
    let where = 'WHERE 1=1';
    if (organizationId) {
      params.push(organizationId);
      where += ` AND organization_id = $${params.length}`;
    }

    const {
      rows: [stats]
    } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE processing_status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE processing_status = 'processed') AS processed,
         COUNT(*) FILTER (WHERE processing_status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE processing_status = 'duplicate') AS duplicate,
         COUNT(*) FILTER (WHERE hmac_verified = TRUE) AS hmac_verified,
         COUNT(*) FILTER (WHERE hmac_verified = FALSE) AS hmac_unverified
       FROM webhook_event_log ${where}`,
      params
    );

    return res.json({ success: true, stats });
  } catch (error) {
    console.error('[idempotentWebhook] stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export default {
  listWebhookEvents,
  getWebhookEvent,
  retryWebhookEvent,
  webhookEventStats
};