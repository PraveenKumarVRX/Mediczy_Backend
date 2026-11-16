/** Unified, lead-centred inbox across every channel the CRM records.
 *
 * One row per lead (patient), one timeline per lead, merged from where each channel actually lands:
 *   - crm_communication_events  WhatsApp / SMS / email, inbound and outbound (lead_id = crm_leads_v2.id)
 *   - cc_calls                  contact-center calls; no lead link, matched on the last 10 phone digits
 *   - crm_activities            calls and notes logged on the lead (lead_id = legacy crm_leads.id)
 *   - crm_email_inbox           the signed-in user's own mailbox, messages from a lead's email address
 * Ownership is the lead's owner (crm_leads.assigned_to, mirrored to crm_leads_v2.owner_user_id), so
 * "Assign" here and the owner on the Leads page are the same thing. Read and status markers live on
 * crm_leads_v2.metadata (inbox_read_at, inbox_status, inbox_status_at); a new inbound message after a
 * status change reopens the thread. WhatsApp's 24-hour rule is enforced on replies. */
import { managedFetch as fetch } from '../integrations/transport.js';
import sharedPool from '../db/pgPool.js';
import { sendTenantWhatsApp } from './crm-channel-delivery.service.js';
import { sendTemplate } from './gupshup-control.service.js';
import { sendCrmMessage } from './hospital-crm-communication-hub.service.js';
import { listCrmChannelIntegrations } from './crm-channel-integrations.service.js';
import { downloadRecording } from './voice-providers/telecmi.js';

export const INBOX_CHANNELS = ['whatsapp', 'sms', 'email', 'call'];
const MESSAGE_CHANNELS = ['whatsapp', 'sms', 'email'];
const WINDOW_MS = 24 * 3600 * 1000;
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const positive = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const digits10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// $1 tenant id, $2 tenant uid, $3 current user (own mailbox only), $4 v2 lead id or NULL for all leads.
const EVENTS_SQL = `
  WITH leads AS (
    SELECT lv.id AS v2_id, lv.legacy_lead_id, l.email,
           right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) AS phone10
      FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
     WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND ($4::bigint IS NULL OR lv.id = $4::bigint)
  )
  SELECT e.lead_id AS v2_id, 'evt:' || e.id AS key, e.channel, e.direction, e.message_type AS kind, e.subject,
         e.body_preview AS body, e.status, e.failure_reason, e.created_at AS at, e.owner_user_id AS user_id,
         e.template_id, (e.metadata->>'answered_sec')::int AS duration, e.delivered_at, e.read_at,
         CASE WHEN e.channel = 'call' THEN jsonb_build_object('recording', e.metadata->>'recording' IS NOT NULL, 'answered', e.metadata->'answered', 'waited_sec', e.metadata->'waited_sec') END AS meta
    FROM crm_communication_events e JOIN leads ld ON ld.v2_id = e.lead_id
   WHERE e.tenant_id = $1 AND e.channel IN ('whatsapp', 'sms', 'email', 'call')
  UNION ALL
  SELECT ld.v2_id, 'cc:' || c.id, 'call', c.direction, 'call', NULL,
         initcap(replace(COALESCE(c.disposition, c.state), '-', ' ')), c.state, NULL, COALESCE(c.started_at, c.updated_at), NULL,
         NULL, c.provider_duration_seconds, c.answered_at, NULL, NULL::jsonb
    FROM cc_calls c JOIN leads ld ON ld.phone10 <> '' AND right(regexp_replace(COALESCE(c.destination, ''), '[^0-9]', '', 'g'), 10) = ld.phone10
   WHERE c.tenant_uid = $2
  UNION ALL
  SELECT ld.v2_id, 'act:' || a.id, CASE WHEN a.type = 'call' THEN 'call' ELSE 'note' END,
         CASE WHEN a.type = 'call' THEN 'outbound' ELSE 'internal' END, a.type, a.title,
         COALESCE(NULLIF(a.description, ''), a.title), a.outcome, NULL, a.created_at, a.created_by,
         NULL, NULL, NULL, NULL, NULL::jsonb
    FROM crm_activities a JOIN leads ld ON ld.legacy_lead_id = a.lead_id
   WHERE a.type IN ('call', 'note') AND (a.tenant_uid = $2 OR a.tenant_uid IS NULL)
  UNION ALL
  SELECT ld.v2_id, 'mail:' || m.id, 'email', 'inbound', 'email', m.subject,
         left(COALESCE(m.body_text, ''), 2000), CASE WHEN m.is_read THEN 'read' ELSE 'received' END, NULL, m.received_at, m.crm_user_id,
         NULL, NULL, NULL, NULL, NULL::jsonb
    FROM crm_email_inbox m JOIN leads ld ON ld.email IS NOT NULL AND lower(ld.email) = lower(m.from_addr)
   WHERE m.crm_user_id = $3`;

