/** Call centre: agent status (drives TeleCMI routing), the callback queue, an agent's day, and scripts and
 * quick answers. Used by the web (/api/crm/call-centre) and by the app's agent mode (/api/app).
 *
 *   Status        crm_agent_status_log; the open row is current. Available / Break / Offline map to TeleCMI's
 *                 user/status online / break / offline (doc.telecmi.com/chub/docs/agent-status-update), so
 *                 TeleCMI only rings available agents. A user with no TeleCMI agent still gets a status.
 *   Callbacks     missed inbound calls not yet returned (last 7 days) and open tasks due by tonight, one list
 *                 in due-time order. A missed call is returned by a later answered call, an outbound message,
 *                 a logged call, or a dismissal; outbound attempts that did not connect are counted.
 *   My day        calls answered and placed, talk time, missed calls returned, median WhatsApp/SMS reply time,
 *                 tasks done, time available and on break. Days run on Indian time.
 *   Quick answers crm_quick_answers: managers write them; everyone with the Inbox reads and inserts them.
 *
 * Who sees what follows crm-access: a field executive only their own leads; agents and managers everyone. */
import sharedPool from '../db/pgPool.js';
import { ownScope, canReassign, assertV2LeadAccess } from './crm-access.service.js';
import * as tc from './telecmi-control.service.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const positive = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const clean = (v, max = 200) => { const s = String(v ?? '').trim().slice(0, max); return s || null; };
const NAME = (alias) => `NULLIF(trim(concat_ws(' ', ${alias}."firstName", ${alias}."lastName")), '')`;

export const STATUSES = ['available', 'break', 'offline'];
const TELECMI_STATUS = { available: 'online', break: 'break', offline: 'offline' };

/** 'YYYY-MM-DD' (Indian time) → [start, end) timestamps. Defaults to today. */
function istDay(date) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date
    : new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const start = new Date(`${d}T00:00:00+05:30`);
  return { day: d, start, end: new Date(start.getTime() + 864e5) };
}

