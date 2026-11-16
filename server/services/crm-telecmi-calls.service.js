/** TeleCMI CHUB calls into the CRM.
 *
 * Webhook payloads follow doc.telecmi.com/chub/docs (webhooks-overview, incoming-missed,
 * incoming-answered, outgoing-missed, outgoing-answered, live-* events):
 *   type      'cdr' (call finished) | 'event' (live status: waiting/started/answered/hangup)
 *   direction 'inbound' | 'outbound'
 *   inbound:  from (caller), to / virtual_number, cmiuuid, conversation_uuid, status, answeredsec,
 *             waitedsec, hangup_reason, record, filename, user, team, ivr_name, time (ms)
 *   outbound: to (customer), call_id (shared by legs a/b), leg, user, request_id + extra_params
 *             (click2call only), answeredsec, record/filename (on the leg that recorded), time
 * A finished call becomes one crm_communication_events row (channel 'call', provider 'telecmi')
 * on the caller's lead; legs and repeat deliveries merge into it. Unknown inbound callers become a
 * lead (source 'phone'), which also captures them as a contact. Missed inbound calls show unread in
 * the inbox so someone calls back. */
import sharedPool from '../db/pgPool.js';
import { syncLegacyLeadToV2 } from './crm-v2-sync.service.js';

const digits = (v) => String(v ?? '').replace(/\D/g, '');
const last10 = (v) => digits(v).slice(-10);
const parseJson = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return {}; } };
const HANGUP = { sent_bye: 'ended by our team', recv_bye: 'ended by the caller', recv_cancel: 'not answered by our team', sent_reject: 'rejected by our team' };

export function normalizeTelecmi(body) {
  const b = body || {};
  const direction = String(b.direction || '').toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
  const extra = parseJson(b.extra_params);
  const customer = direction === 'inbound' ? b.from : b.to;
  const answeredSec = Number(b.answeredsec) || 0;
  const status = String(b.status || '').toLowerCase();
  return {
    type: String(b.type || '').toLowerCase(),
    direction,
    // Outbound legs share call_id; inbound uses the conversation id (falls back to the leg id).
    callKey: String((direction === 'outbound' ? b.call_id || b.request_id : b.conversation_uuid) || b.cmiuuid || ''),
    requestId: b.request_id ? String(b.request_id) : null,
    leg: b.leg || null,
    customerDigits: digits(customer),
    agentUser: b.user ? String(b.user) : null,
    status,
    answered: status === 'answered' || answeredSec > 0,
    answeredSec, waitedSec: Number(b.waitedsec) || 0,
    hangupReason: b.hangup_reason || null,
    recording: b.record && b.filename ? String(b.filename) : null,
    team: b.team || null, ivr: b.ivr_name || null,
    at: Number(b.time) > 1e12 ? new Date(Number(b.time)) : (Number(b.time) > 1e9 ? new Date(Number(b.time) * 1000) : new Date()),
    cmiuuid: b.cmiuuid ? String(b.cmiuuid) : null,
    leadHint: Number(extra.lead_id) || null,
    crmUserHint: Number(extra.crm_user_id) || null,
  };
}

function summary(c) {
  if (c.answered) {
    const m = Math.floor(c.answeredSec / 60), s = c.answeredSec % 60;
    return `${c.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call answered · ${m}m ${s}s${c.hangupReason ? ` · ${HANGUP[c.hangupReason] || c.hangupReason}` : ''}`;
  }
  return c.direction === 'inbound'
    ? `Missed call${c.waitedSec ? ` · waited ${c.waitedSec}s` : ''}${c.ivr ? ` · last menu: ${c.ivr}` : ''}`
    : `Outgoing call not answered${c.hangupReason ? ` · ${HANGUP[c.hangupReason] || c.hangupReason}` : ''}`;
}

async function findOrCreateLead(client, tenantId, c) {
  if (c.leadHint) {
    const { rows: [l] } = await client.query(
      `SELECT lv.id AS v2_id, lv.legacy_lead_id, lv.contact_id, lv.person_id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.legacy_lead_id = $2`, [tenantId, c.leadHint]);
    if (l) return { ...l, created: false };
  }
  const phone10 = last10(c.customerDigits);
  if (phone10.length < 10) return null;
  const { rows: [match] } = await client.query(
    `SELECT lv.id AS v2_id, lv.legacy_lead_id, lv.contact_id, lv.person_id FROM crm_leads l JOIN crm_leads_v2 lv ON lv.legacy_lead_id = l.id AND lv.tenant_id = $1
      WHERE right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = $2
      ORDER BY (l.status NOT IN ('converted', 'lost')) DESC, l.updated_at DESC LIMIT 1`, [tenantId, phone10]);
  if (match) return { ...match, created: false };
  if (c.direction !== 'inbound') return null; // only callers create leads; we don't invent leads for numbers we dialled
  const { rows: [owner] } = await client.query(`SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' ORDER BY "isAdmin" DESC, id LIMIT 1`, [tenantId]);
  if (!owner) throw new Error('No active CRM user to own inbound call leads');
  const phone = `+91${phone10}`;
  const { rows: [lead] } = await client.query(
    `INSERT INTO crm_leads (name, phone, source, status, priority, notes, tags, assigned_to, created_by)
     VALUES ($1, $2, 'phone', 'new', 'medium', $3, '["phone","inbound"]'::jsonb, $4, $4) RETURNING id`,
    [`Caller ${phone}`, phone, `First phone call ${c.answered ? 'answered' : 'missed'} on ${c.at.toISOString().slice(0, 10)}.`, owner.id]);
  await syncLegacyLeadToV2(lead.id, tenantId, { db: client, strict: true });
  const { rows: [created] } = await client.query(
    `SELECT id AS v2_id, legacy_lead_id, contact_id, person_id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`, [tenantId, lead.id]);
  return { ...created, created: true };
}

