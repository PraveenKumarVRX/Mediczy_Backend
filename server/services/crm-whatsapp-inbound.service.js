/** Inbound WhatsApp (Gupshup) → CRM. An incoming message becomes a legacy crm_leads row (what the
 * Leads page lists) mirrored to v2 via syncLegacyLeadToV2 (what the Communication Hub inbox and the
 * reply path resolve through), plus an open whatsapp conversation and an inbound communication event.
 * The shared gupshup-webhook.service parser is reused for Gupshup's v2 format, but not its downstream:
 * that path feeds the patient/clinical chatbot, which this dedicated CRM runtime deliberately excludes. */
import sharedPool from '../db/pgPool.js';
import { isPlaceholderName } from './crm-contact-capture.service.js';
import { normalizeGupshupEvent } from './gupshup-webhook.service.js';
import { syncLegacyLeadToV2 } from './crm-v2-sync.service.js';

const digitsOf = value => String(value || '').replace(/\D/g, '');

export async function getTenantGupshupConfig(tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT config FROM crm_marketing_integrations
     WHERE tenant_id = $1 AND provider = 'whatsapp' AND integration_type = 'communication' AND status = 'configured' LIMIT 1`,
    [tenantId]
  );
  const config = typeof rows[0]?.config === 'string' ? JSON.parse(rows[0].config) : rows[0]?.config;
  return config?.provider === 'gupshup' && config.appName && config.senderNumber ? config : null;
}

/** Returns normalized events: { kind:'message', id, from, name, text } | { kind:'status', sid, status, errorCode }. */
export function parseWebhook(body, config) {
  if (!body || typeof body !== 'object') return [];
  // Meta Cloud API format, in case the Gupshup app forwards that instead of its own v2 format.
  if (body.object === 'whatsapp_business_account') {
    const events = [];
    for (const entry of body.entry || []) for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map(c => [digitsOf(c.wa_id), c.profile?.name || '']));
      for (const m of value.messages || []) {
        const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        events.push({ kind: 'message', id: String(m.id), from: digitsOf(m.from), name: names[digitsOf(m.from)] || '', text: text || `[${m.type || 'media'} message]` });
      }
      for (const s of value.statuses || []) events.push({ kind: 'status', sid: String(s.id), status: s.status, errorCode: s.errors?.[0]?.code == null ? null : String(s.errors[0].code) });
    }
    return events;
  }
  if (Number(body.version) !== 2) return []; // setup/validation probes and anything unrecognised
  const event = normalizeGupshupEvent(body, { GUPSHUP_APP_NAME: config.appName, GUPSHUP_SOURCE_NUMBER: config.senderNumber });
  if (event.kind === 'status') return [{ kind: 'status', sid: event.sid, status: event.status, errorCode: event.errorCode }];
  if (event.kind === 'message') {
    return [{ kind: 'message', id: event.id, from: digitsOf(event.message.From), name: event.message.ProfileName || '',
      text: event.unsupportedMedia ? `[${body.payload?.type || 'media'} message]` : event.message.Body }];
  }
  return [];
}

export async function recordInboundMessage(tenantId, msg) {
  const phone = `+${msg.from}`;
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    // Two quick messages from a new number must not create two leads.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`wa-inbound:${tenantId}:${msg.from}`]);
    const dup = await client.query(
      `SELECT 1 FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'gupshup' AND provider_message_id = $2`,
      [tenantId, msg.id]
    );
    if (dup.rows.length) { await client.query('COMMIT'); return { duplicate: true }; }

    // Match on the last 10 digits: existing leads may store 9876543210, +919876543210 or 91-9876…
    const existing = await client.query(
      `SELECT l.id FROM crm_leads l
       WHERE l.id IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id IS NOT NULL)
         AND right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = right($2, 10)
       ORDER BY (l.status NOT IN ('converted', 'lost')) DESC, l.updated_at DESC LIMIT 1`,
      [tenantId, msg.from]
    );
    let legacyLeadId = existing.rows[0]?.id;
    let created = false;
    if (legacyLeadId) {
      // Contact updation: a lead first saved as "WhatsApp +91…" takes the sender's WhatsApp profile name
      // once one arrives, and the sync below refreshes the v2 record and the Contacts page.
      const profileName = (msg.name || '').trim();
      const { rows: [cur] } = await client.query('SELECT name FROM crm_leads WHERE id = $1', [legacyLeadId]);
      if (profileName && cur && isPlaceholderName(cur.name)) {
        await client.query('UPDATE crm_leads SET name = $1, updated_at = NOW() WHERE id = $2', [profileName.slice(0, 255), legacyLeadId]);
      }
      await syncLegacyLeadToV2(legacyLeadId, tenantId, { db: client, strict: true });
    }
    if (!legacyLeadId) {
      const actor = await client.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' ORDER BY "isAdmin" DESC, id LIMIT 1`, [tenantId]
      );
      const actorId = actor.rows[0]?.id;
      if (!actorId) throw new Error('No active CRM user to own inbound leads');
      const name = (msg.name || '').trim() || `WhatsApp ${phone}`;
      const inserted = await client.query(
        `INSERT INTO crm_leads (name, phone, source, status, priority, notes, tags, assigned_to, created_by)
         VALUES ($1, $2, 'whatsapp', 'new', 'medium', $3, $4::jsonb, $5, $5) RETURNING id`,
        [name, phone, `First WhatsApp message: ${msg.text.slice(0, 500)}`, JSON.stringify(['whatsapp', 'inbound']), actorId]
      );
      legacyLeadId = inserted.rows[0].id;
      await syncLegacyLeadToV2(legacyLeadId, tenantId, { db: client, strict: true });
      created = true;
    }

    const { rows: [v2] } = await client.query(
      `SELECT id, person_id, contact_id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`, [tenantId, legacyLeadId]
    );
    if (!v2) throw new Error(`Lead ${legacyLeadId} has no v2 mirror for tenant ${tenantId}`);

    const meta = JSON.stringify({ provider: 'gupshup', customer_id: phone, ...(msg.name ? { customer_name: msg.name } : {}) });
    let conversationId = (await client.query(
      `SELECT id FROM crm_conversations WHERE tenant_id = $1 AND lead_id = $2 AND channel = 'whatsapp' AND status <> 'closed'
       ORDER BY created_at DESC LIMIT 1`, [tenantId, v2.id]
    )).rows[0]?.id;
    if (conversationId) {
      await client.query(
        `UPDATE crm_conversations SET last_message_at = NOW(), updated_at = NOW(), status = 'open', metadata = metadata || $2::jsonb WHERE id = $1`,
        [conversationId, meta]
      );
    } else {
      conversationId = (await client.query(
        `INSERT INTO crm_conversations (tenant_id, lead_id, identity_id, channel, status, last_message_at, metadata)
         VALUES ($1, $2, $3, 'whatsapp', 'open', NOW(), $4::jsonb) RETURNING id`,
        [tenantId, v2.id, v2.person_id, meta]
      )).rows[0].id;
    }

    await client.query(
      `INSERT INTO crm_communication_events
         (tenant_id, lead_id, contact_id, identity_id, conversation_id, channel, direction, message_type, body_preview,
          provider, provider_message_id, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'whatsapp', 'inbound', 'message', $6, 'gupshup', $7, 'received', $8::jsonb)`,
      [tenantId, v2.id, v2.contact_id, v2.person_id, conversationId, msg.text.slice(0, 2000), msg.id,
        JSON.stringify({ from: phone, profileName: msg.name || null })]
    );
    await client.query('UPDATE crm_leads SET updated_at = NOW() WHERE id = $1', [legacyLeadId]);
    await client.query('COMMIT');
    return { duplicate: false, created, legacyLeadId, leadId: v2.id, conversationId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Delivery receipts for messages the CRM sent (logged with provider 'gupshup' by sendCrmMessage). */
export async function recordDeliveryStatus(tenantId, { sid, status, errorCode }) {
  const column = { delivered: 'delivered_at', read: 'read_at', failed: 'failed_at' }[status];
  await sharedPool.query(
    `UPDATE crm_communication_events SET status = $3::varchar${column ? `, ${column} = COALESCE(${column}, NOW())` : ''},
       failure_reason = CASE WHEN $3::varchar = 'failed' THEN COALESCE($4::text, failure_reason) ELSE failure_reason END
     WHERE tenant_id = $1 AND provider = 'gupshup' AND provider_message_id = $2 AND direction = 'outbound'
       AND ${RANK_SQL('status')} < ${RANK_SQL('$3::varchar')}`,
    [tenantId, sid, status, errorCode ? `Gupshup error ${errorCode}` : null]
  );
}
// Receipts arrive out of order; a late 'delivered' must not overwrite 'read'.
const RANK_SQL = col => `(CASE ${col} WHEN 'read' THEN 5 WHEN 'delivered' THEN 4 WHEN 'failed' THEN 3 WHEN 'sent' THEN 2 WHEN 'enqueued' THEN 1 ELSE 0 END)`;