function windowInfo(lastWhatsappInbound) {
  const last = lastWhatsappInbound ? new Date(lastWhatsappInbound).getTime() : 0;
  return { open: Boolean(last) && Date.now() < last + WINDOW_MS, closesAt: last ? new Date(last + WINDOW_MS) : null };
}
function effectiveStatus(meta, lastInboundAt) {
  const status = ['open', 'pending', 'closed'].includes(meta?.inbox_status) ? meta.inbox_status : 'open';
  const changedAt = meta?.inbox_status_at ? new Date(meta.inbox_status_at).getTime() : 0;
  // A patient writing again reopens a pending or closed thread.
  if (status !== 'open' && lastInboundAt && new Date(lastInboundAt).getTime() > changedAt) return 'open';
  return status;
}

export async function listUnifiedInbox(tenantId, tenantUid, userId, { channel = '', status = 'open', search = '', assigned = '', due = '', limit = 100, ownOnly = false } = {}) {
  const ch = INBOX_CHANNELS.includes(channel) ? channel : null;
  const { rows } = await sharedPool.query(
    `WITH ev AS (${EVENTS_SQL}),
     per_lead AS (
       SELECT v2_id,
              max(at) FILTER (WHERE channel <> 'note') AS last_at,
              max(at) FILTER (WHERE direction = 'inbound') AS last_inbound_at,
              max(at) FILTER (WHERE direction = 'inbound' AND channel = 'whatsapp') AS last_wa_inbound_at,
              max(at) FILTER (WHERE direction = 'outbound') AS last_outbound_at,
              array_agg(DISTINCT channel) FILTER (WHERE channel <> 'note') AS channels
         FROM ev GROUP BY v2_id
     )
     SELECT pl.*, lv.legacy_lead_id, lv.metadata AS v2_meta, lv.lifecycle_stage, lv.next_action, lv.next_action_at, l.priority,
            l.name, l.phone, l.email, l.status AS lead_status, l.source,
            l.assigned_to, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS assigned_to_name,
            last_ev.channel AS last_channel, last_ev.direction AS last_direction, last_ev.body AS last_message, last_ev.subject AS last_subject,
            (SELECT count(*)::int FROM ev x WHERE x.v2_id = pl.v2_id AND x.direction = 'inbound'
                AND x.at > COALESCE((lv.metadata->>'inbox_read_at')::timestamptz, '-infinity')) AS unread
       FROM per_lead pl
       JOIN crm_leads_v2 lv ON lv.id = pl.v2_id
       JOIN crm_leads l ON l.id = lv.legacy_lead_id
       LEFT JOIN users u ON u.id = l.assigned_to AND u.tenant_id = $1
       LEFT JOIN LATERAL (SELECT channel, direction, body, subject FROM ev x WHERE x.v2_id = pl.v2_id AND x.channel <> 'note'
                          ORDER BY x.at DESC LIMIT 1) last_ev ON TRUE
      WHERE pl.last_at IS NOT NULL`,
    [tenantId, tenantUid, userId || 0, null]);

  const q = String(search || '').trim().toLowerCase().slice(0, 80);
  const qDigits = q.replace(/\D/g, '');
  const all = rows.map((r) => ({
    lead_id: r.v2_id, legacy_lead_id: r.legacy_lead_id, name: r.name || 'Unnamed lead', phone: r.phone, email: r.email,
    lead_status: r.lead_status, source: r.source, channels: (r.channels || []).sort(), last_at: r.last_at,
    last_channel: r.last_channel, last_direction: r.last_direction, last_message: r.last_subject && r.last_channel === 'email' ? `${r.last_subject} — ${r.last_message || ''}` : r.last_message,
    unread: r.unread, assigned_to: r.assigned_to, assigned_to_name: r.assigned_to_name,
    status: effectiveStatus(r.v2_meta, r.last_inbound_at), window: windowInfo(r.last_wa_inbound_at),
    lifecycle_stage: r.lifecycle_stage, priority: r.priority || 'medium', next_action: r.next_action, next_action_at: r.next_action_at,
    // The patient wrote or called and nobody has answered since: how long they have been waiting.
    waiting_since: r.last_inbound_at && (!r.last_outbound_at || new Date(r.last_inbound_at) > new Date(r.last_outbound_at)) ? r.last_inbound_at : null,
    due: Boolean(r.next_action_at && new Date(r.next_action_at) <= new Date()),
  }));
  // Field executives see only their own patients, in the list and in the counts.
  if (ownOnly) for (let i = all.length - 1; i >= 0; i -= 1) if (Number(all[i].assigned_to) !== Number(userId)) all.splice(i, 1);
  const counts = { open: 0, pending: 0, closed: 0, unread: 0, due: 0 };
  for (const r of all) { counts[r.status] += 1; if (r.unread) counts.unread += 1; if (r.due) counts.due += 1; }
  const filtered = all.filter((r) =>
    (!['open', 'pending', 'closed'].includes(status) || r.status === status) &&
    (!ch || r.channels.includes(ch)) &&
    (assigned !== 'me' || Number(r.assigned_to) === Number(userId)) &&
    (assigned !== 'unassigned' || !r.assigned_to) &&
    (due !== '1' || r.due) &&
    (!q || String(r.name).toLowerCase().includes(q) || String(r.email || '').toLowerCase().includes(q) || (qDigits.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(qDigits))))
    .sort((a, b) => new Date(b.last_at) - new Date(a.last_at))
    .slice(0, Math.min(Math.max(Number(limit) || 100, 1), 300));
  return { conversations: filtered, counts, channels: await replyChannels(tenantId) };
}

