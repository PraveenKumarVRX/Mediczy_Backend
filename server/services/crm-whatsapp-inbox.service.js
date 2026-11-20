/** WhatsApp inbox: conversation list, threads, replies and status for the CRM's WhatsApp channel.
 *
 * Builds on what the Gupshup integration already records: every inbound message becomes a
 * crm_communication_events row on an open crm_conversations row tied to a lead
 * (crm-whatsapp-inbound.service.js); delivery receipts update events by provider_message_id.
 *
 * WhatsApp's 24-hour rule: free-form text may only be sent within 24h of the customer's last
 * message. Outside it, only an approved template may start the conversation again. The inbox
 * enforces that here so staff get a clear message instead of a provider failure. */
import sharedPool from '../db/pgPool.js';
import { sendTenantWhatsApp } from './crm-channel-delivery.service.js';
import { sendTemplate } from './gupshup-control.service.js';

const WINDOW_MS = 24 * 3600 * 1000;
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const positive = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

// Lead name and phone come from the legacy lead the Leads page shows; the conversation metadata
// keeps the WhatsApp number and profile name for contacts that have no lead name yet.
const CONVERSATION_FIELDS = `
  c.id, c.status, c.lead_id, c.assigned_to_user_id, c.last_message_at, c.created_at,
  lv.legacy_lead_id,
  COALESCE(NULLIF(l.name, ''), c.metadata->>'customer_name', 'WhatsApp ' || (c.metadata->>'customer_id')) AS name,
  COALESCE(c.metadata->>'customer_id', regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g')) AS phone,
  NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS assigned_to_name,
  (c.metadata->>'last_read_at')::timestamptz AS last_read_at,
  last_in.created_at AS last_inbound_at`;
const CONVERSATION_JOINS = `
  LEFT JOIN crm_leads_v2 lv ON lv.id = c.lead_id AND lv.tenant_id = c.tenant_id
  LEFT JOIN crm_leads l ON l.id = lv.legacy_lead_id
  LEFT JOIN users u ON u.id = c.assigned_to_user_id AND u.tenant_id = c.tenant_id
  LEFT JOIN LATERAL (SELECT created_at FROM crm_communication_events e
                     WHERE e.tenant_id = c.tenant_id AND e.conversation_id = c.id AND e.direction = 'inbound'
                     ORDER BY created_at DESC LIMIT 1) last_in ON TRUE`;

function windowInfo(lastInboundAt) {
  const last = lastInboundAt ? new Date(lastInboundAt).getTime() : 0;
  const closesAt = last ? new Date(last + WINDOW_MS) : null;
  return { open: Boolean(last) && Date.now() < last + WINDOW_MS, closesAt };
}

