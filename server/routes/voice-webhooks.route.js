/** Receives async call-status callbacks from providers whose connector details() can't poll
 * status on demand. The path segment after the provider name is a shared-secret token (constant-
 * time compared) — neither TeleCMI's nor Tata's documented webhook mechanism offers real
 * signature verification, so this is the best available mitigation, not cryptographic auth.
 * Stores a normalized record in Redis keyed by the provider call id, which voice-connector's
 * details() operation reads back. */
import express from 'express';
import crypto from 'node:crypto';
import { cache } from '../db/redis.js';
import { recordTelecmiCdr, normalizeTelecmi } from '../services/crm-telecmi-calls.service.js';
import { routeIncoming, handleLiveEvent, updateLiveCall } from '../services/telecmi-control.service.js';

const TTL_SECONDS = 86400;

function tokenOk(provided, expected) {
  if (!expected || typeof provided !== 'string' || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function buildVoiceWebhooksRouter() {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  // Tata Smartflo: documented field names (docs.smartflo.tatatelebusiness.com/docs/webhook).
  router.post('/tata/:token', async (req, res) => {
    if (!tokenOk(req.params.token, process.env.VOICE_TATA_WEBHOOK_TOKEN)) return res.status(404).end();
    const b = req.body || {};
    const refId = b.ref_id || b.$ref_id;
    if (refId) {
      await cache.set(`voice:tata:${refId}`, {
        Sid: refId, Status: b.call_status || b.$call_status || 'unknown',
        Duration: b.duration ?? b.$duration ?? null, DateUpdated: new Date().toISOString(),
        Direction: b.direction || b.$direction || 'outbound',
      }, TTL_SECONDS).catch(() => {});
    }
    res.status(200).json({ ok: true });
  });

  // TeleCMI CHUB webhooks (doc.telecmi.com/chub/docs/webhooks-overview). Configure in the TeleCMI
  // dashboard: Settings > Webhooks, POST, both "call report" (type cdr) and "notify" (type event).
  // CDRs become call records on the caller's lead; live events update the status voice-connector
  // details() reads for click-to-call. Only the payload shape is logged, never numbers.
  router.post('/telecmi/:token', async (req, res) => {
    if (!tokenOk(req.params.token, process.env.VOICE_TELECMI_WEBHOOK_TOKEN)) return res.status(404).end();
    const b = req.body || {};
    const c = normalizeTelecmi(b);
    for (const id of [c.requestId, b.call_id, b.cmiuuid].filter(Boolean)) {
      await cache.set(`voice:telecmi:${id}`, {
        Sid: id, Status: c.status || 'unknown', Duration: c.answeredSec || null, Direction: c.direction, DateUpdated: new Date().toISOString(),
      }, TTL_SECONDS).catch(() => {});
    }
    let outcome = { ignored: true };
    const tenantId = Number(process.env.CRM_TENANT_ID);
    if (c.type === 'event') await handleLiveEvent(tenantId, c, b).catch((e) => console.warn('[voice-webhook] live event:', e.message));
    if (c.type === 'cdr') {
      for (const id of [b.conversation_uuid, b.cmiuuid].filter(Boolean)) await updateLiveCall(tenantId, String(id), null).catch(() => {});
      try { outcome = await recordTelecmiCdr(tenantId, b); }
      catch (error) { console.error('[voice-webhook] telecmi cdr not saved:', error.message); return res.status(500).json({ ok: false }); }
    }
    console.log('[voice-webhook] telecmi', JSON.stringify({ type: c.type, direction: c.direction, status: c.status, leg: c.leg, keys: Object.keys(b).slice(0, 25), ...outcome }));
    res.status(200).json({ ok: true });
  });

  // TeleCMI HTTP call flow (doc.telecmi.com/chub/docs/http): asked on each incoming call; the CRM
  // identifies the caller and answers which agents to ring (lead owner first). POST or GET.
  const flow = async (req, res) => {
    if (!tokenOk(req.params.token, process.env.VOICE_TELECMI_WEBHOOK_TOKEN)) return res.status(404).end();
    const b = { ...(req.query || {}), ...(req.body || {}) };
    const tenantId = Number(process.env.CRM_TENANT_ID);
    try {
      const { route, response } = await routeIncoming(tenantId, b);
      await cache.set(`voice:telecmi:lastflow:${tenantId}`, { at: new Date().toISOString(), route }, 7 * 86400).catch(() => {});
      console.log('[voice-webhook] telecmi flow', JSON.stringify({ route, agents: (response.result || []).length }));
      res.status(200).json(response);
    } catch (error) {
      console.error('[voice-webhook] telecmi flow failed:', error.message);
      res.status(200).json({ code: 200, loop: 1, followme: true, hangup: false, timeout: 25, result: [] });
    }
  };
  router.post('/telecmi-flow/:token', flow);
  router.get('/telecmi-flow/:token', flow);

  return router;
}
