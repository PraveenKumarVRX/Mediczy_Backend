import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import sharedPool from '../db/pgPool.js';
import {
  findExistingLead,
  runPostCaptureAutomation,
} from '../services/crm-lead-automation.service.js';
import { handleSocialMessagingEntry } from '../services/social-inbox.service.js';
import { processNormalizedWebhook, resolveSocialAccountTenant } from '../services/crm-brightbean-chat.service.js';

const router = express.Router();

const FB_APP_SECRET        = process.env.FB_APP_SECRET || '';
const FB_VERIFY_TOKEN      = process.env.FB_VERIFY_TOKEN || '';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const GRAPH_API_VERSION    = 'v19.0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verifySignature(rawBody, signatureHeader) {
  if (!FB_APP_SECRET) return true; // skip if not configured (dev only)
  if (!signatureHeader) return false;
  const [algo, hash] = signatureHeader.split('=');
  if (algo !== 'sha256') return false;
  const expected = crypto.createHmac('sha256', FB_APP_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

async function fetchLeadFromGraph(leadgenId) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}`;
  const { data } = await axios.get(url, {
    params: { access_token: FB_PAGE_ACCESS_TOKEN },
    timeout: 8000,
  });
  return data;
}

function parseFieldData(fieldData = []) {
  return fieldData.reduce((acc, { name, values }) => {
    acc[name] = Array.isArray(values) ? values[0] : values;
    return acc;
  }, {});
}

function cleanPhone(raw = '') {
  const s = String(raw).trim();
  return s.startsWith('+') ? '+' + s.slice(1).replace(/\D/g, '') : s.replace(/\D/g, '');
}

function toE164(phone) {
  if (!phone) return null;
  return phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;
}

// ─── Webhook verification (GET) ───────────────────────────────────────────────

router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    console.info('[FB Leads] Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('[FB Leads] Webhook verification failed', { mode, token });
  return res.status(403).json({ error: 'Verification failed' });
});

// ─── Webhook events (POST) ────────────────────────────────────────────────────

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature-256'] || '';
    const rawBody   = req.body;

    if (!verifySignature(rawBody, signature)) {
      console.warn('[FB Leads] Signature mismatch — rejecting payload');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Acknowledge immediately — Facebook retries if we don't respond in 20 s
    res.status(200).json({ received: true });

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      console.error('[FB Leads] Failed to parse webhook body');
      return;
    }

    if (payload.object !== 'page' && payload.object !== 'instagram') return;

    // Normalize comment/story/follow events through the tenant-scoped CRM
    // trigger engine. Unknown social accounts are ignored until an operator
    // registers their accountId in Social Growth settings.
    processNormalizedWebhook(payload).catch((err) =>
      console.error('[Social Growth] normalized webhook processing failed:', err.message)
    );

    for (const entry of payload.entry || []) {
      // Lead Ads (Page object only) — existing CRM lead capture pipeline
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue;
        const { leadgen_id, page_id, form_id, ad_id, adset_id, campaign_id } = change.value || {};
        if (!leadgen_id) continue;

        processLead({ leadgen_id, page_id, form_id, ad_id, adset_id, campaign_id }).catch((err) =>
          console.error('[FB Leads] processLead error:', err.message)
        );
      }

      // Messenger (Page object) / Instagram Direct — Team Social Inbox
      if (Array.isArray(entry.messaging) && entry.messaging.length) {
        const channel = payload.object === 'instagram' ? 'instagram' : 'facebook';
        resolveSocialAccountTenant(channel, entry.id).then((tenantUid) => handleSocialMessagingEntry(entry, channel, tenantUid)).catch((err) =>
          console.error('[Social Inbox] handleSocialMessagingEntry error:', err.message)
        );
      }
    }
  }
);

// ─── Lead processing (async, after 200 response) ─────────────────────────────

async function processLead({ leadgen_id, page_id, form_id, ad_id, adset_id, campaign_id }) {
  console.info('[FB Leads] Processing lead', { leadgen_id, page_id, form_id });

  let graphData;
  try {
    graphData = await fetchLeadFromGraph(leadgen_id);
  } catch (err) {
    console.error('[FB Leads] Graph API fetch failed', { leadgen_id, error: err.message });
    return;
  }

  const fields = parseFieldData(graphData.field_data);

  const name        = fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'Unknown';
  const email       = fields.email || null;
  const rawPhone    = fields.phone_number || fields.phone || '';
  const phone       = cleanPhone(rawPhone) || rawPhone || null;
  const phoneE164   = toE164(phone);
  const company     = fields.company_name || fields.organization || fields.company || null;
  const city        = fields.city || null;
  const designation = fields.job_title || fields.designation || null;
  const notes       = fields.message || fields.comments || fields.additional_info || null;

  const tags = JSON.stringify(['facebook-lead-ads', 'fb-leads', 'marketing']);
  const customFields = JSON.stringify({
    leadgen_id,
    page_id,
    form_id,
    ad_id:         ad_id         || null,
    adset_id:      adset_id      || null,
    campaign_id:   campaign_id   || null,
    fb_created_at: graphData.created_time || null,
    city,
    rawFields: fields,
    source: 'facebook-lead-ads',
    capturedAt: new Date().toISOString(),
  });

  // Dedup: skip if same leadgen_id or recent email/phone match
  const existing = await findExistingLead({ leadgenId: leadgen_id, email, phone });
  if (existing) {
    console.info('[FB Leads] Duplicate lead — updating existing', { leadId: existing.id, leadgen_id });
    await sharedPool.query(
      `UPDATE crm_leads SET
         name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone),
         company = COALESCE($4, company),
         custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $5::jsonb,
         updated_at = NOW()
       WHERE id = $6`,
      [name, email, phone, company, customFields, existing.id]
    );
    runPostCaptureAutomation(existing.id, { phoneE164, leadgenId: leadgen_id }).catch(() => {});
    return;
  }

  let leadId = null;
  try {
    const result = await sharedPool.query(
      `INSERT INTO crm_leads
         (name, email, phone, company, designation, source, status, priority, notes, tags, custom_fields, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [name, email, phone, company, designation, 'facebook-lead-ads', 'new', 'high', notes, tags, customFields, 0]
    );
    leadId = result.rows[0]?.id || null;
    console.info('[FB Leads] Lead stored in CRM', { leadId, name, phone });
  } catch (err) {
    console.error('[FB Leads] Failed to store CRM lead', { leadgen_id, error: err.message });
    return;
  }

  if (leadId) {
    runPostCaptureAutomation(leadId, { phoneE164, leadgenId: leadgen_id }).catch(() => {});
  }
}

// ─── Manual test endpoint ─────────────────────────────────────────────────────
// POST /api/fb-leads/test-lead   body: { name, email, phone, company }

router.post('/test-lead', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.FB_TEST_LEADS_ALLOWED) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { name = 'Test Lead', email = null, phone = null, company = null } = req.body;
  const phoneE164 = toE164(phone);

  const tags = JSON.stringify(['facebook-lead-ads', 'fb-leads', 'test']);
  const customFields = JSON.stringify({
    source: 'facebook-lead-ads',
    testMode: true,
    leadgen_id: `test_${Date.now()}`,
    capturedAt: new Date().toISOString(),
  });

  try {
    const result = await sharedPool.query(
      `INSERT INTO crm_leads
         (name, email, phone, company, source, status, priority, tags, custom_fields, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [name, email, phone, company, 'facebook-lead-ads', 'new', 'high', tags, customFields, 0]
    );
    const leadId = result.rows[0]?.id;

    if (leadId) {
      runPostCaptureAutomation(leadId, { phoneE164, leadgenId: 'test' }).catch(() => {});
    }

    return res.json({ success: true, leadId, automationTriggered: !!leadId });
  } catch (err) {
    console.error('[FB Leads test] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
