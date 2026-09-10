/**
 * CRM Growth Engine — inbound conversation bridge.
 *
 * The platform's real inbound WhatsApp conversation handling lives at
 * server/routes/whatsapp-production.route.js (Twilio webhook → Redis-backed
 * chat rooms, AI auto-response, known-user context) — a mature system built
 * for the platform's patients/doctors, not CRM leads, and not touched here.
 *
 * This is a narrow, additive bridge: when an inbound message's phone number
 * matches a CRM lead's identity, mirror it into the CRM's own conversation
 * model (crm_conversations / crm_communication_events) so that lead's thread
 * shows up in the Communication Hub inbox — the same tenant-scoped tables
 * every outbound CRM send already writes to (see findOrCreateConversation in
 * hospital-crm-communication-hub.service.js, Phase 4).
 *
 * Fire-and-forget safe: must never throw into the calling webhook, which
 * serves live Twilio traffic and must always return its TwiML response
 * regardless of what happens here.
 */
import sharedPool from '../db/pgPool.js';
import { findOrCreateConversation } from './hospital-crm-communication-hub.service.js';
import { CRM_V2_DEFAULT_TENANT_ID } from './crm-v2-sync.service.js';

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/** Look up the CRM lead (if any) owning this phone number, for the default tenant. */
async function _findLeadByPhone(phone, tenantId = CRM_V2_DEFAULT_TENANT_ID) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { rows } = await sharedPool.query(
    `SELECT lv.id AS lead_id, lv.contact_id
     FROM crm_identity_keys k
     JOIN crm_leads_v2 lv ON lv.person_id = k.person_id AND lv.tenant_id = k.tenant_id
     WHERE k.tenant_id = $1 AND k.key_type = 'phone' AND k.normalized_value = $2
     ORDER BY lv.updated_at DESC LIMIT 1`,
    [tenantId, normalized]
  );
  return rows[0] || null;
}

/**
 * Call from the WhatsApp inbound webhook after extracting the sender's phone
 * number. No-ops silently if the number isn't a known CRM lead — most
 * inbound messages won't be (patients, non-CRM contacts), which is normal.
 */
export async function bridgeInboundWhatsAppToCrm({ phone, body, providerMessageId, tenantId = CRM_V2_DEFAULT_TENANT_ID }) {
  try {
    const lead = await _findLeadByPhone(phone, tenantId);
    if (!lead) return { bridged: false, reason: 'not_a_crm_lead' };

    const conversationId = await findOrCreateConversation({ tenantId, leadId: lead.lead_id, channel: 'whatsapp' });
    await sharedPool.query(
      `INSERT INTO crm_communication_events
         (tenant_id, lead_id, contact_id, conversation_id, channel, direction, message_type, body_preview, provider, provider_message_id, status)
       VALUES ($1,$2,$3,$4,'whatsapp','inbound','message',$5,'twilio',$6,'received')`,
      [tenantId, lead.lead_id, lead.contact_id, conversationId, body ? String(body).slice(0, 2000) : null, providerMessageId || null]
    );
    // A reply from the lead is a real engagement signal — nudge them back toward an active stage.
    await sharedPool.query(
      `UPDATE crm_leads_v2 SET lifecycle_stage = CASE WHEN lifecycle_stage IN ('new', 'dormant', 'nurture') THEN 'contacted' ELSE lifecycle_stage END, updated_at = NOW() WHERE id = $1`,
      [lead.lead_id]
    );
    return { bridged: true, leadId: lead.lead_id, conversationId };
  } catch (err) {
    console.warn('[CRM Inbound Bridge] failed:', err.message);
    return { bridged: false, reason: 'error', error: err.message };
  }
}

export default { bridgeInboundWhatsAppToCrm };
