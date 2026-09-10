import sharedPool from '../db/pgPool.js';
import axios from 'axios';
import { sendTransactionalEmail } from './welcome-email.service.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { SMSService } from './sms.service.js';
import { resolveV2LeadByLegacyId, CRM_V2_DEFAULT_TENANT_ID } from './crm-v2-sync.service.js';

const CHANNELS = new Set(['email', 'whatsapp', 'sms', 'push', 'in_app']);
const CAMPAIGN_STATUSES = new Set(['draft', 'active', 'paused', 'completed', 'archived']);
const TEMPLATE_STATUSES = new Set(['draft', 'pending_approval', 'approved', 'archived']);

function tenantId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

function positiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function dateRange({ from, to } = {}) {
  const end = to || new Date().toISOString();
  const start = from || new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
  return { start, end };
}

function rate(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  return d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0;
}

function json(value, fallback = {}) {
  if (value == null) return fallback;
  return typeof value === 'object' ? value : JSON.parse(value);
}

export async function getCommunicationHubDashboard(tenant, query = {}) {
  const id = tenantId(tenant);
  const { start, end } = dateRange(query);
  const params = [id, start, end];

  const [overview, channels, campaigns, integrations, conversations, activity, alerts, templates] = await Promise.all([
    sharedPool.query(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('queued', 'pending'))::int AS queued,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'delivered' OR delivered_at IS NOT NULL))::int AS delivered,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status IN ('failed', 'bounced') OR failed_at IS NOT NULL))::int AS failed,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'opened' OR read_at IS NOT NULL))::int AS opened,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'clicked' OR clicked_at IS NOT NULL))::int AS clicked,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
        COUNT(DISTINCT identity_id) FILTER (WHERE direction = 'outbound')::int AS reached
      FROM crm_communication_events
      WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
    `, params),
    sharedPool.query(`
      SELECT channel,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'delivered' OR delivered_at IS NOT NULL))::int AS delivered,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'failed' OR status = 'bounced' OR failed_at IS NOT NULL))::int AS failed,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'opened' OR read_at IS NOT NULL))::int AS opened,
        COUNT(*) FILTER (WHERE direction = 'outbound' AND (status = 'clicked' OR clicked_at IS NOT NULL))::int AS clicked
      FROM crm_communication_events
      WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
      GROUP BY channel ORDER BY sent DESC
    `, params),
    sharedPool.query(`
      SELECT c.id, c.name, c.channel, c.platform, c.lifecycle_status, c.objective,
        c.audience_ref, c.template_ref, c.budget_amount, c.last_run_at, c.last_error,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS sent,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status = 'delivered' OR e.delivered_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS delivered,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status IN ('failed', 'bounced') OR e.failed_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS failed,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status = 'opened' OR e.read_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS opened,
        COALESCE((SELECT COUNT(*) FROM crm_communication_events e WHERE e.tenant_id = c.tenant_id AND e.campaign_id = c.id AND e.direction = 'outbound' AND (e.status = 'clicked' OR e.clicked_at IS NOT NULL) AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz), 0)::int AS clicked,
        COALESCE((SELECT SUM(r.net_amount) FROM crm_revenue_events r WHERE r.tenant_id = c.tenant_id AND r.metadata->>'campaign_id' = c.id::text AND r.revenue_date >= $2::date AND r.revenue_date <= $3::date), 0)::numeric AS revenue,
        COALESCE((SELECT SUM(cc.amount) FROM crm_campaign_costs cc WHERE cc.tenant_id = c.tenant_id AND cc.campaign_id = c.id AND cc.cost_date >= $2::date AND cc.cost_date <= $3::date), 0)::numeric AS spend
      FROM crm_campaigns_unified c
      WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC LIMIT 100
    `, params),
    sharedPool.query(`
      SELECT i.id, i.provider, i.integration_type, i.status, i.account_ref,
        i.last_sync_at, i.last_sync_status, i.health_score, i.health_message,
        i.last_health_check_at,
        run.status AS latest_run_status, run.started_at AS latest_run_at,
        run.records_seen AS latest_records_seen, run.records_failed AS latest_records_failed,
        COALESCE(err.open_errors, 0)::int AS open_errors
      FROM crm_marketing_integrations i
      LEFT JOIN LATERAL (
        SELECT status, started_at, records_seen, records_failed
        FROM crm_integration_runs r
        WHERE r.tenant_id = i.tenant_id AND r.integration_name = i.provider
        ORDER BY started_at DESC LIMIT 1
      ) run ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE status IN ('open', 'retrying')) AS open_errors
        FROM crm_integration_errors e
        WHERE e.tenant_id = i.tenant_id AND e.integration_name = i.provider
      ) err ON TRUE
      WHERE i.tenant_id = $1
      ORDER BY CASE WHEN i.status IN ('error', 'degraded') THEN 0 ELSE 1 END, i.provider
    `, [id]),
    sharedPool.query(`
      SELECT c.id, c.channel, c.status, c.last_message_at, c.lead_id,
        COALESCE(p.display_name, 'Unknown patient') AS contact_name,
        last_event.body_preview AS last_message,
        last_event.direction AS last_direction,
        last_event.status AS last_event_status
      FROM crm_conversations c
      LEFT JOIN crm_person_identities p ON p.id = c.identity_id AND p.tenant_id = c.tenant_id
      LEFT JOIN LATERAL (
        SELECT body_preview, direction, status
        FROM crm_communication_events e
        WHERE e.tenant_id = c.tenant_id AND e.conversation_id = c.id
        ORDER BY e.created_at DESC LIMIT 1
      ) last_event ON TRUE
      WHERE c.tenant_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST LIMIT 25
    `, [id]),
    sharedPool.query(`
      SELECT e.id, e.channel, e.direction, e.message_type, e.status, e.body_preview,
        e.created_at, e.failure_reason, e.provider,
        COALESCE(p.display_name, 'Unknown patient') AS contact_name,
        c.name AS campaign_name
      FROM crm_communication_events e
      LEFT JOIN crm_person_identities p ON p.id = e.identity_id AND p.tenant_id = e.tenant_id
      LEFT JOIN crm_campaigns_unified c ON c.id = e.campaign_id AND c.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.created_at >= $2::timestamptz AND e.created_at < $3::timestamptz
      ORDER BY e.created_at DESC LIMIT 30
    `, params),
    sharedPool.query(`
      SELECT id, alert_type, severity, title, details, source_type, source_id, status, last_seen_at
      FROM crm_communication_hub_alerts
      WHERE tenant_id = $1 AND status <> 'resolved'
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC
      LIMIT 25
    `, [id]),
    sharedPool.query(`
      SELECT id, name, channel, category, subject, body, variables, status, version, updated_at
      FROM crm_communication_templates
      WHERE tenant_id = $1 AND status <> 'archived'
      ORDER BY updated_at DESC LIMIT 100
    `, [id]),
  ]);

  const o = overview.rows[0] || {};
  return {
    period: { from: start, to: end },
    overview: {
      ...o,
      deliveryRate: rate(o.delivered, o.sent - Number(o.queued || 0)),
      openRate: rate(o.opened, o.delivered || o.sent),
      clickRate: rate(o.clicked, o.delivered || o.sent),
      failureRate: rate(o.failed, o.sent),
    },
    channels: channels.rows.map((row) => ({ ...row, deliveryRate: rate(row.delivered, row.sent), openRate: rate(row.opened, row.delivered || row.sent), clickRate: rate(row.clicked, row.delivered || row.sent) })),
    campaigns: campaigns.rows.map((row) => ({ ...row, revenue: Number(row.revenue || 0), spend: Number(row.spend || 0), roas: Number(row.spend || 0) > 0 ? Number((Number(row.revenue || 0) / Number(row.spend)).toFixed(2)) : 0 })),
    integrations: integrations.rows,
    conversations: conversations.rows,
    activity: activity.rows,
    alerts: alerts.rows,
    templates: templates.rows.map((row) => ({ ...row, variables: json(row.variables, []) })),
  };
}

export async function listCommunicationHubCampaigns(tenant, query = {}) {
  return (await getCommunicationHubDashboard(tenant, query)).campaigns;
}

export async function createCommunicationHubCampaign(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const channel = String(input.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('A supported campaign channel is required'), { statusCode: 400 });
  if (!String(input.name || '').trim()) throw Object.assign(new Error('Campaign name is required'), { statusCode: 400 });
  const result = await sharedPool.query(`
    INSERT INTO crm_campaigns_unified
      (tenant_id, channel, platform, name, objective, lifecycle_status, audience_ref, template_ref, budget_amount, starts_at, ends_at, metadata, created_by)
    VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11::jsonb, $12)
    RETURNING *
  `, [id, channel, input.platform || 'crm', String(input.name).trim(), input.objective || 'patient_engagement', input.audienceRef || null, input.templateRef || null, input.budgetAmount == null ? null : Number(input.budgetAmount), input.startsAt || null, input.endsAt || null, JSON.stringify(input.metadata || {}), actorUserId || null]);
  return result.rows[0];
}

export async function updateCommunicationHubCampaignStatus(tenant, campaignId, status, actorUserId) {
  const id = tenantId(tenant);
  if (!CAMPAIGN_STATUSES.has(status)) throw Object.assign(new Error('Unsupported campaign status'), { statusCode: 400 });
  const result = await sharedPool.query(`
    UPDATE crm_campaigns_unified
    SET lifecycle_status = $1, updated_at = NOW(), last_error = CASE WHEN $1 = 'active' THEN NULL ELSE last_error END
    WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL
    RETURNING *
  `, [status, id, positiveInt(campaignId)]);
  if (!result.rows[0]) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  return result.rows[0];
}

export async function listCommunicationHubTemplates(tenant, { channel, status } = {}) {
  const id = tenantId(tenant);
  const values = [id];
  const filters = ['tenant_id = $1'];
  if (channel && CHANNELS.has(String(channel).toLowerCase())) { values.push(String(channel).toLowerCase()); filters.push(`channel = $${values.length}`); }
  if (status && TEMPLATE_STATUSES.has(String(status))) { values.push(String(status)); filters.push(`status = $${values.length}`); }
  return (await sharedPool.query(`SELECT * FROM crm_communication_templates WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC`, values)).rows;
}

export async function createCommunicationHubTemplate(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const channel = String(input.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('A supported template channel is required'), { statusCode: 400 });
  if (!String(input.name || '').trim()) throw Object.assign(new Error('Template name is required'), { statusCode: 400 });
  const result = await sharedPool.query(`
    INSERT INTO crm_communication_templates (tenant_id, name, channel, category, subject, body, variables, status, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'draft', $8)
    RETURNING *
  `, [id, String(input.name).trim(), channel, input.category || 'general', input.subject || null, input.body || '', JSON.stringify(input.variables || []), actorUserId || null]);
  return result.rows[0];
}

export async function recordCommunicationIntegrationHealth(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const integrationId = positiveInt(input.integrationId);
  if (!integrationId) throw Object.assign(new Error('integrationId is required'), { statusCode: 400 });
  const result = await sharedPool.query(`
    UPDATE crm_marketing_integrations
    SET status = $1, health_score = $2, health_message = $3, last_health_check_at = NOW(), last_sync_at = COALESCE($4::timestamptz, last_sync_at), last_sync_status = $1, updated_at = NOW()
    WHERE tenant_id = $5 AND id = $6
    RETURNING *
  `, [input.status || 'connected', input.healthScore == null ? null : Math.max(0, Math.min(100, Number(input.healthScore))), input.healthMessage || null, input.lastSyncAt || null, id, integrationId]);
  if (!result.rows[0]) throw Object.assign(new Error('Integration not found'), { statusCode: 404 });
  return result.rows[0];
}

export async function acknowledgeCommunicationHubAlert(tenant, alertId, actorUserId) {
  const id = tenantId(tenant);
  const result = await sharedPool.query(`
    UPDATE crm_communication_hub_alerts
    SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW(), updated_at = NOW()
    WHERE tenant_id = $2 AND id = $3 AND status = 'open'
    RETURNING *
  `, [actorUserId || null, id, positiveInt(alertId)]);
  if (!result.rows[0]) throw Object.assign(new Error('Open alert not found'), { statusCode: 404 });
  return result.rows[0];
}

// ─── Real send + call-log surfacing, scoped to CRM leads/contacts/deals only ──
// (Corporate-account messaging stays Team-only; see server/routes/team.route.js
// /communications/* for that path. This mirrors the same provider integrations
// so both surfaces send through the same email/WhatsApp/SMS backends.)

const _normalizeEmail = (input = '') => String(input || '').trim().toLowerCase();

const _normalizePhone = (input = '') => {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const _smsService = () => {
  const apiKey = process.env.SMS_API_KEY || '';
  if (!apiKey) return null;
  return new SMSService({
    provider: process.env.SMS_PROVIDER || 'pay4sms',
    apiKey,
    apiSecret: process.env.SMS_API_SECRET || '',
    senderId: process.env.SMS_SENDER_ID || 'MSMART',
    templateId: process.env.SMS_TEMPLATE_ID,
    otpTemplateId: process.env.SMS_OTP_TEMPLATE_ID,
    apiUrl: process.env.SMS_API_URL,
  });
};

const _buildCrmEmailHtml = ({ subject, message }) => {
  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(12,38,74,.12);">
        <tr><td style="background:linear-gradient(120deg,#6d28d9,#4c1d95);padding:22px 28px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.08em;opacity:.9;text-transform:uppercase;">Hospital CRM Communication</div>
          <div style="font-size:24px;font-weight:700;margin-top:8px;line-height:1.25;">${esc(subject || 'CRM Communication')}</div>
        </td></tr>
        <tr><td style="padding:24px 28px 12px 28px;color:#0f172a;font-size:15px;line-height:1.75;">${esc(message).replace(/\n/g, '<br/>')}</td></tr>
        <tr><td style="border-top:1px solid #e2e8f0;padding:14px 28px;color:#64748b;font-size:12px;line-height:1.6;">Regards,<br/><strong>Hospital CRM Team</strong><br/>support@mediqzy.com</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

async function _resolveCrmRecipient({ leadId, dealId, contactId }) {
  if (leadId) {
    // crm_leads_v2 is the tenant-scoped mirror kept live by crm-v2-sync.service.js.
    // Prefer it (so sends log into crm_communication_events, feeding the hub's own
    // dashboard); fall back to the legacy row if the mirror hasn't caught up yet.
    const v2 = await resolveV2LeadByLegacyId(leadId).catch(() => null);
    if (v2) {
      return { kind: 'lead', id: leadId, v2LeadId: v2.id, v2ContactId: v2.contact_id, v2TenantId: v2.tenant_id, name: v2.name, email: v2.email, phone: v2.phone };
    }
    const { rows } = await sharedPool.query(`SELECT id, name, email, phone FROM crm_leads WHERE id = $1`, [leadId]);
    if (!rows[0]) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
    return { kind: 'lead', id: rows[0].id, name: rows[0].name, email: rows[0].email, phone: rows[0].phone };
  }
  if (dealId) {
    const { rows } = await sharedPool.query(`SELECT id, contact_name, contact_email, contact_phone FROM crm_deals WHERE id = $1`, [dealId]);
    if (!rows[0]) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });
    return { kind: 'deal', id: rows[0].id, name: rows[0].contact_name, email: rows[0].contact_email, phone: rows[0].contact_phone };
  }
  if (contactId) {
    const { rows } = await sharedPool.query(`SELECT id, name, email, phone FROM crm_contacts WHERE id = $1`, [contactId]);
    if (!rows[0]) throw Object.assign(new Error('Contact not found'), { statusCode: 404 });
    return { kind: 'contact', id: rows[0].id, name: rows[0].name, email: rows[0].email, phone: rows[0].phone };
  }
  throw Object.assign(new Error('One of leadId, dealId, or contactId is required'), { statusCode: 400 });
}

/**
 * Find-or-create the open thread for a lead+channel — Phase 4 (conversation
 * inbox). Deliberately outbound-only for now: no inbound webhook is wired to
 * this yet (a real inbound WhatsApp/email conversation platform already
 * exists at server/routes/whatsapp-production.route.js, serving a different
 * part of the app — bridging that into the CRM's v2 world is real, separate
 * work, not attempted here). This just means every CRM send now creates or
 * continues a visible thread instead of only ever appearing in the dashboard.
 */
export async function findOrCreateConversation({ tenantId, leadId, channel }) {
  if (!leadId) return null;
  const existing = await sharedPool.query(
    `SELECT id FROM crm_conversations WHERE tenant_id = $1 AND lead_id = $2 AND channel = $3 AND status != 'closed' ORDER BY created_at DESC LIMIT 1`,
    [tenantId, leadId, channel]
  );
  if (existing.rows[0]) {
    await sharedPool.query(`UPDATE crm_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const { rows: leadRows } = await sharedPool.query(`SELECT person_id FROM crm_leads_v2 WHERE id = $1`, [leadId]);
  const created = await sharedPool.query(
    `INSERT INTO crm_conversations (tenant_id, lead_id, identity_id, channel, status, last_message_at) VALUES ($1,$2,$3,$4,'open',NOW()) RETURNING id`,
    [tenantId, leadId, leadRows[0]?.person_id || null, channel]
  );
  return created.rows[0].id;
}