export async function listInbox(tenantId, { status = 'open', search = '', assigned = '', userId = null, limit = 100 } = {}) {
  const params = [tenantId];
  const where = [`c.tenant_id = $1`, `c.channel = 'whatsapp'`];
  if (['open', 'pending', 'closed'].includes(status)) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (assigned === 'me' && positive(userId)) { params.push(userId); where.push(`c.assigned_to_user_id = $${params.length}`); }
  if (assigned === 'unassigned') where.push(`c.assigned_to_user_id IS NULL`);
  const q = String(search || '').trim().slice(0, 80);
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`, q.replace(/\D/g, '') || '__none__');
    where.push(`(l.name ILIKE $${params.length - 1} OR c.metadata->>'customer_name' ILIKE $${params.length - 1}
                 OR c.metadata->>'customer_id' LIKE '%' || $${params.length} || '%')`);
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 200));
  const { rows } = await sharedPool.query(
    `SELECT ${CONVERSATION_FIELDS},
            last_msg.body_preview AS last_message, last_msg.direction AS last_direction, last_msg.status AS last_status,
            (SELECT count(*)::int FROM crm_communication_events e
              WHERE e.tenant_id = c.tenant_id AND e.conversation_id = c.id AND e.direction = 'inbound'
                AND e.created_at > COALESCE((c.metadata->>'last_read_at')::timestamptz, '-infinity')) AS unread
       FROM crm_conversations c ${CONVERSATION_JOINS}
       LEFT JOIN LATERAL (SELECT body_preview, direction, status FROM crm_communication_events e
                          WHERE e.tenant_id = c.tenant_id AND e.conversation_id = c.id
                          ORDER BY created_at DESC LIMIT 1) last_msg ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT $${params.length}`, params);
  const { rows: [counts] } = await sharedPool.query(
    `SELECT count(*) FILTER (WHERE status = 'open')::int AS open, count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'closed')::int AS closed
       FROM crm_conversations WHERE tenant_id = $1 AND channel = 'whatsapp'`, [tenantId]);
  return { conversations: rows.map((r) => ({ ...r, window: windowInfo(r.last_inbound_at) })), counts };
}

async function loadConversation(tenantId, id) {
  const { rows: [c] } = await sharedPool.query(
    `SELECT ${CONVERSATION_FIELDS} FROM crm_conversations c ${CONVERSATION_JOINS}
      WHERE c.tenant_id = $1 AND c.id = $2 AND c.channel = 'whatsapp'`, [tenantId, id]);
  if (!c) throw fail(404, 'Conversation not found');
  return c;
}

export async function getInboxThread(tenantId, id, { markRead = true } = {}) {
  const conversationId = positive(id);
  if (!conversationId) throw fail(400, 'Invalid conversation');
  const conversation = await loadConversation(tenantId, conversationId);
  const { rows: messages } = await sharedPool.query(
    `SELECT e.id, e.direction, e.message_type, e.body_preview AS body, e.status, e.failure_reason, e.created_at,
            e.sent_at, e.delivered_at, e.read_at, e.failed_at, t.name AS template_name,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS sent_by
       FROM crm_communication_events e
       LEFT JOIN crm_communication_templates t ON t.id = e.template_id AND t.tenant_id = e.tenant_id
       LEFT JOIN users u ON u.id = e.owner_user_id AND u.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.conversation_id = $2
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT 500`, [tenantId, conversationId]);
  if (markRead) {
    await sharedPool.query(
      `UPDATE crm_conversations SET metadata = metadata || jsonb_build_object('last_read_at', now()) WHERE tenant_id = $1 AND id = $2`,
      [tenantId, conversationId]);
  }
  return { conversation: { ...conversation, window: windowInfo(conversation.last_inbound_at) }, messages };
}

/** Free text inside the 24h window, or an approved template at any time. */
export async function sendInboxMessage(tenantId, id, { text, templateId, params } = {}, userId) {
  const conversationId = positive(id);
  if (!conversationId) throw fail(400, 'Invalid conversation');
  const c = await loadConversation(tenantId, conversationId);
  const window = windowInfo(c.last_inbound_at);

  if (templateId) {
    if (!c.legacy_lead_id) throw fail(409, 'This conversation is not linked to a lead, so a template cannot be addressed.');
    // sendTemplate attaches its event to this lead's open WhatsApp conversation.
    if (c.status === 'closed') await setStatus(tenantId, conversationId, 'open');
    const sent = await sendTemplate(tenantId, { templateId, leadId: c.legacy_lead_id, params: Array.isArray(params) ? params : [] }, userId);
    return { sent: true, kind: 'template', result: sent };
  }

  const body = String(text || '').trim();
  if (!body) throw fail(400, 'Type a message.');
  if (body.length > 4096) throw fail(400, 'WhatsApp messages are limited to 4096 characters.');
  if (!window.open) {
    throw fail(409, 'The 24-hour reply window has closed. WhatsApp only allows an approved template until the customer writes again.');
  }
  const to = String(c.phone || '').replace(/\D/g, '');
  if (to.length < 10) throw fail(409, 'This conversation has no valid WhatsApp number.');

  const result = await sendTenantWhatsApp(tenantId, { to, body });
  if (!result.configured) throw fail(503, 'WhatsApp is not connected. An administrator can connect it in Settings & Channels.');
  const { rows: [lead] } = await sharedPool.query(
    `SELECT id, contact_id, person_id FROM crm_leads_v2 WHERE tenant_id = $1 AND id = $2`, [tenantId, c.lead_id]);
  const { rows: [event] } = await sharedPool.query(
    `INSERT INTO crm_communication_events
       (tenant_id, lead_id, contact_id, identity_id, conversation_id, channel, direction, message_type, body_preview,
        provider, provider_message_id, status, sent_at, failed_at, failure_reason, owner_user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, 'whatsapp', 'outbound', 'message', $6, $7, $8, $9::varchar,
             CASE WHEN $9::varchar = 'sent' THEN now() END, CASE WHEN $9::varchar = 'failed' THEN now() END, $10, $11, $12::jsonb)
     RETURNING id, status, created_at`,
    [tenantId, lead?.id || c.lead_id, lead?.contact_id || null, lead?.person_id || null, conversationId, body.slice(0, 2000),
      result.provider || 'gupshup', result.providerMessageId || null, result.success ? 'sent' : 'failed',
      result.success ? null : String(result.error || 'Send failed').slice(0, 500), userId || null, JSON.stringify({ source: 'inbox' })]);
  await sharedPool.query(
    `UPDATE crm_conversations SET last_message_at = now(), updated_at = now(), status = CASE WHEN status = 'closed' THEN 'open' ELSE status END
      WHERE tenant_id = $1 AND id = $2`, [tenantId, conversationId]);
  if (!result.success) throw fail(502, `WhatsApp did not accept the message: ${result.error || 'unknown error'}`);
  return { sent: true, kind: 'text', event };
}

export async function setStatus(tenantId, id, status) {
  if (!['open', 'pending', 'closed'].includes(status)) throw fail(400, 'Status must be open, pending or closed.');
  const { rowCount } = await sharedPool.query(
    `UPDATE crm_conversations SET status = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND channel = 'whatsapp'`,
    [tenantId, positive(id), status]);
  if (!rowCount) throw fail(404, 'Conversation not found');
  return { id: positive(id), status };
}

export async function assignConversation(tenantId, id, userId) {
  const target = userId === null ? null : positive(userId);
  if (target) {
    const { rows } = await sharedPool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND status = 'active'`, [target, tenantId]);
    if (!rows.length) throw fail(400, 'That user is not an active member of this CRM.');
  }
  const { rowCount } = await sharedPool.query(
    `UPDATE crm_conversations SET assigned_to_user_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND channel = 'whatsapp'`,
    [tenantId, positive(id), target]);
  if (!rowCount) throw fail(404, 'Conversation not found');
  return { id: positive(id), assigned_to_user_id: target };
}