async function replyChannels(tenantId) {
  const integrations = await listCrmChannelIntegrations(tenantId).catch(() => []);
  const out = {};
  for (const ch of MESSAGE_CHANNELS) {
    const row = integrations.find((i) => i.channel === ch);
    out[ch] = { live: row?.deliveryMode === 'live', provider: row?.provider || null, message: row?.healthMessage || 'Not connected' };
  }
  return out;
}

async function loadLead(tenantId, v2Id) {
  const { rows: [lead] } = await sharedPool.query(
    `SELECT lv.id AS lead_id, lv.legacy_lead_id, lv.metadata, lv.first_response_at, lv.contact_id, lv.person_id, lv.lifecycle_stage,
            lv.next_action, lv.next_action_at, lv.consent_status, c.city, c.preferred_language, lv.referring_doctor_id, rd.doctor_name AS referring_doctor,
            l.name, l.phone, l.email, l.status AS lead_status, l.source, l.priority, l.assigned_to, l.created_at,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS assigned_to_name
       FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
       LEFT JOIN users u ON u.id = l.assigned_to AND u.tenant_id = lv.tenant_id
       LEFT JOIN crm_contacts_v2 c ON c.id = lv.contact_id AND c.tenant_id = lv.tenant_id
       LEFT JOIN field_doctor_crm rd ON rd.id = lv.referring_doctor_id AND rd.tenant_id = lv.tenant_id
      WHERE lv.tenant_id = $1 AND lv.id = $2 AND lv.deleted_at IS NULL`, [tenantId, v2Id]);
  if (!lead) throw fail(404, 'Lead not found');
  return lead;
}

