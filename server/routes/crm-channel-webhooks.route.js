/** Public inbound-channel webhooks for the dedicated CRM. The path token is the authentication:
 * Gupshup documents no request signing or custom headers for this callback, so a constant-time
 * compared secret in the configured URL is the strongest check available. Every event is recorded
 * in crm_channel_events (message bodies excluded) and routed to its handler. */
import express from 'express';
import crypto from 'node:crypto';
import { getTenantGupshupConfig, parseWebhook, recordInboundMessage, recordDeliveryStatus } from '../services/crm-whatsapp-inbound.service.js';
import { handleTemplateEvent, handleAccountEvent, handleUserEvent, logChannelEvent } from '../services/gupshup-control.service.js';

const tokenOk = provided => {
  const expected = process.env.CRM_WHATSAPP_WEBHOOK_TOKEN;
  if (!expected || typeof provided !== 'string' || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};
const SYSTEM_EVENTS = { 'template-event': handleTemplateEvent, 'account-event': handleAccountEvent, 'user-event': handleUserEvent,
  'billing-event': async (_t, p) => `Billing ${p?.type || 'event'}${p?.deductions?.type ? `: ${p.deductions.type}` : ''}` };

export function buildCrmChannelWebhooksRouter({ tenantId }) {
  const router = express.Router();

  // Gupshup checks the callback URL with GET/HEAD (or an empty POST) before saving it.
  router.get('/whatsapp/:token', (req, res) => (tokenOk(req.params.token) ? res.status(200).send('ok') : res.status(404).end()));
  router.head('/whatsapp/:token', (req, res) => res.status(tokenOk(req.params.token) ? 200 : 404).end());

  router.post('/whatsapp/:token', async (req, res) => {
    if (!tokenOk(req.params.token)) return res.status(404).end();
    const config = await getTenantGupshupConfig(tenantId).catch(() => null);
    if (!config) return res.status(200).json({ ok: true, ignored: 'whatsapp_not_configured' });
    const body = req.body || {};

    // Template reviews, account health, opt-ins, billing.
    const system = Number(body.version) === 2 && SYSTEM_EVENTS[body.type];
    if (system) {
      if (body.app !== config.appName) { console.warn('[crm-whatsapp] rejected event for app', body.app); return res.status(200).json({ ok: true, ignored: 'rejected' }); }
      try {
        const summary = await system(tenantId, body.payload || {});
        await logChannelEvent(tenantId, { type: body.type, subtype: body.payload?.type, reference: body.payload?.id || body.payload?.elementName, summary, payload: body.payload });
        console.log('[crm-whatsapp]', body.type, summary);
        return res.status(200).json({ ok: true });
      } catch (error) {
        console.error('[crm-whatsapp] event processing failed:', body.type, error.message);
        return res.status(500).json({ ok: false });
      }
    }

    let events;
    try { events = parseWebhook(body, config); } catch (error) {
      console.warn('[crm-whatsapp] rejected webhook:', error.message);
      return res.status(200).json({ ok: true, ignored: 'rejected' });
    }
    if (!events.length) {
      // Shape only, never content: lets an unrecognised format be diagnosed instead of vanishing.
      console.log('[crm-whatsapp] no message in webhook', JSON.stringify({ version: body.version ?? null, type: body.type ?? null,
        object: body.object ?? null, innerType: body.payload?.type ?? null, keys: Object.keys(body).slice(0, 10) }));
    }
    try {
      for (const event of events) {
        if (event.kind === 'message') {
          const result = await recordInboundMessage(tenantId, event);
          console.log('[crm-whatsapp] inbound', JSON.stringify({ messageId: event.id, ...result }));
          if (!result.duplicate) {
            await logChannelEvent(tenantId, { type: 'message', subtype: 'inbound', reference: event.id,
              summary: `Message from ****${event.from.slice(-4)}${result.created ? ' (new lead)' : ''}`, payload: { leadId: result.legacyLeadId, conversationId: result.conversationId } });
          }
        } else if (event.kind === 'status') {
          await recordDeliveryStatus(tenantId, event);
          await logChannelEvent(tenantId, { type: 'message-event', subtype: event.status, reference: event.sid,
            summary: `Message ${event.status}${event.errorCode ? ` (error ${event.errorCode})` : ''}`, payload: { errorCode: event.errorCode } });
        }
      }
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[crm-whatsapp] processing failed:', error.message);
      return res.status(500).json({ ok: false }); // Gupshup retries; the message-id dedupe makes that safe.
    }
  });

  return router;
}