async function _logCrmCommunication({ channel, recipientLabel, subject, message, status, provider, providerMessageId, errorMessage, leadId, dealId, v2LeadId, v2ContactId, v2TenantId, userId }) {
  const failed = Boolean(errorMessage);
  const bodyPreview = message ? String(message).slice(0, 2000) : null;

  if (v2LeadId || v2ContactId) {
    // Tenant-scoped path — feeds getCommunicationHubDashboard() directly.
    const tenantId = v2TenantId || CRM_V2_DEFAULT_TENANT_ID;
    const conversationId = await findOrCreateConversation({ tenantId, leadId: v2LeadId, channel }).catch(() => null);
    await sharedPool.query(
      `INSERT INTO crm_communication_events
         (tenant_id, lead_id, contact_id, conversation_id, channel, direction, message_type, subject, body_preview,
          provider, provider_message_id, status, sent_at, failed_at, failure_reason, owner_user_id, metadata)
       VALUES ($1,$2,$3,$4,$5,'outbound','message',$6,$7,$8,$9,$10::varchar,
               CASE WHEN $10::varchar = 'sent' THEN NOW() ELSE NULL END,
               CASE WHEN $10::varchar = 'failed' THEN NOW() ELSE NULL END,
               $11,$12,$13)`,
      [
        tenantId, v2LeadId || null, v2ContactId || null, conversationId, channel,
        subject || null, bodyPreview, provider || null, providerMessageId || null,
        failed ? 'failed' : (status || 'sent'), errorMessage || null, userId || null,
        JSON.stringify({ recipientLabel }),
      ]
    );
    return;
  }

  // Fallback — deal/contact-sourced sends (no v2 mirror) or a lead not yet synced.
  const outcome = failed ? `failed: ${errorMessage}`.slice(0, 100) : (status || 'sent');
  const title = `${channel} to ${recipientLabel}`.slice(0, 255);
  const description = [subject ? `Subject: ${subject}` : null, message, provider ? `Provider: ${provider}` : null, providerMessageId ? `Ref: ${providerMessageId}` : null]
    .filter(Boolean).join('\n');
  await sharedPool.query(
    `INSERT INTO crm_activities (type, title, description, lead_id, deal_id, outcome, completed_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)`,
    [channel, title, description, leadId || null, dealId || null, outcome, userId || null]
  );
  if (leadId) {
    await sharedPool.query(`UPDATE crm_leads SET last_contacted = NOW(), updated_at = NOW() WHERE id = $1`, [leadId]);
  }
}