export async function getUnifiedThread(tenantId, tenantUid, userId, leadId, { markRead = true } = {}) {
  const v2Id = positive(leadId);
  if (!v2Id) throw fail(400, 'Invalid lead');
  const lead = await loadLead(tenantId, v2Id);
  const { rows: events } = await sharedPool.query(
    `SELECT ev.*, t.name AS template_name, NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS by_name
       FROM (${EVENTS_SQL}) ev
       LEFT JOIN crm_communication_templates t ON t.id = ev.template_id AND t.tenant_id = $1
       LEFT JOIN users u ON u.id = ev.user_id AND u.tenant_id = $1
      ORDER BY ev.at ASC, ev.key ASC LIMIT 1000`,
    [tenantId, tenantUid, userId || 0, v2Id]);
  const lastInbound = events.filter((e) => e.direction === 'inbound').map((e) => e.at).pop() || null;
  const lastWa = events.filter((e) => e.direction === 'inbound' && e.channel === 'whatsapp').map((e) => e.at).pop() || null;
  if (markRead) {
    await sharedPool.query(`UPDATE crm_leads_v2 SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('inbox_read_at', now()) WHERE tenant_id = $1 AND id = $2`, [tenantId, v2Id]);
  }
  const { rows: system } = await sharedPool.query(
    `SELECT 'stage:' || f.id AS key, 'system' AS channel, 'internal' AS direction, 'stage' AS kind, NULL::text AS subject,
            f.from_stage::text AS from_stage, f.to_stage::text AS to_stage, COALESCE(f.occurred_at, f.event_at) AS at,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS by_name
       FROM crm_funnel_events f LEFT JOIN users u ON u.id = f.actor_user_id AND u.tenant_id = $1
      WHERE f.tenant_id = $1 AND f.lead_id = $2 AND f.event_type = 'stage_changed'
     UNION ALL
     SELECT 'taskdone:' || a.id, 'system', 'internal', 'task_done', a.title::text, NULL, NULL, a.completed_at,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '')
       FROM crm_activities a LEFT JOIN users u ON u.id = a.created_by AND u.tenant_id = $1
      WHERE a.lead_id = $3 AND a.type = 'task' AND a.completed_at IS NOT NULL AND a.tenant_uid = $4`,
    [tenantId, v2Id, lead.legacy_lead_id, tenantUid]);
  const timeline = [...events.map(({ v2_id, user_id, template_id, ...e }) => e), ...system]
    .sort((a, b) => new Date(a.at) - new Date(b.at) || String(a.key).localeCompare(String(b.key)));
  const tasks = await leadTasks(lead.legacy_lead_id, tenantUid, tenantId);
  const count = (ch, dir) => events.filter((e) => e.channel === ch && (!dir || e.direction === dir)).length;
  const summary = {
    messages: events.filter((e) => MESSAGE_CHANNELS.includes(e.channel)).length, calls: count('call'), notes: count('note'),
    missed_calls: events.filter((e) => e.channel === 'call' && e.direction === 'inbound' && (e.status === 'missed' || e.meta?.answered === false)).length,
    first_contact_at: lead.created_at,
    last_contact_at: events.filter((e) => e.direction === 'outbound').map((e) => e.at).pop() || null,
    last_inbound_at: lastInbound,
  };
  return {
    lead: { ...lead, status: effectiveStatus(lead.metadata, lastInbound), window: windowInfo(lastWa), metadata: undefined },
    events: timeline, tasks, summary,
    channels: await replyChannels(tenantId),
  };
}