async function telecmiAgentOf(tenantId, userId) {
  const { rows: [u] } = await sharedPool.query(`SELECT metadata->>'telecmi_user_id' AS agent FROM users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
  return u?.agent || null;
}

// ── Status ───────────────────────────────────────────────────────────────────────────────────────
export async function currentStatus(tenantId, userId) {
  const { rows: [s] } = await sharedPool.query(
    `SELECT status, reason, started_at AS since, telecmi_synced, telecmi_error FROM crm_agent_status_log
      WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`, [tenantId, userId]);
  const agent = await telecmiAgentOf(tenantId, userId);
  return { status: s?.status || 'offline', reason: s?.reason || null, since: s?.since || null,
    telecmi: { linked: Boolean(agent), synced: Boolean(s?.telecmi_synced), error: s?.telecmi_error || null } };
}

export async function setStatus(user, status, reason) {
  if (!STATUSES.includes(status)) throw fail(400, 'Status must be available, break or offline.');
  const tenantId = Number(user.tenantId), userId = Number(user.id);
  const agent = await telecmiAgentOf(tenantId, userId);
  let synced = false, error = null;
  if (agent && tc.telecmiConfigured()) {
    try { await tc.setAgentStatus(agent, TELECMI_STATUS[status]); synced = true; }
    catch (e) { error = String(e.message || 'TeleCMI did not accept the status').slice(0, 300); }
  } else if (!agent) error = 'Not linked to a TeleCMI agent, so calls are not routed to you.';
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE crm_agent_status_log SET ended_at = now() WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL`, [tenantId, userId]);
    await client.query(`INSERT INTO crm_agent_status_log (tenant_id, user_id, status, reason, telecmi_synced, telecmi_error) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, userId, status, status === 'break' ? clean(reason, 80) : null, synced, error]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return currentStatus(tenantId, userId);
}

// ── Callback queue ───────────────────────────────────────────────────────────────────────────────
/** scope 'mine': my tasks, and missed calls on my leads or nobody's. 'all': everyone's (not for field executives). */
export async function callbackQueue(user, { scope = 'mine' } = {}) {
  const tenantId = Number(user.tenantId), tenantUid = user.tenantUid, me = Number(user.id);
  const own = ownScope(user);
  const everyone = scope === 'all' && !own;
  const { end } = istDay();
  const missedOwner = own ? 'AND l.assigned_to = $2' : everyone ? 'AND $2::int > 0' : 'AND (l.assigned_to = $2 OR l.assigned_to IS NULL)';
  const { rows: missed } = await sharedPool.query(
    `WITH m AS (
       SELECT e.lead_id, min(e.created_at) AS first_at, max(e.created_at) AS last_at, count(*)::int AS missed_count, max(e.id) AS event_id
         FROM crm_communication_events e
        WHERE e.tenant_id = $1 AND e.channel = 'call' AND e.direction = 'inbound' AND e.status = 'missed' AND e.lead_id IS NOT NULL
          AND e.created_at > now() - interval '7 days'
        GROUP BY e.lead_id)
     SELECT m.*, lv.legacy_lead_id, l.name, l.phone, l.assigned_to, ${NAME('u')} AS owner_name, lv.lifecycle_stage,
            (SELECT count(*)::int FROM crm_communication_events o WHERE o.tenant_id = $1 AND o.lead_id = m.lead_id AND o.channel = 'call'
               AND o.direction = 'outbound' AND o.created_at > m.last_at) AS attempts
       FROM m JOIN crm_leads_v2 lv ON lv.id = m.lead_id AND lv.tenant_id = $1 AND lv.deleted_at IS NULL
       JOIN crm_leads l ON l.id = lv.legacy_lead_id
       LEFT JOIN users u ON u.id = l.assigned_to AND u.tenant_id = $1
      WHERE COALESCE((lv.metadata->>'callback_cleared_at')::timestamptz, '-infinity') < m.last_at
        AND NOT EXISTS (SELECT 1 FROM crm_communication_events o WHERE o.tenant_id = $1 AND o.lead_id = m.lead_id AND o.created_at > m.last_at
              AND ((o.channel = 'call' AND (o.status = 'answered' OR (o.metadata->>'answered')::boolean IS TRUE))
                   OR (o.direction = 'outbound' AND o.channel IN ('whatsapp', 'sms'))))
        AND NOT EXISTS (SELECT 1 FROM crm_activities a WHERE a.lead_id = lv.legacy_lead_id AND a.type = 'call' AND a.created_at > m.last_at)
        ${missedOwner}
      ORDER BY m.last_at`, [tenantId, me]);
  const taskOwner = everyone ? 'AND $3::int > 0' : 'AND COALESCE(a.assigned_to, a.created_by) = $3';
  const { rows: tasks } = await sharedPool.query(
    `SELECT a.id, a.title, a.description, a.scheduled_at AS due_at, a.lead_id AS legacy_lead_id, a.contact_id, a.field_visit_id,
            lv.id AS lead_id, l.name AS lead_name, l.phone AS lead_phone, lv.lifecycle_stage,
            c.name AS contact_name, c.phone AS contact_phone, d.id AS doctor_id,
            COALESCE(a.assigned_to, a.created_by) AS owner_id, ${NAME('u')} AS owner_name
       FROM crm_activities a
       LEFT JOIN crm_leads l ON l.id = a.lead_id
       LEFT JOIN crm_leads_v2 lv ON lv.legacy_lead_id = a.lead_id AND lv.tenant_id = $1
       LEFT JOIN crm_contacts c ON c.id = a.contact_id AND c.tenant_uid = $2
       LEFT JOIN field_doctor_crm d ON d.contact_id = a.contact_id AND d.tenant_id = $1
       LEFT JOIN users u ON u.id = COALESCE(a.assigned_to, a.created_by) AND u.tenant_id = $1
      WHERE a.tenant_uid = $2 AND a.type = 'task' AND a.completed_at IS NULL AND a.scheduled_at IS NOT NULL AND a.scheduled_at < $4
        AND (a.lead_id IS NULL OR lv.deleted_at IS NULL)
        ${taskOwner}
      ORDER BY a.scheduled_at LIMIT 300`, [tenantId, tenantUid, me, end]);
  const now = Date.now();
  const items = [
    ...missed.map((m) => ({ kind: 'missed_call', id: `missed:${m.lead_id}`, event_id: m.event_id, due_at: m.last_at, first_at: m.first_at,
      lead_id: m.lead_id, legacy_lead_id: m.legacy_lead_id, name: m.name || 'Unknown caller', phone: m.phone, stage: m.lifecycle_stage,
      owner_id: m.assigned_to, owner_name: m.owner_name, missed_count: m.missed_count, attempts: m.attempts,
      title: m.missed_count > 1 ? `Missed ${m.missed_count} calls` : 'Missed call', overdue: true })),
    ...tasks.map((t) => ({ kind: 'task', id: `task:${t.id}`, task_id: t.id, due_at: t.due_at, lead_id: t.lead_id, legacy_lead_id: t.legacy_lead_id,
      contact_id: t.contact_id, doctor_id: t.doctor_id, field: Boolean(t.field_visit_id), name: t.lead_name || t.contact_name || 'No patient linked',
      phone: t.lead_phone || t.contact_phone, stage: t.lifecycle_stage, owner_id: t.owner_id, owner_name: t.owner_name,
      title: t.title, note: t.description, overdue: new Date(t.due_at).getTime() < now })),
  ].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  return {
    items, scope: everyone ? 'all' : 'mine', canSeeAll: !own,
    counts: { missed_calls: missed.length, tasks: tasks.length, overdue: items.filter((i) => i.overdue).length },
  };
}

/** "Done" on a missed call without calling back (e.g. the patient wrote in, or a wrong number). */
export async function clearMissedCall(user, leadId) {
  await assertV2LeadAccess(user, user.tenantId, leadId);
  const { rows: [lv] } = await sharedPool.query(
    `UPDATE crm_leads_v2 SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('callback_cleared_at', now(), 'callback_cleared_by', $3::int)
      WHERE tenant_id = $1 AND id = $2 RETURNING id`, [Number(user.tenantId), positive(leadId), Number(user.id)]);
  if (!lv) throw fail(404, 'Lead not found');
  return { cleared: true };
}

// ── My day ───────────────────────────────────────────────────────────────────────────────────────
export async function agentDay(tenantId, tenantUid, userId, { date } = {}) {
  const { day, start, end } = istDay(date);
  const agent = await telecmiAgentOf(tenantId, userId);
  const MINE = `(e.owner_user_id = $2 OR ($5::text IS NOT NULL AND e.metadata->>'agent_user' = $5::text))`;
  const { rows: [s] } = await sharedPool.query(
    `SELECT
       count(*) FILTER (WHERE e.channel = 'call' AND e.direction = 'inbound' AND (e.status = 'answered' OR (e.metadata->>'answered')::boolean IS TRUE))::int AS calls_answered,
       count(*) FILTER (WHERE e.channel = 'call' AND e.direction = 'outbound')::int AS calls_placed,
       count(*) FILTER (WHERE e.channel = 'call' AND e.direction = 'outbound' AND (e.status = 'answered' OR (e.metadata->>'answered')::boolean IS TRUE))::int AS calls_connected,
       COALESCE(sum((e.metadata->>'answered_sec')::int) FILTER (WHERE e.channel = 'call'), 0)::int AS talk_seconds,
       count(*) FILTER (WHERE e.channel IN ('whatsapp', 'sms', 'email') AND e.direction = 'outbound')::int AS messages_sent
       FROM crm_communication_events e
      WHERE e.tenant_id = $1 AND e.created_at >= $3 AND e.created_at < $4 AND ${MINE}`, [tenantId, userId, start, end, agent]);
  const { rows: [r] } = await sharedPool.query(
    `WITH replies AS (
       SELECT i.id, (SELECT min(o.created_at) FROM crm_communication_events o WHERE o.tenant_id = $1 AND o.lead_id = i.lead_id AND o.direction = 'outbound'
                       AND o.channel IN ('whatsapp', 'sms') AND o.owner_user_id = $2 AND o.created_at > i.created_at) AS replied_at, i.created_at
         FROM crm_communication_events i
        WHERE i.tenant_id = $1 AND i.direction = 'inbound' AND i.channel IN ('whatsapp', 'sms') AND i.created_at >= $3 AND i.created_at < $4)
     SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM replied_at - created_at) / 60))::int AS median_reply_min,
            count(replied_at)::int AS replied
       FROM replies WHERE replied_at IS NOT NULL AND replied_at < $4`, [tenantId, userId, start, end]);
  const { rows: [ret] } = await sharedPool.query(
    `SELECT count(DISTINCT m.lead_id)::int AS n FROM crm_communication_events m
      WHERE m.tenant_id = $1 AND m.channel = 'call' AND m.direction = 'inbound' AND m.status = 'missed' AND m.created_at > $3::timestamptz - interval '7 days' AND m.created_at < $4
        AND EXISTS (SELECT 1 FROM crm_communication_events o WHERE o.tenant_id = $1 AND o.lead_id = m.lead_id AND o.direction = 'outbound'
                      AND o.created_at > m.created_at AND o.created_at >= $3 AND o.created_at < $4 AND (o.owner_user_id = $2 OR ($5::text IS NOT NULL AND o.metadata->>'agent_user' = $5::text)))`,
    [tenantId, userId, start, end, agent]);
  const { rows: [t] } = await sharedPool.query(
    `SELECT count(*) FILTER (WHERE completed_at >= $3 AND completed_at < $4)::int AS tasks_done,
            count(*) FILTER (WHERE completed_at IS NULL AND scheduled_at < now())::int AS tasks_overdue
       FROM crm_activities WHERE tenant_uid = $1 AND type = 'task' AND COALESCE(assigned_to, created_by) = $2`, [tenantUid, userId, start, end]);
  const { rows: spans } = await sharedPool.query(
    `SELECT status, greatest(started_at, $3) AS s, least(COALESCE(ended_at, now()), $4) AS e FROM crm_agent_status_log
      WHERE tenant_id = $1 AND user_id = $2 AND started_at < $4 AND COALESCE(ended_at, now()) > $3`, [tenantId, userId, start, end]);
  const minutes = (st) => Math.round(spans.filter((x) => x.status === st).reduce((n, x) => n + Math.max(0, new Date(x.e) - new Date(x.s)), 0) / 60000);
  return { day, ...s, missed_returned: ret.n, median_reply_min: r.median_reply_min, replies: r.replied, ...t,
    available_minutes: minutes('available'), break_minutes: minutes('break') };
}

/** Managers: every agent's status and day, for the call centre's Team panel. */
export async function teamToday(user, { date } = {}) {
  if (!canReassign(user)) throw fail(403, 'Only a Business Head, Marketing Head or administrator can see the team.');
  const tenantId = Number(user.tenantId);
  const { rows: people } = await sharedPool.query(
    `SELECT id, ${NAME('users')} AS name, email, COALESCE(metadata->>'crmRole', 'sales_rep') AS role, metadata->>'telecmi_user_id' AS agent
       FROM users WHERE tenant_id = $1 AND status = 'active'
        AND (COALESCE(metadata->>'crmRole', '') IN ('telecaller', 'conversion') OR metadata->>'telecmi_user_id' IS NOT NULL)
      ORDER BY 2 NULLS LAST`, [tenantId]);
  return Promise.all(people.map(async (p) => ({ id: p.id, name: p.name || p.email, role: p.role, linked: Boolean(p.agent),
    status: await currentStatus(tenantId, p.id), day: await agentDay(tenantId, user.tenantUid, p.id, { date }) })));
}

// ── Scripts and quick answers ────────────────────────────────────────────────────────────────────
const STARTER_SCRIPTS = [
  ['Calls', 'Answering an incoming call', 'Good [morning / afternoon], Medstar Hospitals, this is [your name]. How may I help you today?\n\n1. Get the caller\'s name and confirm their mobile number.\n2. Ask who the appointment or question is for, and what the concern is.\n3. Check the patient panel: are they an existing patient, and who is looking after them?\n4. Book, answer, or set a follow-up before you end the call.'],
  ['Calls', 'Returning a missed call', 'Hello, this is [your name] from Medstar Hospitals. We missed a call from this number a little while ago and wanted to make sure we help you. Is this a good time to talk?\n\nIf they do not answer: send the WhatsApp acknowledgement from the Inbox and try again within two hours.'],
  ['Appointments', 'Booking an appointment', 'Confirm before you book:\n• Patient name, age and mobile\n• Department or doctor, and the reason for the visit\n• Preferred day and time\n• First visit or follow-up; any previous reports to bring\n\nThen use "Book appointment" in the Inbox so the patient gets the WhatsApp confirmation and the journey moves to Appointment booked.'],
  ['Referrals', 'Calling a patient referred by a doctor', 'Hello [patient name], this is [your name] from Medstar Hospitals. Dr [doctor name] has asked us to help you with [need]. When would be a good time for you to come in?\n\nBook the appointment in the call where you can, and leave a follow-up task if they need time to decide.'],
  ['Calls', 'Ending every call', 'Before you hang up, make sure the patient has a next step: an appointment, a callback time, or the information they asked for. Summarise it back to them, and record it as a task or a note in the Inbox.'],
];
async function ensureStarters(tenantId) {
  const { rows: [c] } = await sharedPool.query(`SELECT count(*)::int AS n FROM crm_quick_answers WHERE tenant_id = $1`, [tenantId]);
  if (c.n) return;
  for (const [i, [category, title, body]] of STARTER_SCRIPTS.entries()) {
    await sharedPool.query(`INSERT INTO crm_quick_answers (tenant_id, kind, category, title, body, sort) VALUES ($1, 'script', $2, $3, $4, $5)`, [tenantId, category, title, body, i]);
  }
}
export async function listQuickAnswers(user, { q = '', kind = '' } = {}) {
  const tenantId = Number(user.tenantId);
  await ensureStarters(tenantId);
  const manager = canReassign(user);
  const params = [tenantId];
  let where = 'tenant_id = $1';
  if (!manager) where += ' AND active';
  if (['script', 'answer'].includes(kind)) { params.push(kind); where += ` AND kind = $${params.length}`; }
  if (clean(q)) { params.push(`%${clean(q, 100)}%`); where += ` AND (title ILIKE $${params.length} OR body ILIKE $${params.length} OR category ILIKE $${params.length})`; }
  const { rows } = await sharedPool.query(
    `SELECT id, kind, category, title, body, sort, active, uses, updated_at FROM crm_quick_answers WHERE ${where} ORDER BY kind DESC, category, sort, title`, params);
  return { items: rows, manager };
}
export async function saveQuickAnswer(user, input = {}, id = null) {
  if (!canReassign(user)) throw fail(403, 'Only a Business Head, Marketing Head or administrator can edit scripts and answers.');
  const tenantId = Number(user.tenantId);
  const v = { kind: input.kind === 'script' ? 'script' : 'answer', category: clean(input.category, 60) || 'General', title: clean(input.title, 150), body: clean(input.body, 4000),
    sort: Number.isInteger(Number(input.sort)) ? Number(input.sort) : 0, active: input.active === undefined ? true : Boolean(input.active) };
  if (!v.title) throw fail(400, 'Give it a title');
  if (!v.body) throw fail(400, 'Write the answer or script');
  if (id) {
    const { rows: [r] } = await sharedPool.query(
      `UPDATE crm_quick_answers SET kind=$1, category=$2, title=$3, body=$4, sort=$5, active=$6, updated_by=$7, updated_at=now() WHERE id=$8 AND tenant_id=$9 RETURNING *`,
      [v.kind, v.category, v.title, v.body, v.sort, v.active, Number(user.id), positive(id), tenantId]);
    if (!r) throw fail(404, 'Not found');
    return r;
  }
  const { rows: [r] } = await sharedPool.query(
    `INSERT INTO crm_quick_answers (tenant_id, kind, category, title, body, sort, active, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
    [tenantId, v.kind, v.category, v.title, v.body, v.sort, v.active, Number(user.id)]);
  return r;
}
export async function deleteQuickAnswer(user, id) {
  if (!canReassign(user)) throw fail(403, 'Only a Business Head, Marketing Head or administrator can edit scripts and answers.');
  const { rowCount } = await sharedPool.query(`DELETE FROM crm_quick_answers WHERE id = $1 AND tenant_id = $2`, [positive(id), Number(user.tenantId)]);
  if (!rowCount) throw fail(404, 'Not found');
  return { deleted: true };
}
export async function quickAnswerUsed(user, id) {
  await sharedPool.query(`UPDATE crm_quick_answers SET uses = uses + 1 WHERE id = $1 AND tenant_id = $2`, [positive(id), Number(user.tenantId)]);
  return { ok: true };
}