/**
 * Low-level per-channel dispatch, no recipient resolution or CRM logging —
 * used by the segment blast worker, which already has recipient info from
 * the segment membership query. sendCrmMessage() (below) is the 1:1 path.
 */
export async function dispatchToChannel({ channel, to, subject, message }) {
  const safeChannel = String(channel || '').toLowerCase();
  const safeMessage = String(message || '').trim();

  if (safeChannel === 'email') {
    const email = _normalizeEmail(to);
    if (!/^\S+@\S+\.\S+$/.test(email)) return { success: false, provider: 'unified', error: 'Invalid email address' };
    const safeSubject = String(subject || 'Hospital CRM Communication').slice(0, 200);
    try {
      await sendTransactionalEmail({ to: email, subject: safeSubject, html: _buildCrmEmailHtml({ subject: safeSubject, message: safeMessage }), text: safeMessage, fromName: 'Hospital CRM' });
      return { success: true, provider: 'unified', recipient: email };
    } catch (err) {
      return { success: false, provider: 'unified', recipient: email, error: err?.message || 'Email send failed' };
    }
  }

  if (safeChannel === 'whatsapp') {
    const phone = _normalizePhone(to);
    if (!phone || phone.length < 10) return { success: false, provider: 'twilio', error: 'Invalid WhatsApp number' };
    if (whatsappProductionService?.twilioConfigured) {
      try {
        const response = await whatsappProductionService.sendSessionMessage({ to: phone, body: safeMessage.slice(0, 4096) });
        return { success: true, provider: 'twilio', recipient: phone, providerMessageId: response?.sid };
      } catch (err) {
        return { success: false, provider: 'twilio', recipient: phone, error: err?.message || 'WhatsApp send failed' };
      }
    }
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) return { success: false, provider: 'meta', error: 'WhatsApp not configured' };
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: safeMessage.slice(0, 4096) } },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      return { success: true, provider: 'meta', recipient: phone, providerMessageId: response?.data?.messages?.[0]?.id || null };
    } catch (err) {
      return { success: false, provider: 'meta', recipient: phone, error: err?.response?.data?.error?.message || err?.message || 'WhatsApp send failed' };
    }
  }

  // sms
  const smsService = _smsService();
  if (!smsService) return { success: false, provider: 'sms', error: 'SMS not configured' };
  const phone = _normalizePhone(to);
  if (!phone || phone.length < 10) return { success: false, provider: 'sms', error: 'Invalid mobile number' };
  try {
    const result = await smsService.sendSMS({ to: phone, message: safeMessage, templateId: process.env.SMS_TEMPLATE_ID });
    if (!result?.success) return { success: false, provider: result?.provider || 'sms', recipient: phone, error: result?.error || 'SMS provider rejected the message' };
    return { success: true, provider: result?.provider || 'sms', recipient: phone, providerMessageId: result?.messageId };
  } catch (err) {
    return { success: false, provider: 'sms', recipient: phone, error: err?.message || 'SMS send failed' };
  }
}