// ── Tasks and follow-ups: crm_activities rows of type 'task' on the lead (scheduled_at = due, completed_at = done).
// The earliest open task is the lead's next step (crm_leads_v2.next_action / next_action_at, and the Leads page's
// next_followup), so the queue, the dashboard's overdue count and the Leads page all agree.
async function leadTasks(legacyLeadId, tenantUid, tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT a.id, a.title, a.description, a.scheduled_at AS due_at, a.completed_at, a.created_at,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS by_name
       FROM crm_activities a LEFT JOIN users u ON u.id = a.created_by AND u.tenant_id = $3
      WHERE a.lead_id = $1 AND a.type = 'task' AND a.tenant_uid = $2
        AND (a.completed_at IS NULL OR a.completed_at > now() - interval '30 days')
      ORDER BY a.completed_at IS NOT NULL, a.scheduled_at NULLS LAST, a.id LIMIT 50`, [legacyLeadId, tenantUid, tenantId]);
  return rows;
}
async function refreshNextAction(db, tenantId, tenantUid, legacyLeadId) {
  const { rows: [next] } = await db.query(
    `SELECT title, scheduled_at FROM crm_activities WHERE lead_id = $1 AND tenant_uid = $2 AND type = 'task' AND completed_at IS NULL
      ORDER BY scheduled_at NULLS LAST, id LIMIT 1`, [legacyLeadId, tenantUid]);
  await db.query(`UPDATE crm_leads_v2 SET next_action = $1, next_action_at = $2, updated_at = now() WHERE tenant_id = $3 AND legacy_lead_id = $4`,
    [next?.title || null, next?.scheduled_at || null, tenantId, legacyLeadId]);
  await db.query(`UPDATE crm_leads SET next_followup = $1 WHERE id = $2`, [next?.scheduled_at || null, legacyLeadId]).catch(() => {});
}
function parseDue(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw fail(400, 'Choose a valid date and time');
  if (d.getTime() < Date.now() - 365 * 864e5 || d.getTime() > Date.now() + 2 * 365 * 864e5) throw fail(400, 'Choose a date within two years');
  return d;
}
export async function createTask(tenantId, tenantUid, userId, leadId, { title, dueAt, note } = {}) {
  const lead = await loadLead(tenantId, positive(leadId));
  const name = String(title || '').trim().slice(0, 200);
  if (!name) throw fail(400, 'Give the task a title');
  const due = parseDue(dueAt);
  const { rows: [task] } = await sharedPool.query(
    `INSERT INTO crm_activities (type, title, description, lead_id, scheduled_at, created_by, tenant_uid, created_at)
     VALUES ('task', $1, $2, $3, $4, $5, $6, now()) RETURNING id, title, description, scheduled_at AS due_at, completed_at, created_at`,
    [name, String(note || '').trim().slice(0, 2000) || null, lead.legacy_lead_id, due, userId || null, tenantUid]);
  await refreshNextAction(sharedPool, tenantId, tenantUid, lead.legacy_lead_id);
  return task;
}
export async function updateTask(tenantId, tenantUid, userId, taskId, { done, dueAt, title } = {}) {
  const id = positive(taskId);
  if (!id) throw fail(400, 'Invalid task');
  const { rows: [task] } = await sharedPool.query(
    `SELECT a.id, a.lead_id FROM crm_activities a JOIN crm_leads_v2 lv ON lv.legacy_lead_id = a.lead_id AND lv.tenant_id = $2
      WHERE a.id = $1 AND a.type = 'task' AND a.tenant_uid = $3`, [id, tenantId, tenantUid]);
  if (!task) throw fail(404, 'Task not found');
  const sets = [], params = [];
  if (done !== undefined) { params.push(Boolean(done)); sets.push(`completed_at = CASE WHEN $${params.length}::boolean THEN COALESCE(completed_at, now()) ELSE NULL END`); }
  if (dueAt !== undefined) { params.push(parseDue(dueAt)); sets.push(`scheduled_at = $${params.length}`); }
  if (title !== undefined) { const t = String(title || '').trim().slice(0, 200); if (!t) throw fail(400, 'Give the task a title'); params.push(t); sets.push(`title = $${params.length}`); }
  if (!sets.length) throw fail(400, 'Nothing to change');
  params.push(id);
  const { rows: [row] } = await sharedPool.query(`UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${params.length}
    RETURNING id, title, description, scheduled_at AS due_at, completed_at, created_at`, params);
  await refreshNextAction(sharedPool, tenantId, tenantUid, task.lead_id);
  return row;
}
// Book an appointment: journey stage "Appointment booked" plus a task at the appointment time.
export async function bookAppointment(tenantId, tenantUid, userId, leadId, { at, note } = {}) {
  const due = parseDue(at);
  if (!due) throw fail(400, 'Choose the appointment date and time');
  await setJourneyStage(tenantId, userId, leadId, 'appointment_booked');
  const label = String(note || '').trim().slice(0, 150);
  return createTask(tenantId, tenantUid, userId, leadId, { title: label ? `Appointment: ${label}` : 'Appointment', dueAt: due });
}
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export async function setLeadFields(tenantId, leadId, { priority } = {}) {
  const lead = await loadLead(tenantId, positive(leadId));
  if (!PRIORITIES.includes(priority)) throw fail(400, 'Priority must be low, medium, high or urgent');
  await sharedPool.query(`UPDATE crm_leads SET priority = $1, updated_at = now() WHERE id = $2`, [priority, lead.legacy_lead_id]);
  await sharedPool.query(`UPDATE crm_leads_v2 SET priority = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3`, [priority, tenantId, lead.lead_id]);
  return { lead_id: lead.lead_id, priority };
}

async function whatsappConversation(tenantId, lead) {
  const { rows: [open] } = await sharedPool.query(
    `SELECT id FROM crm_conversations WHERE tenant_id = $1 AND lead_id = $2 AND channel = 'whatsapp' AND status <> 'closed' ORDER BY created_at DESC LIMIT 1`,
    [tenantId, lead.lead_id]);
  if (open) return open.id;
  const phone = digits10(lead.phone);
  const { rows: [created] } = await sharedPool.query(
    `INSERT INTO crm_conversations (tenant_id, lead_id, identity_id, channel, status, last_message_at, metadata)
     VALUES ($1, $2, $3, 'whatsapp', 'open', now(), $4::jsonb) RETURNING id`,
    [tenantId, lead.lead_id, lead.person_id, JSON.stringify({ provider: 'gupshup', customer_id: phone ? `+91${phone}` : null })]);
  return created.id;
}

async function markResponded(tenantId, v2Id) {
  await sharedPool.query(`UPDATE crm_leads_v2 SET first_response_at = COALESCE(first_response_at, now()), updated_at = now() WHERE tenant_id = $1 AND id = $2`, [tenantId, v2Id]);
  await sharedPool.query(`UPDATE crm_leads SET last_contacted = now(), updated_at = now() WHERE id = (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_id = $1 AND id = $2)`, [tenantId, v2Id]);
}

/** channel: whatsapp | sms | email | note. WhatsApp free text only inside the 24h window. */
export async function sendUnified(tenantId, tenantUid, userId, leadId, { channel, text, subject, templateId, params } = {}) {
  const v2Id = positive(leadId);
  if (!v2Id) throw fail(400, 'Invalid lead');
  const lead = await loadLead(tenantId, v2Id);
  const body = String(text || '').trim();

  if (channel === 'note') {
    if (!body) throw fail(400, 'Write the note first.');
    await sharedPool.query(
      `INSERT INTO crm_activities (type, title, description, lead_id, created_by, tenant_uid, completed_at) VALUES ('note', 'Inbox note', $1, $2, $3, $4, now())`,
      [body.slice(0, 5000), lead.legacy_lead_id, userId, tenantUid]);
    return { sent: true, channel: 'note' };
  }

  if (channel === 'whatsapp') {
    if (templateId) {
      const result = await sendTemplate(tenantId, { templateId, leadId: lead.legacy_lead_id, params: Array.isArray(params) ? params : [] }, userId);
      await markResponded(tenantId, v2Id);
      return { sent: true, channel, kind: 'template', result };
    }
    if (!body) throw fail(400, 'Type a message.');
    if (body.length > 4096) throw fail(400, 'WhatsApp messages are limited to 4096 characters.');
    const { rows: [last] } = await sharedPool.query(
      `SELECT max(created_at) AS at FROM crm_communication_events WHERE tenant_id = $1 AND lead_id = $2 AND channel = 'whatsapp' AND direction = 'inbound'`, [tenantId, v2Id]);
    if (!windowInfo(last?.at).open) throw fail(409, 'The 24-hour WhatsApp reply window is closed. Send an approved template; once the patient replies you can write freely again.');
    const phone = digits10(lead.phone);
    if (phone.length < 10) throw fail(409, 'This lead has no valid mobile number.');
    const to = `91${phone}`;
    const result = await sendTenantWhatsApp(tenantId, { to, body });
    if (!result.configured) throw fail(503, 'WhatsApp is not connected. An administrator can connect it in Settings & Channels.');
    const conversationId = await whatsappConversation(tenantId, lead);
    await sharedPool.query(
      `INSERT INTO crm_communication_events (tenant_id, lead_id, contact_id, identity_id, conversation_id, channel, direction, message_type, body_preview,
         provider, provider_message_id, status, sent_at, failed_at, failure_reason, owner_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, 'whatsapp', 'outbound', 'message', $6, $7, $8, $9::varchar,
               CASE WHEN $9::varchar = 'sent' THEN now() END, CASE WHEN $9::varchar = 'failed' THEN now() END, $10, $11, '{"source":"inbox"}'::jsonb)`,
      [tenantId, v2Id, lead.contact_id, lead.person_id, conversationId, body.slice(0, 2000), result.provider || 'gupshup', result.providerMessageId || null,
        result.success ? 'sent' : 'failed', result.success ? null : String(result.error || 'Send failed').slice(0, 500), userId]);
    await sharedPool.query(`UPDATE crm_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`, [conversationId]);
    if (!result.success) throw fail(502, `WhatsApp did not accept the message: ${result.error || 'unknown error'}`);
    await markResponded(tenantId, v2Id);
    return { sent: true, channel, kind: 'text' };
  }

  if (channel === 'sms' || channel === 'email') {
    if (!body) throw fail(400, 'Type a message.');
    const channels = await replyChannels(tenantId);
    if (!channels[channel].live) throw fail(409, `${channel === 'sms' ? 'SMS' : 'Email'} is not connected yet. An administrator can connect it in Settings & Channels.`);
    const result = await sendCrmMessage({ channel, subject: subject || 'Medstar Hospitals', message: body, leadId: lead.legacy_lead_id, userId, tenantId, tenantUid });
    await markResponded(tenantId, v2Id);
    return { sent: true, channel, result };
  }
  throw fail(400, 'Choose WhatsApp, SMS, email or an internal note.');
}

export async function setUnifiedStatus(tenantId, leadId, status) {
  if (!['open', 'pending', 'closed'].includes(status)) throw fail(400, 'Status must be open, pending or closed.');
  const v2Id = positive(leadId);
  const { rowCount } = await sharedPool.query(
    `UPDATE crm_leads_v2 SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('inbox_status', $3::text, 'inbox_status_at', now())
      WHERE tenant_id = $1 AND id = $2`, [tenantId, v2Id, status]);
  if (!rowCount) throw fail(404, 'Lead not found');
  // Keep the per-channel conversations in step so the WhatsApp view agrees.
  await sharedPool.query(`UPDATE crm_conversations SET status = $3, updated_at = now() WHERE tenant_id = $1 AND lead_id = $2`, [tenantId, v2Id, status]);
  return { lead_id: v2Id, status };
}

/** Assigning a thread = setting the lead's owner, the same field the Leads page shows. */
export async function assignUnified(tenantId, leadId, userId) {
  const v2Id = positive(leadId);
  const target = userId === null ? null : positive(userId);
  if (target) {
    const { rows } = await sharedPool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND status = 'active'`, [target, tenantId]);
    if (!rows.length) throw fail(400, 'That user is not an active member of this CRM.');
  }
  const { rows: [lv] } = await sharedPool.query(
    `UPDATE crm_leads_v2 SET owner_user_id = $3, assigned_at = CASE WHEN $3::bigint IS NULL THEN NULL ELSE now() END, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 RETURNING legacy_lead_id`, [tenantId, v2Id, target]);
  if (!lv) throw fail(404, 'Lead not found');
  await sharedPool.query(`UPDATE crm_leads SET assigned_to = $2, updated_at = now() WHERE id = $1`, [lv.legacy_lead_id, target]);
  await sharedPool.query(`UPDATE crm_conversations SET assigned_to_user_id = $3, updated_at = now() WHERE tenant_id = $1 AND lead_id = $2`, [tenantId, v2Id, target]);
  return { lead_id: v2Id, assigned_to: target };
}