/** Done / not done / new due time on any task in the queue, including field follow-ups on a doctor's contact
 * record (no patient lead). A field executive can only change their own tasks or tasks on their own leads. */
export async function updateQueueTask(user, taskId, { done, dueAt } = {}) {
  const id = positive(taskId);
  const { rows: [t] } = await sharedPool.query(
    `SELECT a.id, a.lead_id, COALESCE(a.assigned_to, a.created_by) AS owner_id, l.assigned_to AS lead_owner
       FROM crm_activities a LEFT JOIN crm_leads l ON l.id = a.lead_id WHERE a.id = $1 AND a.type = 'task' AND a.tenant_uid = $2`, [id, user.tenantUid]);
  if (!t) throw fail(404, 'Task not found');
  if (ownScope(user) && Number(t.owner_id) !== Number(user.id) && Number(t.lead_owner) !== Number(user.id)) throw fail(404, 'Task not found');
  const sets = [], params = [];
  if (done !== undefined) { params.push(Boolean(done)); sets.push(`completed_at = CASE WHEN $${params.length}::boolean THEN COALESCE(completed_at, now()) ELSE NULL END`); }
  if (dueAt !== undefined) {
    const d = new Date(dueAt);
    if (Number.isNaN(d.getTime())) throw fail(400, 'Choose a valid date and time');
    params.push(d); sets.push(`scheduled_at = $${params.length}`);
  }
  if (!sets.length) throw fail(400, 'Nothing to change');
  params.push(id);
  await sharedPool.query(`UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  if (t.lead_id) {
    // Keep the lead's next step (Leads page, Inbox queue) in line with its earliest open task.
    const { rows: [next] } = await sharedPool.query(
      `SELECT title, scheduled_at FROM crm_activities WHERE lead_id = $1 AND tenant_uid = $2 AND type = 'task' AND completed_at IS NULL ORDER BY scheduled_at NULLS LAST, id LIMIT 1`, [t.lead_id, user.tenantUid]);
    await sharedPool.query(`UPDATE crm_leads_v2 SET next_action = $1, next_action_at = $2, updated_at = now() WHERE tenant_id = $3 AND legacy_lead_id = $4`,
      [next?.title || null, next?.scheduled_at || null, Number(user.tenantId), t.lead_id]);
    await sharedPool.query(`UPDATE crm_leads SET next_followup = $1 WHERE id = $2`, [next?.scheduled_at || null, t.lead_id]).catch(() => {});
  }
  return { id, done: done === undefined ? undefined : Boolean(done) };
}
