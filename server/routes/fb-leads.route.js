import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

const FB_APP_SECRET        = process.env.FB_APP_SECRET || '';
const FB_VERIFY_TOKEN      = process.env.FB_VERIFY_TOKEN || '';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const GRAPH_API_VERSION    = 'v19.0';
const N8N_WEBHOOK_URL      = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/fb-lead-intake';

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

// Fire-and-forget: trigger n8n automation sequence (Day 0 WA → Day 2 → Day 4)
function triggerN8nAutomation(payload) {
  axios.post(N8N_WEBHOOK_URL, payload, { timeout: 5000 })
    .then(() => console.info('[FB Leads] n8n automation triggered', { leadId: payload.leadId }))
    .catch((err) => console.warn('[FB Leads] n8n trigger failed (non-fatal):', err.message));
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

    if (payload.object !== 'page') return;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue;
        const { leadgen_id, page_id, form_id, ad_id, adset_id, campaign_id } = change.value || {};
        if (!leadgen_id) continue;

        processLead({ leadgen_id, page_id, form_id, ad_id, adset_id, campaign_id }).catch((err) =>
          console.error('[FB Leads] processLead error:', err.message)
        );
      }
    }
  }
);

// ─── Lead processing (async, after 200 response) ─────────────────────────────

async function processLead({ leadgen_id, page_id, form_id, ad_id, adset_id, campaign_id }) {
  console.info('[FB Leads] Processing lead', { leadgen_id, page_id, form_id });

  // 1. Fetch field data from Graph API
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

  // 2. Store in CRM (always — reliable even if n8n is down)
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
  }

  // 3. Trigger n8n automation sequence (WhatsApp Day 0 → Day 2 → Day 4)
  //    fire-and-forget — CRM capture is already done above
  if (phoneE164) {
    triggerN8nAutomation({ name, email, phone: phoneE164, company, leadId, leadgen_id, form_id });
  } else {
    console.info('[FB Leads] No phone — skipping n8n automation', { leadId });
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

    if (phoneE164) {
      triggerN8nAutomation({ name, email, phone: phoneE164, company, leadId, leadgen_id: 'test' });
    }

    return res.json({ success: true, leadId, n8nTriggered: !!phoneE164 });
  } catch (err) {
    console.error('[FB Leads test] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