/** For the Leads page: inbox totals (menu badge) and the v2 lead id behind a legacy lead. */
export async function inboxSummary(tenantId, tenantUid, userId, ownOnly = false) {
  const { counts } = await listUnifiedInbox(tenantId, tenantUid, userId, { status: 'all', limit: 1, ownOnly });
  return counts;
}
// Patient journey stage, set from the Inbox. Kept in step with the Leads page status where they overlap.
const LEGACY_FOR_STAGE = { new: 'new', attempting_contact: 'new', contacted: 'contacted', qualified: 'qualified', lost: 'lost' };
export async function setJourneyStage(tenantId, userId, leadId, stage) {
  const lead = await loadLead(tenantId, positive(leadId));
  const { transitionLead, CRM_LIFECYCLE_STAGES } = await import('./hospital-crm-foundation.service.js');
  if (!CRM_LIFECYCLE_STAGES.includes(stage)) throw fail(400, 'Unknown journey stage');
  await transitionLead({ tenantId, leadId: lead.lead_id, toStage: stage, actorUserId: userId, channel: 'crm', note: 'Set from the Inbox' });
  const legacy = LEGACY_FOR_STAGE[stage] || (['new', 'contacted'].includes(lead.lead_status) && stage !== 'nurture' && stage !== 'dormant' && stage !== 'duplicate' ? 'qualified' : null);
  if (legacy && legacy !== lead.lead_status) await sharedPool.query(`UPDATE crm_leads SET status = $1, updated_at = NOW() WHERE id = $2`, [legacy, lead.legacy_lead_id]);
  return { lead_id: lead.lead_id, lifecycle_stage: stage };
}