export async function sendCrmMessage({ channel, subject, message, leadId, dealId, contactId, userId }) {
  const safeChannel = String(channel || '').toLowerCase();
  if (!['email', 'whatsapp', 'sms'].includes(safeChannel)) {
    throw Object.assign(new Error('Invalid channel. Use email, whatsapp, or sms.'), { statusCode: 400 });
  }
  const safeMessage = String(message || '').trim();
  if (!safeMessage) throw Object.assign(new Error('Message is required'), { statusCode: 400 });

  const recipient = await _resolveCrmRecipient({
    leadId: positiveInt(leadId),
    dealId: positiveInt(dealId),
    contactId: positiveInt(contactId),
  });
  const recipientLabel = recipient.name || `${recipient.kind} #${recipient.id}`;
  const logBase = {
    leadId: recipient.kind === 'lead' ? recipient.id : null,
    dealId: recipient.kind === 'deal' ? recipient.id : null,
    v2LeadId: recipient.v2LeadId || null,
    v2ContactId: recipient.v2ContactId || null,
    v2TenantId: recipient.v2TenantId || null,
    userId, subject, message: safeMessage,
  };

  if (safeChannel === 'email') {
    const to = _normalizeEmail(recipient.email);
    if (!/^\S+@\S+\.\S+$/.test(to)) throw Object.assign(new Error(`${recipientLabel} has no valid email address on file`), { statusCode: 400 });
    const safeSubject = String(subject || 'Hospital CRM Communication').slice(0, 200);
    try {
      await sendTransactionalEmail({ to, subject: safeSubject, html: _buildCrmEmailHtml({ subject: safeSubject, message: safeMessage }), text: safeMessage, fromName: 'Hospital CRM' });
      await _logCrmCommunication({ ...logBase, channel: 'email', recipientLabel, subject: safeSubject, status: 'sent', provider: 'unified' });
      return { success: true, channel: safeChannel, recipient: to, status: 'sent' };
    } catch (err) {
      await _logCrmCommunication({ ...logBase, channel: 'email', recipientLabel, subject: safeSubject, status: 'failed', provider: 'unified', errorMessage: err?.message });
      throw Object.assign(new Error(err?.message || 'Email send failed'), { statusCode: 502 });
    }
  }

  if (safeChannel === 'whatsapp') {
    const to = _normalizePhone(recipient.phone);
    if (!to || to.length < 10) throw Object.assign(new Error(`${recipientLabel} has no valid WhatsApp number on file`), { statusCode: 400 });
    if (whatsappProductionService?.twilioConfigured) {
      try {
        const response = await whatsappProductionService.sendSessionMessage({ to, body: safeMessage.slice(0, 4096) });
        await _logCrmCommunication({ ...logBase, channel: 'whatsapp', recipientLabel, status: 'sent', provider: 'twilio', providerMessageId: response?.sid });
        return { success: true, channel: safeChannel, recipient: to, status: 'sent', provider: 'twilio' };
      } catch (err) {
        await _logCrmCommunication({ ...logBase, channel: 'whatsapp', recipientLabel, status: 'failed', provider: 'twilio', errorMessage: err?.message });
        throw Object.assign(new Error(err?.message || 'WhatsApp send failed'), { statusCode: 502 });
      }
    }
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) throw Object.assign(new Error('WhatsApp is not configured on server'), { statusCode: 503 });
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to, type: 'text', text: { body: safeMessage.slice(0, 4096) } },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      const providerMessageId = response?.data?.messages?.[0]?.id || null;
      await _logCrmCommunication({ ...logBase, channel: 'whatsapp', recipientLabel, status: 'sent', provider: 'meta', providerMessageId });
      return { success: true, channel: safeChannel, recipient: to, status: 'sent', provider: 'meta' };
    } catch (err) {
      await _logCrmCommunication({ ...logBase, channel: 'whatsapp', recipientLabel, status: 'failed', provider: 'meta', errorMessage: err?.response?.data?.error?.message || err?.message });
      throw Object.assign(new Error(err?.response?.data?.error?.message || err?.message || 'WhatsApp send failed'), { statusCode: 502 });
    }
  }

  // sms
  const smsService = _smsService();
  if (!smsService) throw Object.assign(new Error('SMS is not configured on server'), { statusCode: 503 });
  const to = _normalizePhone(recipient.phone);
  if (!to || to.length < 10) throw Object.assign(new Error(`${recipientLabel} has no valid mobile number on file`), { statusCode: 400 });
  try {
    const result = await smsService.sendSMS({ to, message: safeMessage, templateId: process.env.SMS_TEMPLATE_ID });
    if (!result?.success) {
      await _logCrmCommunication({ ...logBase, channel: 'sms', recipientLabel, status: 'failed', provider: result?.provider || 'sms', errorMessage: result?.error });
      throw Object.assign(new Error(result?.error || 'SMS provider rejected the message'), { statusCode: 502 });
    }
    await _logCrmCommunication({ ...logBase, channel: 'sms', recipientLabel, status: 'sent', provider: result?.provider || 'sms', providerMessageId: result?.messageId });
    return { success: true, channel: safeChannel, recipient: to, status: 'sent', provider: result?.provider || 'sms' };
  } catch (err) {
    if (!err.statusCode) {
      await _logCrmCommunication({ ...logBase, channel: 'sms', recipientLabel, status: 'failed', provider: 'sms', errorMessage: err?.message });
    }
    throw Object.assign(new Error(err?.message || 'SMS send failed'), { statusCode: err.statusCode || 502 });
  }
}