/** Persists a finished call (CDR). Idempotent per call: later legs/deliveries merge in. */
export async function recordTelecmiCdr(tenantId, body) {
  const c = normalizeTelecmi(body);
  if (c.type !== 'cdr' || !c.callKey) return { ignored: true };
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`telecmi:${tenantId}:${c.callKey}`]);
    const { rows: [existing] } = await client.query(
      `SELECT id, metadata FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi' AND (provider_message_id = $2 OR metadata->>'cmiuuid' = $3) LIMIT 1`,
      [tenantId, c.callKey, c.cmiuuid || c.callKey]);
    if (existing) {
      // Merge another leg / a repeat: keep the longest answered time and any recording.
      const m = existing.metadata || {};
      const answeredSec = Math.max(Number(m.answered_sec) || 0, c.answeredSec);
      const merged = { ...m, answered_sec: answeredSec, recording: m.recording || c.recording, legs: [...new Set([...(m.legs || []), c.leg].filter(Boolean))],
        agent_user: m.agent_user || c.agentUser, hangup_reason: m.hangup_reason || c.hangupReason };
      const answered = m.answered || c.answered;
      await client.query(
        `UPDATE crm_communication_events SET metadata = $2::jsonb, status = $3, body_preview = $4 WHERE id = $1`,
        [existing.id, JSON.stringify({ ...merged, answered }), answered ? 'answered' : 'missed',
          summary({ ...c, answered, answeredSec, hangupReason: merged.hangup_reason })]);
      await client.query('COMMIT');
      return { merged: true, eventId: existing.id };
    }
    const lead = await findOrCreateLead(client, tenantId, c);
    if (!lead) { await client.query('COMMIT'); return { ignored: true, reason: 'no matching lead for this number' }; }
    let ownerUserId = c.crmUserHint || null;
    if (!ownerUserId && c.agentUser) {
      const { rows: [u] } = await client.query(`SELECT id FROM users WHERE tenant_id = $1 AND metadata->>'telecmi_user_id' = $2 LIMIT 1`, [tenantId, c.agentUser]);
      ownerUserId = u?.id || null;
    }
    const { rows: [ev] } = await client.query(
      `INSERT INTO crm_communication_events (tenant_id, lead_id, contact_id, identity_id, channel, direction, message_type, body_preview,
         provider, provider_message_id, status, sent_at, delivered_at, owner_user_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, 'call', $5, 'call', $6, 'telecmi', $7, $8, $9, $10, $11, $12::jsonb, $9) RETURNING id`,
      [tenantId, lead.v2_id, lead.contact_id, lead.person_id, c.direction, summary(c), c.callKey, c.answered ? 'answered' : 'missed', c.at,
        c.answered ? c.at : null, ownerUserId,
        JSON.stringify({ answered: c.answered, answered_sec: c.answeredSec, waited_sec: c.waitedSec, recording: c.recording, agent_user: c.agentUser,
          team: c.team, ivr: c.ivr, hangup_reason: c.hangupReason, request_id: c.requestId, legs: c.leg ? [c.leg] : [], cmiuuid: c.cmiuuid, source: body.source || 'webhook' })]);
    await client.query(`UPDATE crm_leads SET last_contacted = CASE WHEN $2 THEN now() ELSE last_contacted END, updated_at = now() WHERE id = $1`,
      [lead.legacy_lead_id, c.direction === 'outbound' || c.answered]);
    if (c.direction === 'outbound' && c.answered) {
      await client.query(`UPDATE crm_leads_v2 SET first_response_at = COALESCE(first_response_at, now()) WHERE id = $1`, [lead.v2_id]);
    }
    await client.query('COMMIT');
    return { eventId: ev.id, leadId: lead.v2_id, legacyLeadId: lead.legacy_lead_id, createdLead: lead.created };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