export async function v2ForLegacy(tenantId, legacyId) {
  const { rows: [r] } = await sharedPool.query(`SELECT id FROM crm_leads_v2 WHERE tenant_id = $1 AND legacy_lead_id = $2`, [tenantId, positive(legacyId)]);
  if (!r) throw fail(404, 'Lead not found');
  return { lead_id: r.id };
}

/** Calling through TeleCMI CHUB: who can place a call, and why not if they can't. */
export async function telephonyStatus(tenantId, userId) {
  const configured = Boolean(process.env.VOICE_TELECMI_PROVIDER_APPID && process.env.VOICE_TELECMI_PROVIDER_SECRET);
  const { rows: [u] } = await sharedPool.query(`SELECT metadata->>'telecmi_user_id' AS agent FROM users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
  const agent = u?.agent || process.env.VOICE_TELECMI_PROVIDER_USER_ID || null;
  return {
    provider: 'telecmi', configured, agent,
    canCall: configured && Boolean(agent) && process.env.CRM_OUTBOUND_ENABLED === 'true',
    reason: !configured ? 'TeleCMI is not connected.' : !agent ? 'Your CRM user is not linked to a TeleCMI agent yet. Ask an administrator.' : process.env.CRM_OUTBOUND_ENABLED !== 'true' ? 'Outbound calling is switched off.' : null,
  };
}

/** Click-to-call: TeleCMI rings the agent first, then the patient. extra_params carry the lead so the
 * CDR webhook files the call on this lead even if the number matches several. */
export async function clickToCall(tenantId, userId, leadId) {
  const v2Id = positive(leadId);
  const lead = await loadLead(tenantId, v2Id);
  const status = await telephonyStatus(tenantId, userId);
  if (!status.canCall) throw fail(409, status.reason);
  const phone = digits10(lead.phone);
  if (phone.length < 10) throw fail(409, 'This lead has no valid mobile number.');
  const res = await fetch('https://rest.telecmi.com/v2/webrtc/click2call', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ user_id: status.agent, secret: process.env.VOICE_TELECMI_PROVIDER_SECRET, to: Number(`91${phone}`),
      webrtc: false, followme: true, extra_params: { lead_id: lead.legacy_lead_id, crm_user_id: userId } }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status !== 200 || data.code !== 200) {
    const why = { 400: 'TeleCMI rejected the request.', 404: 'Your TeleCMI agent ID is not valid.', 407: 'The TeleCMI app secret is not valid.' }[res.status] || data.msg;
    throw fail(502, `Call not placed: ${why || `TeleCMI error ${res.status}`}`);
  }
  return { placed: true, requestId: data.request_id, message: 'TeleCMI is ringing your phone. The patient is connected when you answer.' };
}

/** Streams a call recording, only for a call event on this tenant's lead. */
export async function callRecording(tenantId, leadId, eventKey) {
  const id = positive(String(eventKey || '').replace(/^evt:/, ''));
  const { rows: [ev] } = await sharedPool.query(
    `SELECT metadata->>'recording' AS file FROM crm_communication_events WHERE tenant_id = $1 AND lead_id = $2 AND id = $3 AND channel = 'call' AND provider = 'telecmi'`,
    [tenantId, positive(leadId), id]);
  if (!ev?.file) throw fail(404, 'No recording for this call.');
  return downloadRecording(ev.file);
}

/** Admin: TeleCMI agents (never their passwords) and which CRM user each one dials as. */
export async function telephonyAgents(tenantId) {
  const appid = Number(process.env.VOICE_TELECMI_PROVIDER_APPID), secret = process.env.VOICE_TELECMI_PROVIDER_SECRET;
  if (!appid || !secret) throw fail(409, 'TeleCMI is not connected.');
  const res = await fetch('https://rest.telecmi.com/v2/user/all', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appid, secret }), signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (data?.code !== 200) throw fail(502, 'TeleCMI did not return the agent list.');
  const agents = (data.agents || []).map((a) => ({ agent_id: String(a.agent_id), name: a.name, extension: a.extension,
    phone: a.phone ? String(a.phone).replace(/\d(?=\d{4})/g, '•') : null }));
  const { rows: users } = await sharedPool.query(
    `SELECT id, NULLIF(trim(concat_ws(' ', "firstName", "lastName")), '') AS name, email, metadata->>'telecmi_user_id' AS telecmi_user_id
       FROM users WHERE tenant_id = $1 AND status = 'active' ORDER BY id`, [tenantId]);
  return { agents, users };
}
export async function linkTelephonyAgent(tenantId, userId, telecmiUserId) {
  const target = positive(userId);
  const agent = telecmiUserId ? String(telecmiUserId) : null;
  if (agent) {
    const { agents } = await telephonyAgents(tenantId);
    if (!agents.some((a) => a.agent_id === agent)) throw fail(400, 'That TeleCMI agent does not exist on this account.');
    const { rows: taken } = await sharedPool.query(`SELECT id FROM users WHERE tenant_id = $1 AND id <> $2 AND metadata->>'telecmi_user_id' = $3`, [tenantId, target, agent]);
    if (taken.length) throw fail(409, 'That TeleCMI agent is already linked to another CRM user.');
  }
  const { rowCount } = await sharedPool.query(
    `UPDATE users SET metadata = CASE WHEN $3::text IS NULL THEN COALESCE(metadata, '{}'::jsonb) - 'telecmi_user_id'
                                      ELSE COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('telecmi_user_id', $3::text) END
      WHERE id = $1 AND tenant_id = $2`, [target, tenantId, agent]);
  if (!rowCount) throw fail(404, 'User not found');
  return { user_id: target, telecmi_user_id: agent };
}

// Used by the access checks in the route.
export async function currentOwner(tenantId, leadId) {
  const { rows: [r] } = await sharedPool.query(`SELECT l.assigned_to FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id WHERE lv.tenant_id = $1 AND lv.id = $2`, [tenantId, positive(leadId)]);
  if (!r) throw fail(404, 'Lead not found');
  return r.assigned_to;
}
export async function taskLead(tenantId, tenantUid, taskId) {
  const { rows: [r] } = await sharedPool.query(
    `SELECT lv.id FROM crm_activities a JOIN crm_leads_v2 lv ON lv.legacy_lead_id = a.lead_id AND lv.tenant_id = $1 WHERE a.id = $2 AND a.tenant_uid = $3`,
    [tenantId, positive(taskId), tenantUid]);
  return r?.id || null;
}