export async function listCrmCallActivity({ leadId, dealId, limit } = {}) {
  const conditions = [`a.type = 'call'`];
  const params = [];
  if (leadId) { params.push(positiveInt(leadId)); conditions.push(`a.lead_id = $${params.length}`); }
  if (dealId) { params.push(positiveInt(dealId)); conditions.push(`a.deal_id = $${params.length}`); }
  params.push(Math.min(Math.max(positiveInt(limit) || 50, 1), 200));
  const { rows } = await sharedPool.query(`
    SELECT a.*, l.name AS lead_name, l.company AS lead_company, d.title AS deal_title
    FROM crm_activities a
    LEFT JOIN crm_leads l ON l.id = a.lead_id
    LEFT JOIN crm_deals d ON d.id = a.deal_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(a.completed_at, a.scheduled_at, a.created_at) DESC
    LIMIT $${params.length}
  `, params);
  return rows;
}

export async function listCrmCommunicationLog({ leadId, dealId, channel, limit } = {}) {
  const cappedLimit = Math.min(Math.max(positiveInt(limit) || 50, 1), 200);

  // Leads are mirrored into crm_leads_v2 — read their message history from
  // crm_communication_events (the table sendCrmMessage now writes to), shaped
  // to match the legacy row contract the Communication Hub UI already expects.
  if (leadId && !dealId) {
    const v2 = await resolveV2LeadByLegacyId(positiveInt(leadId)).catch(() => null);
    if (v2) {
      const params = [v2.tenant_id, v2.id];
      let channelClause = '';
      if (channel && CHANNELS.has(channel)) { params.push(channel); channelClause = `AND channel = $${params.length}`; }
      params.push(cappedLimit);
      const { rows } = await sharedPool.query(`
        SELECT id, channel AS type, body_preview AS description,
               CASE WHEN status = 'failed' THEN ('failed: ' || COALESCE(failure_reason, '')) ELSE status END AS outcome,
               created_at
        FROM crm_communication_events
        WHERE tenant_id = $1 AND lead_id = $2 ${channelClause}
        ORDER BY created_at DESC
        LIMIT $${params.length}
      `, params);
      return rows;
    }
  }

  // Fallback — deal-sourced sends, or a lead whose v2 mirror hasn't caught up yet.
  const conditions = [`a.type IN ('email', 'whatsapp', 'sms')`];
  const params = [];
  if (leadId) { params.push(positiveInt(leadId)); conditions.push(`a.lead_id = $${params.length}`); }
  if (dealId) { params.push(positiveInt(dealId)); conditions.push(`a.deal_id = $${params.length}`); }
  if (channel && CHANNELS.has(channel)) { params.push(channel); conditions.push(`a.type = $${params.length}`); }
  params.push(cappedLimit);
  const { rows } = await sharedPool.query(`
    SELECT a.*, l.name AS lead_name, l.company AS lead_company, d.title AS deal_title
    FROM crm_activities a
    LEFT JOIN crm_leads l ON l.id = a.lead_id
    LEFT JOIN crm_deals d ON d.id = a.deal_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.created_at DESC
    LIMIT $${params.length}
  `, params);
  return rows;
}

export default {
  getCommunicationHubDashboard,
  listCommunicationHubCampaigns,
  createCommunicationHubCampaign,
  updateCommunicationHubCampaignStatus,
  listCommunicationHubTemplates,
  createCommunicationHubTemplate,
  recordCommunicationIntegrationHealth,
  acknowledgeCommunicationHubAlert,
  sendCrmMessage,
  dispatchToChannel,
  findOrCreateConversation,
  listCrmCallActivity,
  listCrmCommunicationLog,
};
