/** Post-deploy smoke test for the Medstar CRM. Run via /mnt/medstar/smoke.sh (throwaway api container).
 * Signs a 5-minute access token for the tenant's admin (same technique as installations/crm/smoke.mjs),
 * exercises read screens, write paths with cleanup, security boundaries and today's features.
 * Sends nothing to patients: the only provider call is Gupshup's read-only status/template list. */
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import pool from '../../db/pgPool.js';

const T = 70, UID = 'H98VG4';
const RUN_START = new Date();
const results = [];
const check = (group, name, passed, detail = '') => results.push({ group, name, passed: Boolean(passed), detail: String(detail).slice(0, 140) });

function call(path, { token, method = 'GET', body, host = 'medstar.mediqzy.com', headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = request('http://api:8888' + path, { method, headers: { Host: host, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers } }, (res) => {
      let text = ''; res.on('data', (c) => (text += c));
      res.on('end', () => { let data = null; try { data = JSON.parse(text); } catch { data = text; } resolve({ status: res.statusCode, data }); });
    });
    req.on('error', (e) => resolve({ status: 0, data: { message: e.message } }));
    req.setTimeout(20000, () => req.destroy(Error('timeout')));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const msg = (r) => (r.data && typeof r.data === 'object' ? r.data.code || r.data.message || '' : '');

const { rows: [admin] } = await pool.query(
  `SELECT id, role, metadata FROM users WHERE tenant_id=$1 AND status='active' ORDER BY "isAdmin" DESC, id LIMIT 1`, [T]);
const token = jwt.sign({ id: admin.id, role: admin.role, isCRM: true, userType: 'crm', tenantId: T, crmRole: admin.metadata?.crmRole || 'admin', tokenType: 'access', jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: 300 });
const as = (path, opts = {}) => call(path, { token, ...opts });

// 1. Health and session
let r = await call('/health/ready'); check('health', 'dependencies ready', r.status === 200 && r.data.tenantUid === UID, r.status);
r = await as('/api/crm/profile'); check('health', 'admin session accepted', r.status === 200, r.status);

// 2. Every read screen from the audit sweep (expected disabled ones must stay disabled, not error)
const EXPECTED = {
  '/crm/worldclass/communications/timeline': [400],
  '/crm/brightbean-chat/inbox/reminders': [404], '/crm/brightbean-chat/inbox/rules': [404], '/crm/brightbean-chat/whatsapp/templates': [404],
  '/crm/flows': [404], '/crm/social/identities': [404], '/crm/social/posts': [404], '/crm/social/triggers': [404],
};
// Every read call the CRM screens make (from the 2026-11-15 audit of the frontend router).
const gets = ["/crm/activities", "/crm/ai/agent/memory", "/crm/ai/hub", "/crm/ai/marketing/context", "/crm/auth/verify", "/crm/automations", "/crm/automations/assignable-users", "/crm/brightbean-chat/inbox/reminders", "/crm/brightbean-chat/inbox/rules", "/crm/brightbean-chat/whatsapp/templates", "/crm/campaigns/campaigns", "/crm/campaigns/lists", "/crm/campaigns/senders", "/crm/campaigns/suppressions", "/crm/campaigns/templates", "/crm/communication-hub/calls", "/crm/communication-hub/dashboard", "/crm/communication-hub/integrations", "/crm/communication-hub/log", "/crm/contacts", "/crm/dashboard/stats", "/crm/deals", "/crm/deals/pipeline", "/crm/emails/inbox", "/crm/emails/settings", "/crm/emails/stats", "/crm/emails/templates", "/crm/flows", "/crm/funnel-analytics", "/crm/growth/dashboard", "/crm/growth/diagnostic/dashboard", "/crm/growth/digital/overview", "/crm/growth/digital/referrals", "/crm/growth/journeys", "/crm/growth/landing-pages", "/crm/growth/recovery/queue", "/crm/growth/scoring/rules", "/crm/growth/specialties", "/crm/leads", "/crm/profile", "/crm/reports/revenue", "/crm/reports/sales-funnel", "/crm/reports/team-performance", "/crm/segments", "/crm/social/identities", "/crm/social/posts", "/crm/social/triggers", "/crm/team/users", "/crm/v2/duplicates", "/crm/v2/funnel", "/crm/worldclass/audit-log", "/crm/worldclass/communications/timeline", "/crm/worldclass/dashboards/business-head", "/crm/worldclass/dashboards/business-head/team", "/crm/worldclass/dashboards/marketing-head", "/crm/worldclass/data-quality/issues", "/crm/worldclass/integrations/errors", "/crm/worldclass/sla/queue"];
for (const p of gets) {
  r = await as('/api' + p);
  const want = EXPECTED[p] || [200];
  check('screens', p, want.includes(r.status), `${r.status} ${want[0] !== 200 ? msg(r) : ''}`);
}

// 3. Write paths with cleanup
const stamp = randomUUID().slice(0, 8);
r = await as('/api/crm/leads', { method: 'POST', body: { name: 'Smoke QA ' + stamp, email: `smoke-${stamp}@example.invalid`, source: 'manual', status: 'new' } });
check('writes', 'create lead (Leads page)', r.status === 201, r.status);
const leadId = r.data?.data?.id;
if (leadId) {
  r = await as('/api/crm/leads/' + leadId); check('writes', 'read lead', r.status === 200, r.status);
  r = await as('/api/crm/contacts?search=' + encodeURIComponent('smoke-' + stamp));
  check('contacts', 'new lead auto-captured as a contact', r.status === 200 && (r.data?.data || []).some((c) => String(c.lead_id) === String(leadId)), r.status);
  r = await as('/api/crm/leads/' + leadId, { method: 'DELETE' }); check('writes', 'delete lead', r.status === 200, r.status);
  await new Promise((done) => setTimeout(done, 300)); // v2 removal runs after the response
  r = await as('/api/crm/contacts?search=' + encodeURIComponent('smoke-' + stamp));
  check('contacts', 'auto-captured contact removed with its lead', r.status === 200 && !(r.data?.data || []).some((c) => String(c.lead_id) === String(leadId)), r.status);
}
r = await as('/api/crm/contacts', { method: 'POST', body: { name: 'Smoke QA ' + stamp, email: `smoke-c-${stamp}@example.invalid` } });
check('writes', 'create contact', r.status === 201, r.status);
const contactId = r.data?.data?.id;
if (contactId) { r = await as('/api/crm/contacts/' + contactId, { method: 'DELETE' }); check('writes', 'delete contact', r.status === 200, r.status); }

// v2 lead must also appear on the Leads page (fix 1) — then clean up both rows
r = await as('/api/crm/v2/leads', { method: 'POST', body: { tenantId: T, name: 'Smoke V2 ' + stamp, phone: '+91000000' + stamp.replace(/\D/g, '').padEnd(4, '0').slice(0, 4), source: 'smoke' } });
const v2 = r.data?.data;
check('writes', 'create v2 lead', (r.status === 201 || r.status === 200) && v2?.id, `${r.status} ${msg(r)}`);
if (v2?.id) {
  check('writes', 'v2 lead linked to Leads-page row', Boolean(v2.legacy_lead_id), v2.legacy_lead_id);
  const list = await as('/api/crm/leads?search=' + encodeURIComponent('Smoke V2 ' + stamp));
  check('writes', 'v2 lead visible on Leads page', list.status === 200 && (list.data?.data || []).some((l) => String(l.id) === String(v2.legacy_lead_id)), list.status);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM crm_funnel_events WHERE tenant_id=$1 AND lead_id=$2', [T, v2.id]);
    await c.query('DELETE FROM crm_leads_v2 WHERE tenant_id=$1 AND id=$2', [T, v2.id]);
    await c.query('DELETE FROM crm_identity_keys WHERE tenant_id=$1 AND person_id=$2', [T, v2.person_id]);
    await c.query('DELETE FROM crm_person_identities WHERE tenant_id=$1 AND id=$2', [T, v2.person_id]);
    if (v2.legacy_lead_id) await c.query('DELETE FROM crm_contacts WHERE lead_id=$1', [v2.legacy_lead_id]);
    if (v2.legacy_lead_id) await c.query('DELETE FROM crm_leads WHERE id=$1', [v2.legacy_lead_id]);
    await c.query('COMMIT'); check('writes', 'v2 test data removed', true);
  } catch (e) { await c.query('ROLLBACK'); check('writes', 'v2 test data removed', false, e.message); } finally { c.release(); }
}

// 4. Security boundaries
r = await as('/api/crm/profile', { host: 'wrong.example' }); check('security', 'wrong host rejected (421)', r.status === 421, r.status);
r = await as('/api/crm/profile', { headers: { 'X-Tenant-ID': '999' } }); check('security', 'tenant override rejected (403)', r.status === 403, r.status);
r = await as('/api/admin/users'); check('security', 'shared admin API not mounted (404)', r.status === 404, r.status);
r = await call('/api/crm/profile'); check('security', 'no session rejected (401)', r.status === 401, r.status);
const forged = jwt.sign({ id: admin.id, isCRM: true, tokenType: 'access' }, 'not-this-installation', { expiresIn: 60 });
r = await call('/api/crm/profile', { token: forged }); check('security', 'foreign signing key rejected (401)', r.status === 401, r.status);
r = await call('/api/channel-webhooks/whatsapp/not-the-token', { method: 'POST', body: {} }); check('security', 'webhook rejects wrong token', r.status === 404 || r.status === 401 || r.status === 403, r.status);

// 5. Today's features
r = await as('/api/crm/ui-config');
check('features', 'ui-config lists switched-off screens', r.status === 200 && ['/crm/agent', '/crm/flow-builder', '/crm/social-growth'].every((p) => r.data.data.disabledPaths.includes(p)) && !r.data.data.disabledPaths.includes('/crm/field-force'), r.status === 200 ? r.data.data.disabledPaths.join(' ') : r.status);
check('features', 'ui-config reports outbound on', r.data?.data?.outboundEnabled === true, r.data?.data?.outboundEnabled);
r = await as('/api/crm/communication-hub/integrations');
const wa = (r.data?.data || []).find((x) => x.channel === 'whatsapp');
check('features', 'WhatsApp channel reports live', wa?.deliveryMode === 'live' && wa?.deliveryActive === true, wa ? `${wa.deliveryMode} | ${wa.healthMessage}` : r.status);
r = await as('/api/crm/whatsapp/status');
check('features', 'Gupshup status (live API)', r.status === 200, r.status === 200 ? `subscription active=${r.data?.data?.subscription?.active ?? JSON.stringify(r.data?.data?.subscription).slice(0, 60)}` : msg(r));
r = await as('/api/crm/whatsapp/languages'); check('features', 'template languages', r.status === 200, r.status);
r = await as('/api/crm/whatsapp/templates');
const tpl = r.data?.data || [];
check('features', 'templates synced from Gupshup', r.status === 200 && tpl.length >= 18, `${r.status} count=${tpl.length} statuses=${[...new Set(tpl.map((t) => t.status))].join(',')}`);
r = await as('/api/crm/whatsapp/events'); check('features', 'channel event log', r.status === 200, r.status);
r = await as('/api/crm/whatsapp/templates/lint', { method: 'POST', body: { body: '{{1}} starts with a variable', category: 'UTILITY' } });
check('features', 'template lint catches Meta rule', r.status === 200 && (r.data?.data?.errors || []).length > 0, r.status);

// 5b. WhatsApp inbox: a simulated inbound message from a fake number through the live webhook,
// then list/thread/read/status/assign and the 24-hour rule. Nothing is sent to WhatsApp.
{
  const { getTenantGupshupConfig } = await import('../../services/crm-whatsapp-inbound.service.js');
  const cfg = await getTenantGupshupConfig(T).catch(() => null);
  const hookToken = process.env.CRM_WHATSAPP_WEBHOOK_TOKEN;
  const fakeFrom = '915550' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  const msgId = 'smoke-' + randomUUID();
  let convo = null;
  try {
    r = await call('/api/channel-webhooks/whatsapp/' + hookToken, { method: 'POST', body: { app: cfg?.appName, version: 2, type: 'message', timestamp: Date.now(),
      payload: { id: msgId, source: fakeFrom, type: 'text', payload: { text: 'Smoke test: is the inbox working?' }, sender: { phone: fakeFrom } } } });
    check('inbox', 'inbound webhook accepted', r.status === 200, r.status);
    let row = (await pool.query(`SELECT l.id, l.name, c.id AS contact_id, c.name AS contact_name FROM crm_leads l LEFT JOIN crm_contacts c ON c.lead_id = l.id
      WHERE right(regexp_replace(COALESCE(l.phone,''), '[^0-9]', '', 'g'), 10) = $1`, [fakeFrom.slice(-10)])).rows[0];
    check('contacts', 'WhatsApp sender auto-captured as a contact', Boolean(row?.contact_id), row ? `${row.name} / ${row.contact_name}` : 'no lead');
    r = await call('/api/channel-webhooks/whatsapp/' + hookToken, { method: 'POST', body: { app: cfg?.appName, version: 2, type: 'message', timestamp: Date.now(),
      payload: { id: msgId + '-2', source: fakeFrom, type: 'text', payload: { text: 'This is my name now' }, sender: { phone: fakeFrom, name: 'Smoke Inbox ' + stamp } } } });
    row = (await pool.query(`SELECT l.name, c.name AS contact_name FROM crm_leads l LEFT JOIN crm_contacts c ON c.lead_id = l.id
      WHERE right(regexp_replace(COALESCE(l.phone,''), '[^0-9]', '', 'g'), 10) = $1`, [fakeFrom.slice(-10)])).rows[0];
    check('contacts', 'WhatsApp profile name replaces the placeholder (lead and contact)', row?.name === 'Smoke Inbox ' + stamp && row?.contact_name === 'Smoke Inbox ' + stamp, row ? `${row.name} / ${row.contact_name}` : '');
    r = await as('/api/crm/whatsapp/inbox?status=open&search=' + fakeFrom);
    convo = (r.data?.data?.conversations || []).find((c) => String(c.phone).endsWith(fakeFrom.slice(-10)));
    check('inbox', 'conversation listed, unread', r.status === 200 && convo && convo.unread === 2, `${r.status} unread=${convo?.unread}`);
    check('inbox', 'reply window open after inbound', convo?.window?.open === true);
    check('inbox', 'linked to a lead', Boolean(convo?.legacy_lead_id), convo?.legacy_lead_id);
    if (convo) {
      r = await as(`/api/crm/whatsapp/inbox/${convo.id}`);
      check('inbox', 'thread shows the message', r.status === 200 && (r.data?.data?.messages || []).some((m) => m.direction === 'inbound' && /the inbox working/.test(m.body)), r.status);
      r = await as('/api/crm/whatsapp/inbox?status=open&search=' + fakeFrom);
      check('inbox', 'opening marks it read', (r.data?.data?.conversations || [])[0]?.unread === 0);
      // Unified (all-channel) inbox over the same lead
      const v2Id = convo.lead_id;
      r = await as('/api/crm/inbox?status=all&search=' + fakeFrom);
      const u = (r.data?.data?.conversations || [])[0];
      check('unified inbox', 'lead listed with its WhatsApp channel', r.status === 200 && u && u.channels.includes('whatsapp') && String(u.lead_id) === String(v2Id), r.status);
      r = await as('/api/crm/inbox/summary'); check('unified inbox', 'summary counts', r.status === 200 && typeof r.data?.data?.unread === 'number', r.status);
      r = await as(`/api/crm/inbox/by-legacy/${convo.legacy_lead_id}`); check('unified inbox', 'Leads-page deep link resolves', String(r.data?.data?.lead_id) === String(v2Id), r.status);
      r = await as(`/api/crm/inbox/${v2Id}/send`, { method: 'POST', body: { channel: 'note', text: 'Smoke internal note' } });
      check('unified inbox', 'internal note added', r.status === 200, `${r.status} ${msg(r)}`);
      r = await as(`/api/crm/inbox/${v2Id}`);
      const ev = r.data?.data?.events || [];
      check('unified inbox', 'timeline merges messages and notes', ev.some((e) => e.channel === 'whatsapp' && e.direction === 'inbound') && ev.some((e) => e.channel === 'note' && /Smoke internal note/.test(e.body)), `${ev.length} events`);
      r = await as(`/api/crm/inbox/${v2Id}/send`, { method: 'POST', body: { channel: 'sms', text: 'x' } });
      check('unified inbox', 'unconnected channel refused clearly', r.status === 409, `${r.status} ${msg(r)}`);
      r = await as(`/api/crm/inbox/${v2Id}/contact`, { method: 'PATCH', body: { name: 'Smoke Edited ' + stamp, email: `smoke-edit-${stamp}@example.invalid` } });
      check('contacts', 'contact edit from inbox saved', r.status === 200 && (r.data?.data?.changed || []).includes('email'), `${r.status} ${msg(r)}`);
      row = (await pool.query(`SELECT l.name, l.email, c.name AS contact_name, c.email AS contact_email, cv.name AS v2_name FROM crm_leads l
        LEFT JOIN crm_contacts c ON c.lead_id = l.id LEFT JOIN crm_leads_v2 lv ON lv.legacy_lead_id = l.id LEFT JOIN crm_contacts_v2 cv ON cv.id = lv.contact_id WHERE l.id = $1`, [convo.legacy_lead_id])).rows[0];
      check('contacts', 'edit reaches lead, contact and patient profile', row?.name === 'Smoke Edited ' + stamp && row?.contact_email === `smoke-edit-${stamp}@example.invalid` && row?.v2_name === 'Smoke Edited ' + stamp, JSON.stringify(row));
      r = await as(`/api/crm/inbox/${v2Id}/contact`, { method: 'PATCH', body: { email: 'not-an-email' } });
      check('contacts', 'invalid email refused', r.status === 400, r.status);
      r = await as(`/api/crm/whatsapp/inbox/${convo.id}/send`, { method: 'POST', body: { text: '' } });
      check('inbox', 'empty reply refused', r.status === 400, r.status);
      await pool.query(`UPDATE crm_communication_events SET created_at = now() - interval '25 hours' WHERE tenant_id=$1 AND conversation_id=$2`, [T, convo.id]);
      r = await as(`/api/crm/whatsapp/inbox/${convo.id}/send`, { method: 'POST', body: { text: 'should not send' } });
      check('inbox', 'free text refused after 24h (no provider call)', r.status === 409, `${r.status} ${msg(r)}`);
      r = await as(`/api/crm/whatsapp/inbox/${convo.id}/assign`, { method: 'PATCH', body: { userId: 'me' } });
      check('inbox', 'assign to me', r.status === 200 && Number(r.data?.data?.assigned_to_user_id) === Number(admin.id), r.status);
      r = await as(`/api/crm/whatsapp/inbox/${convo.id}/status`, { method: 'PATCH', body: { status: 'closed' } });
      check('inbox', 'close conversation', r.status === 200, r.status);
      r = await as('/api/crm/whatsapp/inbox?status=closed&search=' + fakeFrom);
      check('inbox', 'appears under Closed', (r.data?.data?.conversations || []).some((c) => c.id === convo.id));
    }
  } finally {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows: leads } = await c.query(
        `SELECT lv.id, lv.legacy_lead_id, lv.person_id, lv.contact_id FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id
          WHERE lv.tenant_id=$1 AND right(regexp_replace(COALESCE(l.phone,''), '[^0-9]', '', 'g'), 10) = $2`, [T, fakeFrom.slice(-10)]);
      for (const lv of leads) {
        await c.query('DELETE FROM crm_communication_events WHERE tenant_id=$1 AND lead_id=$2', [T, lv.id]);
        await c.query('DELETE FROM crm_conversations WHERE tenant_id=$1 AND lead_id=$2', [T, lv.id]);
        await c.query('DELETE FROM crm_funnel_events WHERE tenant_id=$1 AND lead_id=$2', [T, lv.id]);
        await c.query('DELETE FROM crm_leads_v2 WHERE tenant_id=$1 AND id=$2', [T, lv.id]);
        if (lv.contact_id) {
          await c.query('SAVEPOINT contact');
          await c.query('DELETE FROM crm_contacts_v2 WHERE tenant_id=$1 AND id=$2', [T, lv.contact_id]).catch(() => c.query('ROLLBACK TO SAVEPOINT contact'));
        }
        if (lv.person_id) {
          await c.query('DELETE FROM crm_identity_keys WHERE tenant_id=$1 AND person_id=$2', [T, lv.person_id]);
          await c.query('DELETE FROM crm_person_identities WHERE tenant_id=$1 AND id=$2', [T, lv.person_id]);
        }
        await c.query('DELETE FROM crm_activities WHERE lead_id=$1', [lv.legacy_lead_id]);
        await c.query('DELETE FROM crm_contacts WHERE lead_id=$1', [lv.legacy_lead_id]);
        await c.query('DELETE FROM crm_leads WHERE id=$1', [lv.legacy_lead_id]);
      }
      await c.query('COMMIT');
      check('inbox', 'test conversation and lead removed', leads.length === 1, `removed=${leads.length}`);
    } catch (e) { await c.query('ROLLBACK'); check('inbox', 'test conversation and lead removed', false, e.message); } finally { c.release(); }
  }
}

// 5c. TeleCMI calls: simulated CDR webhooks (doc.telecmi.com/chub/docs payload shapes) from a fake
// number. Nothing is dialled; the lead, contact and call records are removed afterwards.
{
  const token = process.env.VOICE_TELECMI_WEBHOOK_TOKEN;
  const caller = '915551' + String(Math.floor(Math.random() * 1e5)).padStart(5, '0') + '9';
  const conv = 'smoke-' + randomUUID();
  const callId = 'smoke-call-' + randomUUID();
  const hook = (body) => call('/api/voice-webhooks/telecmi/' + token, { method: 'POST', body });
  let legacyId = null;
  try {
    r = await hook({ type: 'cdr', direction: 'inbound', status: 'missed', from: Number(caller), virtual_number: 919093188188, cmiuuid: conv, conversation_uuid: conv,
      time: Date.now() - 60000, waitedsec: 14, hangup_reason: 'recv_cancel', appid: 1, ivr_name: 'main' });
    check('calls', 'missed-call CDR accepted', r.status === 200, r.status);
    const lead = (await pool.query(`SELECT l.id, l.name, l.source, c.id AS contact_id, lv.id AS v2 FROM crm_leads l JOIN crm_leads_v2 lv ON lv.legacy_lead_id = l.id
      LEFT JOIN crm_contacts c ON c.lead_id = l.id WHERE right(regexp_replace(COALESCE(l.phone,''), '[^0-9]', '', 'g'), 10) = $1`, [caller.slice(-10)])).rows[0];
    legacyId = lead?.id;
    check('calls', 'unknown caller becomes a lead (source phone)', lead?.source === 'phone', lead ? `${lead.name}` : 'none');
    check('calls', 'caller captured as a contact', Boolean(lead?.contact_id));
    r = await as('/api/crm/inbox?status=open&search=' + caller.slice(-10));
    const row = (r.data?.data?.conversations || [])[0];
    check('calls', 'missed call is unread in the inbox', row && row.channels.includes('call') && row.unread >= 1, row ? `unread=${row.unread}` : r.status);
    // Outbound click2call: two legs sharing call_id, then a duplicate delivery; recording on leg b.
    const base = { type: 'cdr', direction: 'outbound', status: 'answered', to: Number(caller), call_id: callId, request_id: 'req-' + callId,
      extra_params: JSON.stringify({ lead_id: legacyId, crm_user_id: admin.id }), user: '101_1', time: Date.now(), hangup_reason: 'recv_bye' };
    await hook({ ...base, leg: 'a', cmiuuid: callId + '-a', answeredsec: 95 });
    await hook({ ...base, leg: 'b', cmiuuid: callId + '-b', answeredsec: 88, record: true, filename: 'smoke-recording.mp3' });
    await hook({ ...base, leg: 'b', cmiuuid: callId + '-b', answeredsec: 88, record: true, filename: 'smoke-recording.mp3' });
    const evs = (await pool.query(`SELECT status, metadata FROM crm_communication_events WHERE provider = 'telecmi' AND provider_message_id = $1`, [callId])).rows;
    check('calls', 'two legs + duplicate merge into one call', evs.length === 1, `rows=${evs.length}`);
    check('calls', 'merged call keeps longest duration and the recording', evs[0]?.metadata?.answered_sec === 95 && evs[0]?.metadata?.recording === 'smoke-recording.mp3', JSON.stringify(evs[0]?.metadata || {}).slice(0, 120));
    r = await as(`/api/crm/inbox/${lead.v2}`);
    const callsInThread = (r.data?.data?.events || []).filter((e) => e.channel === 'call');
    check('calls', 'timeline shows both calls, recording flagged', callsInThread.length === 2 && callsInThread.some((e) => e.meta?.recording === true), `calls=${callsInThread.length}`);
    r = await as(`/api/crm/leads/${legacyId}/context`);
    check('calls', 'lead drawer Calls tab lists TeleCMI calls', (r.data?.data?.calls || []).filter((c) => String(c.id).startsWith('evt-')).length === 2, r.status);
    r = await as('/api/crm/inbox/telephony');
    const tel = r.data?.data;
    check('calls', 'telephony status explains readiness', r.status === 200 && typeof tel?.canCall === 'boolean' && (tel.canCall || Boolean(tel.reason)), tel ? `canCall=${tel.canCall} ${tel.reason || ''}` : r.status);
    if (tel && !tel.canCall) {
      r = await as(`/api/crm/inbox/${lead.v2}/call`, { method: 'POST', body: {} });
      check('calls', 'click-to-call refused with the reason (nothing dialled)', r.status === 409 && msg(r) === tel.reason, `${r.status} ${msg(r)}`);
    }
    r = await call('/api/voice-webhooks/telecmi/wrong-token', { method: 'POST', body: { type: 'cdr' } });
    check('calls', 'webhook rejects wrong token', r.status === 404, r.status);
  } finally {
    if (legacyId) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const { rows: [lv] } = await c.query('SELECT id, contact_id, person_id FROM crm_leads_v2 WHERE legacy_lead_id = $1', [legacyId]);
        await c.query('DELETE FROM crm_communication_events WHERE lead_id = $1', [lv.id]);
        await c.query('DELETE FROM crm_conversations WHERE lead_id = $1', [lv.id]);
        await c.query('DELETE FROM crm_funnel_events WHERE lead_id = $1', [lv.id]);
        await c.query('DELETE FROM crm_leads_v2 WHERE id = $1', [lv.id]);
        await c.query('SAVEPOINT ct');
        await c.query('DELETE FROM crm_contacts_v2 WHERE id = $1', [lv.contact_id]).catch(() => c.query('ROLLBACK TO SAVEPOINT ct'));
        await c.query('DELETE FROM crm_identity_keys WHERE person_id = $1', [lv.person_id]);
        await c.query('DELETE FROM crm_person_identities WHERE id = $1', [lv.person_id]);
        await c.query('DELETE FROM crm_activities WHERE lead_id = $1', [legacyId]);
        await c.query('DELETE FROM crm_contacts WHERE lead_id = $1', [legacyId]);
        await c.query('DELETE FROM crm_leads WHERE id = $1', [legacyId]);
        await c.query('COMMIT');
        check('calls', 'test caller, lead and calls removed', true);
      } catch (e) { await c.query('ROLLBACK'); check('calls', 'test caller, lead and calls removed', false, e.message); } finally { c.release(); }
    }
  }
}

// 5d. Engage (templates, audiences, campaigns, automations) and Home. The test lead has an email but no
// mobile, and the campaign runner is restricted to the test campaign, so nothing can reach a patient.
{
  const tag = 'smokeeng' + stamp.replace(/\W/g, '').slice(0, 8);
  const made = { lead: null, tpl: null, auds: [], camp: null, auto: null };
  try {
    for (const [path, body] of [['/api/crm/campaigns/lists', { name: 'x' }], ['/api/crm/emails/templates', { name: 'x' }], ['/api/crm/growth/journeys', { name: 'x' }]]) {
      r = await as(path, { method: 'POST', body });
      check('engage', `retired write refused: ${path}`, r.status === 410 && r.data?.code === 'moved_to_engage', r.status);
    }
    r = await as('/api/crm/home?days=30');
    check('home', 'role-based home loads', r.status === 200 && r.data?.data?.scope && r.data?.data?.me && Array.isArray(r.data?.data?.reports), `${r.status} ${r.data?.data?.scope}`);
    check('home', 'drill-down reports listed', (r.data?.data?.reports || []).some((x) => x.path === '/crm/hospital/command-center'));
    r = await as('/api/crm/leads', { method: 'POST', body: { name: 'Smoke Engage ' + stamp, email: `smoke-eng-${stamp}@example.invalid`, source: tag, status: 'new' } });
    made.lead = r.data?.data?.id;
    const v2 = (await pool.query('SELECT id FROM crm_leads_v2 WHERE legacy_lead_id = $1', [made.lead])).rows[0]?.id;
    check('engage', 'test lead ready', Boolean(v2), r.status);
    r = await as('/api/crm/engage/templates', { method: 'POST', body: { channel: 'email', name: 'Smoke ' + stamp, subject: 'Hello {{lead.first_name}}', body: 'Hi {{lead.name}}, smoke test.' } });
    made.tpl = r.data?.data?.id;
    check('engage', 'email template saved (ready immediately)', r.status === 200 && made.tpl, `${r.status} ${msg(r)}`);
    r = await as('/api/crm/engage/templates', { method: 'POST', body: { channel: 'whatsapp', name: 'x', body: 'y' } });
    check('engage', 'WhatsApp templates kept on the reviewed path', r.status === 400, r.status);
    r = await as('/api/crm/engage/audiences/preview', { method: 'POST', body: { type: 'dynamic', conditions: [{ field: 'source', op: 'eq', value: tag }] } });
    check('engage', 'audience preview counts', r.data?.data?.total === 1 && r.data?.data?.with_email === 1, JSON.stringify(r.data?.data));
    r = await as('/api/crm/engage/audiences', { method: 'POST', body: { name: 'Smoke rules ' + stamp, type: 'dynamic', conditions: [{ field: 'source', op: 'eq', value: tag }] } });
    if (r.data?.data?.id) made.auds.push(r.data.data.id);
    check('engage', 'rule-based audience saved with members', r.data?.data?.member_count === 1, `${r.status} ${msg(r)}`);
    r = await as('/api/crm/engage/audiences', { method: 'POST', body: { name: 'Smoke list ' + stamp, type: 'static', leadIds: [Number(v2)] } });
    if (r.data?.data?.id) made.auds.push(r.data.data.id);
    check('engage', 'static list saved', r.data?.data?.member_count === 1, `${r.status} ${msg(r)}`);
    const fam = (await pool.query(`SELECT metadata->>'family' AS f, (metadata->>'placeholders')::int AS n FROM crm_communication_templates WHERE tenant_id = $1 AND channel = 'whatsapp' AND status = 'approved' ORDER BY id LIMIT 1`, [T])).rows[0];
    r = await as('/api/crm/engage/campaigns', { method: 'POST', body: { name: 'Smoke campaign ' + stamp, channel: 'whatsapp', audienceId: made.auds[1], family: fam?.f, params: Array.from({ length: fam?.n || 0 }, () => '{{lead.first_name}}') } });
    made.camp = r.data?.data?.id;
    check('engage', 'WhatsApp campaign drafted on a template family', r.status === 200 && made.camp, `${r.status} ${msg(r)}`);
    r = await as(`/api/crm/engage/campaigns/${made.camp}/launch`, { method: 'POST', body: {} });
    check('engage', 'launch respects the bulk-sending switch', r.status === 200 && r.data?.data?.status === 'active' && (r.data.data.bulkEnabled || Boolean(r.data.data.note)), `${r.status} ${r.data?.data?.note || ''}`);
    const { runCampaignTick } = await import('../../services/crm-engage.service.js');
    const prev = process.env.CRM_BULK_SENDING_ENABLED;
    process.env.CRM_BULK_SENDING_ENABLED = 'true';
    try {
      const t1 = await runCampaignTick({ paceMs: 0, onlyIds: [made.camp] });
      check('engage', 'runner skips a patient without a mobile (nothing sent)', t1.skipped === 1 && t1.sent === 0, JSON.stringify(t1));
      await runCampaignTick({ paceMs: 0, onlyIds: [made.camp] });
    } finally { if (prev === undefined) delete process.env.CRM_BULK_SENDING_ENABLED; else process.env.CRM_BULK_SENDING_ENABLED = prev; }
    r = await as('/api/crm/engage/campaigns');
    const camp = (r.data?.data?.campaigns || []).find((c) => String(c.id) === String(made.camp));
    check('engage', 'campaign completes and reports progress', camp?.status === 'completed' && camp?.stats?.skipped === 1, camp ? `${camp.status} ${JSON.stringify(camp.stats)}` : 'missing');
    r = await as(`/api/crm/engage/campaigns/${made.camp}/recipients`);
    check('engage', 'recipient reason recorded', (r.data?.data || [])[0]?.reason === 'no mobile number', JSON.stringify((r.data?.data || [])[0] || {}));
    r = await as(`/api/crm/engage/audiences/${made.auds[1]}`, { method: 'DELETE' });
    check('engage', 'audience in use cannot be deleted… unless the campaign is finished', r.status === 200 || r.status === 409, r.status);
    if (r.status === 200) made.auds.pop();
    r = await as('/api/crm/engage/automations', { method: 'POST', body: { name: 'Smoke auto ' + stamp, triggerType: 'source_equals', triggerConfig: { source: tag }, delayMinutes: 0,
      actionType: 'send_message', actionConfig: { channel: 'whatsapp', family: fam?.f, params: Array.from({ length: fam?.n || 0 }, () => '{{lead.name}}') } } });
    made.auto = r.data?.data?.id;
    check('engage', 'automation saved with a WhatsApp template action', r.status === 200 && made.auto, `${r.status} ${msg(r)}`);
    r = await as(`/api/crm/engage/automations/${made.auto}/status`, { method: 'PATCH', body: { status: 'paused' } });
    check('engage', 'automation status change', r.status === 200, r.status);
    r = await as('/api/crm/ui-config');
    check('engage', 'ui-config points to Home and Engage', r.data?.data?.homeTool === '/crm-tools/home/' && r.data?.data?.engageTool === '/crm-tools/engage/');
  } finally {
    if (made.auto) await pool.query('DELETE FROM crm_automation_executions WHERE automation_id = $1', [made.auto]).catch(() => {});
    if (made.auto) await pool.query('DELETE FROM crm_automations WHERE id = $1', [made.auto]).catch(() => {});
    if (made.camp) await pool.query('DELETE FROM crm_campaigns_unified WHERE id = $1', [made.camp]).catch(() => {});
    for (const id of made.auds) await pool.query('DELETE FROM crm_segments WHERE id = $1', [id]).catch(() => {});
    if (made.tpl) await pool.query('DELETE FROM crm_communication_templates WHERE id = $1', [made.tpl]).catch(() => {});
    if (made.lead) await as('/api/crm/leads/' + made.lead, { method: 'DELETE' });
    await new Promise((done) => setTimeout(done, 300));
    const left = (await pool.query(`SELECT (SELECT count(*) FROM crm_segments WHERE name LIKE 'Smoke %') + (SELECT count(*) FROM crm_campaigns_unified WHERE name LIKE 'Smoke %')
      + (SELECT count(*) FROM crm_automations WHERE name LIKE 'Smoke %') + (SELECT count(*) FROM crm_communication_templates WHERE name LIKE 'Smoke %') AS n`)).rows[0].n;
    check('engage', 'test data removed', Number(left) === 0, `left=${left}`);
  }
}

// 5e. TeleCMI control: overview, routing, caller identification on the call-flow request, live events
// (screen pop) and log sync. Read-only against TeleCMI: no agent is created or removed.
{
  const token = process.env.VOICE_TELECMI_WEBHOOK_TOKEN;
  const num = '915552' + String(Math.floor(Math.random() * 1e5)).padStart(5, '0') + '7';
  const conv = 'smoke-live-' + randomUUID();
  let legacyId = null, savedRouting = null;
  try {
    r = await as('/api/crm/telephony/overview');
    const o = r.data?.data;
    check('telephony', 'overview (balance, agents, webhook health)', r.status === 200 && typeof o?.configured === 'boolean' && o.webhook, `${r.status} agents=${o?.agents} balance=${o?.balance?.amount}`);
    check('telephony', 'setup URLs shown to admins', Boolean(o?.urls?.flow) && o.urls.flow.includes('/api/voice-webhooks/telecmi-flow/'));
    r = await as('/api/crm/telephony/agents');
    check('telephony', 'agents listed without passwords', r.status === 200 && !JSON.stringify(r.data).includes('"password"'), r.status);
    r = await as('/api/crm/telephony/agents', { method: 'POST', body: { name: 'x', extension: 5, phone: '1', password: '1' } });
    check('telephony', 'invalid agent refused before reaching TeleCMI', r.status === 400, `${r.status} ${msg(r)}`);
    r = await as('/api/crm/telephony/routing'); savedRouting = r.data?.data;
    r = await as('/api/crm/telephony/routing', { method: 'PUT', body: { ownerFirst: true, rule: 'sequential', timeout: 30, loop: 2, fallback: { action: 'ivr', name: 'smoke@1' } } });
    check('telephony', 'routing saved', r.status === 200 && r.data?.data?.rule === 'sequential' && r.data?.data?.fallback?.name === 'smoke@1', r.status);
    r = await as('/api/crm/leads', { method: 'POST', body: { name: 'Smoke Caller ' + stamp, phone: '+' + num, source: 'manual', status: 'new' } });
    legacyId = r.data?.data?.id;
    r = await call('/api/voice-webhooks/telecmi-flow/' + token, { method: 'POST', body: { from: Number(num), to: 918031411719, cmiuuid: conv, appid: 1 } });
    check('telephony', 'call-flow answers TeleCMI', r.status === 200 && (Array.isArray(r.data?.result) || r.data?.action), JSON.stringify(r.data).slice(0, 120));
    r = await as('/api/crm/telephony/live');
    let lc = (r.data?.data || []).find((c) => c.id === conv);
    check('telephony', 'screen pop identifies the caller from the CRM', lc?.caller?.name === 'Smoke Caller ' + stamp && String(lc?.caller?.legacy_lead_id) === String(legacyId), lc ? JSON.stringify(lc.caller).slice(0, 120) : 'missing');
    await call('/api/voice-webhooks/telecmi/' + token, { method: 'POST', body: { type: 'event', direction: 'inbound', status: 'answered', from: Number(num), cmiuuid: conv, conversation_uuid: conv, user: '101_1', time: Date.now() } });
    lc = ((await as('/api/crm/telephony/live')).data?.data || []).find((c) => c.id === conv);
    check('telephony', 'live event marks the call answered', lc?.status === 'answered', lc?.status);
    await call('/api/voice-webhooks/telecmi/' + token, { method: 'POST', body: { type: 'event', direction: 'inbound', status: 'hangup', from: Number(num), cmiuuid: conv, conversation_uuid: conv, time: Date.now() } });
    lc = ((await as('/api/crm/telephony/live')).data?.data || []).find((c) => c.id === conv);
    check('telephony', 'hangup clears the screen pop', !lc);
    r = await as('/api/crm/telephony/logs/refresh', { method: 'POST', body: { hours: 1 } });
    check('telephony', 'call-log pull from TeleCMI runs (deduplicated)', r.status === 200 && typeof r.data?.data?.fetched === 'number', `${r.status} ${JSON.stringify(r.data?.data || msg(r))}`);
    r = await call('/api/voice-webhooks/telecmi-flow/not-the-token', { method: 'POST', body: {} });
    check('telephony', 'call-flow rejects wrong token', r.status === 404, r.status);
  } finally {
    if (savedRouting) await as('/api/crm/telephony/routing', { method: 'PUT', body: savedRouting });
    if (legacyId) await as('/api/crm/leads/' + legacyId, { method: 'DELETE' });
    const { updateLiveCall } = await import('../../services/telecmi-control.service.js');
    await updateLiveCall(T, conv, null).catch(() => {});
  }
}

// 5f. Dashboard: one role-based view with the patient journey; stage set in the Inbox survives Leads-page edits.
{
  let legacyId = null;
  try {
    r = await as('/api/crm/home?days=30&owner=me');
    check('dashboard', 'home view with patient journey (5 steps) and owner filter', r.status === 200 && r.data?.data?.journey?.steps?.length === 5 && r.data?.data?.owner === 'me', `${r.status} owner=${r.data?.data?.owner}`);
    r = await as('/api/crm/home?days=3650');
    check('dashboard', '"All time" period accepted', r.status === 200 && r.data?.data?.days === 3650, r.data?.data?.days);
    r = await as('/api/crm/dashboard/stats');
    check('dashboard', 'stats count calls and messages from the communication log', r.status === 200 && r.data?.data?.activities?.messages !== undefined && r.data?.data?.scope === 'organisation', `${r.status} scope=${r.data?.data?.scope}`);
    r = await as('/api/crm/funnel-analytics');
    check('dashboard', 'funnel analytics loads (RFQs scoped to this hospital)', r.status === 200 && r.data?.success, r.status);
    r = await as('/api/crm/ui-config');
    const cfg = r.data?.data || {};
    check('dashboard', 'Copilot hidden while no AI provider is configured', cfg.aiConfigured || (cfg.disabledPaths || []).includes('/crm/marketing-copilot'), `ai=${cfg.aiConfigured}`);
    r = await as('/api/crm/leads', { method: 'POST', body: { name: 'Smoke Journey ' + stamp, phone: '+9155530' + String(Date.now()).slice(-5), source: 'manual', status: 'new' } });
    legacyId = r.data?.data?.id;
    const v2 = (await as('/api/crm/inbox/by-legacy/' + legacyId)).data?.data?.lead_id;
    r = await as(`/api/crm/inbox/${v2}/stage`, { method: 'POST', body: { stage: 'appointment_booked' } });
    check('dashboard', 'journey stage set from the Inbox', r.status === 200 && r.data?.data?.lifecycle_stage === 'appointment_booked', `${r.status} ${msg(r)}`);
    r = await as(`/api/crm/inbox/${v2}/stage`, { method: 'POST', body: { stage: 'not_a_stage' } });
    check('dashboard', 'unknown journey stage refused', r.status === 400, r.status);
    await as('/api/crm/leads/' + legacyId, { method: 'PUT', body: { name: 'Smoke Journey ' + stamp, priority: 'high', status: 'qualified' } });
    const { rows: [st] } = await pool.query(`SELECT lifecycle_stage FROM crm_leads_v2 WHERE id = $1`, [v2]);
    check('dashboard', 'Leads-page edit keeps the journey stage', st?.lifecycle_stage === 'appointment_booked', st?.lifecycle_stage);
    // Inbox patient panel: tasks drive the next step; appointment booking; priority; stage history in the timeline.
    const past = new Date(Date.now() - 3600e3).toISOString(), tomorrow = new Date(Date.now() + 864e5).toISOString();
    r = await as(`/api/crm/inbox/${v2}/tasks`, { method: 'POST', body: { title: 'Smoke call back', dueAt: past } });
    const taskId = r.data?.data?.id;
    check('inbox', 'follow-up task created', r.status === 200 && taskId, `${r.status} ${msg(r)}`);
    r = await as(`/api/crm/inbox/${v2}`);
    let th = r.data?.data;
    check('inbox', 'thread carries tasks, summary and the next step', th?.tasks?.some((t) => t.id === taskId) && th?.summary && th?.lead?.next_action === 'Smoke call back', `next=${th?.lead?.next_action}`);
    check('inbox', 'stage change shown in the timeline', (th?.events || []).some((e) => e.channel === 'system' && e.kind === 'stage' && e.to_stage === 'appointment_booked'));
    r = await as(`/api/crm/inbox/${v2}/tasks`, { method: 'POST', body: { title: '' } });
    check('inbox', 'task without a title refused', r.status === 400, r.status);
    r = await as(`/api/crm/inbox/tasks/${taskId}`, { method: 'PATCH', body: { done: true } });
    check('inbox', 'task marked done', r.status === 200 && r.data?.data?.completed_at, r.status);
    r = await as(`/api/crm/inbox/${v2}/appointment`, { method: 'POST', body: { at: tomorrow, note: 'Smoke clinic' } });
    check('inbox', 'appointment booked as a task', r.status === 200 && /^Appointment: Smoke clinic/.test(r.data?.data?.title || ''), `${r.status} ${msg(r)}`);
    th = (await as(`/api/crm/inbox/${v2}`)).data?.data;
    check('inbox', 'next step moves to the appointment; finished task in the timeline', th?.lead?.next_action === 'Appointment: Smoke clinic' && th?.events?.some((e) => e.kind === 'task_done'), th?.lead?.next_action);
    r = await as(`/api/crm/inbox/${v2}/fields`, { method: 'PATCH', body: { priority: 'high' } });
    check('inbox', 'priority set', r.status === 200 && r.data?.data?.priority === 'high', r.status);
    r = await as(`/api/crm/inbox/${v2}/fields`, { method: 'PATCH', body: { priority: 'sky-high' } });
    check('inbox', 'unknown priority refused', r.status === 400, r.status);
    r = await as('/api/crm/inbox?due=1');
    check('inbox', 'queue filters follow-ups due', r.status === 200 && typeof r.data?.data?.counts?.due === 'number', r.status);
  } finally {
    if (legacyId) await as('/api/crm/leads/' + legacyId, { method: 'DELETE' });
  }
}

// 5g. Referral network: doctors, referral credit to CRM patient leads, dashboard, approvals, camps; field-lead push fix.
{
  const rn = (path, opts) => as('/api/crm/referral-network' + path, opts);
  const mob = (p) => p + String(Date.now()).slice(-8);
  let doctorId = null, campId = null, fieldLeadId = null;
  try {
    r = await rn('/doctors', { method: 'POST', body: { doctor_name: 'Dr Smoke Ref ' + stamp, specialty: 'Cardiology', area: 'Smoke Area', phone: mob('97'), referral_potential: 'high' } });
    doctorId = r.data?.data?.id;
    check('referrals', 'doctor added', r.status === 200 && doctorId, `${r.status} ${msg(r)}`);
    const docPhone = r.data?.data?.phone;
    r = await rn('/doctors', { method: 'POST', body: { doctor_name: 'Dr Smoke Dup ' + stamp, phone: docPhone } });
    check('referrals', 'duplicate doctor mobile refused', r.status === 409, r.status);
    r = await rn('/doctors?search=' + encodeURIComponent('Smoke Ref ' + stamp));
    check('referrals', 'directory search finds the doctor', r.status === 200 && r.data?.data?.doctors?.some((d) => String(d.id) === String(doctorId)), r.status);
    r = await rn(`/doctors/${doctorId}/referrals`, { method: 'POST', body: { patient_name: 'Smoke Referred ' + stamp, phone: mob('96'), need: 'Echo' } });
    const refLead = r.data?.data?.lead_id;
    check('referrals', 'referral creates a CRM patient lead', r.status === 200 && r.data?.data?.created && refLead, `${r.status} ${msg(r)}`);
    const { rows: [rl] } = await pool.query(`SELECT lv.referring_doctor_id, l.source FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id WHERE lv.id = $1`, [refLead]);
    check('referrals', 'lead credited to the doctor (source doctor referral)', String(rl?.referring_doctor_id) === String(doctorId) && rl?.source === 'doctor_referral', JSON.stringify(rl));
    r = await as('/api/crm/leads?search=' + encodeURIComponent('Smoke Referred ' + stamp));
    check('referrals', 'referred patient visible on the Leads page', r.status === 200 && (r.data?.data || []).length === 1, r.status);
    r = await rn(`/doctors/${doctorId}`);
    check('referrals', 'doctor profile shows the referral', r.status === 200 && r.data?.data?.stats?.referrals === 1 && r.data?.data?.doctor?.relationship_status === 'active_referrer', JSON.stringify(r.data?.data?.stats || msg(r)).slice(0, 100));
    r = await rn('/overview?days=30');
    check('referrals', 'network dashboard loads', r.status === 200 && r.data?.data?.kpi?.referrals >= 1, r.status);
    r = await rn('/approvals');
    check('referrals', 'approvals queue loads', r.status === 200 && Array.isArray(r.data?.data?.items), r.status);
    r = await rn('/events/camps', { method: 'POST', body: { camp_name: 'Smoke Camp ' + stamp, start_date: new Date().toISOString(), camp_type: 'cardiac' } });
    campId = r.data?.data?.event?.id;
    await pool.query(`INSERT INTO field_camp_registrations (camp_id, tenant_id, registered_by, patient_name, phone) VALUES ($1, $2, $3, $4, $5)`, [campId, T, admin.id, 'Smoke Camp Patient ' + stamp, mob('95')]);
    r = await rn(`/events/camps/${campId}/convert`, { method: 'POST', body: {} });
    check('referrals', 'camp registration becomes a patient lead', r.status === 200 && r.data?.data?.converted === 1, JSON.stringify(r.data?.data || msg(r)));
    const { rows: [fl] } = await pool.query(`INSERT INTO field_leads (user_id, entity_name, entity_type, contact_name, contact_phone, lead_type, status, tenant_id, created_at, updated_at) VALUES ($1, $2, 'corporate', $2, $3, 'corporate', 'new', $4, now(), now()) RETURNING id`, [admin.id, 'Smoke Field Lead ' + stamp, mob('94'), T]);
    fieldLeadId = fl.id;
    r = await as(`/api/crm/field-force/leads/${fieldLeadId}/push-to-crm`, { method: 'PATCH', body: {} });
    const { rows: [pv] } = await pool.query(`SELECT count(*)::int AS n FROM crm_leads_v2 WHERE legacy_lead_id = $1 AND tenant_id = $2`, [r.data?.crm_lead_id || 0, T]);
    check('referrals', 'pushed field lead reaches the Leads page (v2 record)', r.status === 200 && pv.n === 1, `${r.status} v2=${pv.n}`);
    r = await rn('/territories', { method: 'POST', body: { territory: 'Smoke Territory ' + stamp, zone: 'West', city: 'Hyderabad', user_id: admin.id } });
    const terr = (r.data?.data?.territories || []).find((t) => t.territory === 'Smoke Territory ' + stamp);
    check('referrals', 'territory created', r.status === 200 && terr, r.status);
    r = await rn(`/territories/${terr?.id}`, { method: 'PATCH', body: { ...terr, active: false } });
    check('referrals', 'territory deactivated', r.status === 200 && (r.data?.data?.territories || []).some((t) => t.id === terr?.id && !t.active), r.status);
    r = await rn('/empanelment', { method: 'POST', body: { insurer_name: 'Smoke Insurer ' + stamp, insurer_type: 'tpa', status: 'document_collection' } });
    const app = (r.data?.data?.applications || []).find((a) => a.insurer_name === 'Smoke Insurer ' + stamp);
    check('referrals', 'empanelment application created', r.status === 200 && app, r.status);
    r = await rn(`/empanelment/${app?.id}/milestones`, { method: 'POST', body: { milestone: 'Submit NABH certificate' } });
    const mil = (r.data?.data?.applications || []).find((a) => a.id === app?.id)?.milestones?.[0];
    r = await rn(`/empanelment/milestones/${mil?.id}`, { method: 'PATCH', body: { status: 'done' } });
    check('referrals', 'empanelment milestone added and done', r.status === 200 && (r.data?.data?.applications || []).find((a) => a.id === app?.id)?.milestones?.[0]?.status === 'done', r.status);
    r = await rn('/doctor-templates');
    const docTemplates = r.data?.data || [];
    check('referrals', 'doctor WhatsApp templates listed', r.status === 200 && docTemplates.length >= 3, `${r.status} n=${docTemplates.length}`);
    const pendingTemplate = docTemplates.find((t) => t.status !== 'approved');
    if (pendingTemplate) {
      r = await rn(`/doctors/${doctorId}/send`, { method: 'POST', body: { templateId: pendingTemplate.id, params: Array.from({ length: pendingTemplate.placeholders }, () => 'x') } });
      check('referrals', 'unapproved template refused (nothing sent)', r.status === 409, `${r.status} ${msg(r)}`);
    }
    r = await rn(`/doctors/${doctorId}/referrals`, { method: 'POST', body: { patient_name: 'Smoke Referred2 ' + stamp, phone: mob('93'), notify_doctor: !docTemplates.some((t) => t.status === 'approved' && /referral_thanks/.test(t.name)) } });
    check('referrals', 'referral still recorded when the thank-you cannot be sent', r.status === 200 && r.data?.data?.lead_id, `${r.status} ${JSON.stringify(r.data?.data?.notified || msg(r)).slice(0, 80)}`);
  } finally {
    const { rows: smokeLeads } = await pool.query(`SELECT lv.id, lv.legacy_lead_id FROM crm_leads_v2 lv JOIN crm_leads l ON l.id = lv.legacy_lead_id WHERE lv.tenant_id = $1 AND (l.name LIKE $2 OR l.name LIKE $3 OR l.name LIKE $4)`, [T, 'Smoke Referred% ' + stamp, 'Smoke Camp Patient ' + stamp, 'Smoke Field Lead ' + stamp]);
    for (const l of smokeLeads) {
      await pool.query(`DELETE FROM crm_provider_referrals WHERE lead_id = $1`, [l.id]);
      await pool.query(`DELETE FROM crm_activities WHERE lead_id = $1`, [l.legacy_lead_id]);
      await pool.query(`DELETE FROM crm_leads_v2 WHERE id = $1`, [l.id]);
      await pool.query(`DELETE FROM crm_leads WHERE id = $1`, [l.legacy_lead_id]);
    }
    await pool.query(`UPDATE crm_contacts_v2 SET deleted_at = now() WHERE tenant_id = $1 AND COALESCE(full_name, name) LIKE '%Smoke%' || $2 AND deleted_at IS NULL`, [T, stamp]).catch(() => {});
    await pool.query(`DELETE FROM crm_contacts WHERE name LIKE '%Smoke%' || $1`, [stamp]).catch(() => {});
    if (fieldLeadId) await pool.query(`DELETE FROM field_leads WHERE id = $1`, [fieldLeadId]);
    await pool.query(`DELETE FROM field_territories WHERE tenant_id = $1 AND territory = $2`, [T, 'Smoke Territory ' + stamp]);
    await pool.query(`DELETE FROM field_empanelment_milestones WHERE application_id IN (SELECT id FROM field_empanelment_applications WHERE tenant_id = $1 AND insurer_name = $2)`, [T, 'Smoke Insurer ' + stamp]);
    await pool.query(`DELETE FROM field_empanelment_applications WHERE tenant_id = $1 AND insurer_name = $2`, [T, 'Smoke Insurer ' + stamp]);
    if (campId) { await pool.query(`DELETE FROM field_camp_registrations WHERE camp_id = $1`, [campId]); await pool.query(`DELETE FROM health_camps WHERE id = $1`, [campId]); }
    await pool.query(`DELETE FROM field_doctor_crm WHERE tenant_id = $1 AND doctor_name LIKE 'Dr Smoke % ' || $2`, [T, stamp]);
  }
}

// 5h. Access rules: field executives see only their own leads; only managers reassign; agents hear only
// their own calls; campaigns are for managers and marketing. Uses two temporary accounts.
{
  const mkUser = async (role) => (await pool.query(
    `INSERT INTO users ("firstName","lastName",email,password,"phoneNumber",role,status,"isAdmin","isTeam",tenant_id,organization_id,organization_type,metadata,"createdAt","updatedAt")
     VALUES ('Smoke', $1, $2, '!', '0000000000', 'team', 'active', false, false, $3, $3, 'hospital', $4, now(), now()) RETURNING id`,
    [role, `smoke-acl-${role}-${stamp}@example.invalid`, T, JSON.stringify({ isCRM: true, crmRole: role, tenantId: T })])).rows[0].id;
  const tok = (id, role) => jwt.sign({ id, role: 'team', isCRM: true, userType: 'crm', tenantId: T, crmRole: role, tokenType: 'access', jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: 300 });
  const asUser = (t) => (path, opts = {}) => call(path, { token: t, ...opts });
  let repId = null, agentId = null; const leadIds = []; let evtId = null;
  try {
    repId = await mkUser('sales_rep'); agentId = await mkUser('telecaller');
    const rep = asUser(tok(repId, 'sales_rep')), agent = asUser(tok(agentId, 'telecaller'));
    const mkLead = async (label) => { const r2 = await as('/api/crm/leads', { method: 'POST', body: { name: `Smoke ACL ${label} ${stamp}`, phone: '+9155540' + String(Date.now()).slice(-5) + leadIds.length, source: 'manual' } }); leadIds.push(r2.data?.data?.id); return r2.data?.data?.id; };
    const leadA = await mkLead('A'), leadB = await mkLead('B'), leadC = await mkLead('C');
    r = await as(`/api/crm/leads/${leadB}`, { method: 'PUT', body: { assigned_to: repId } });
    check('access', 'admin can reassign a lead', r.status === 200 && Number(r.data?.data?.assigned_to) === repId, r.status);
    await pool.query(`UPDATE crm_leads SET assigned_to = NULL WHERE id = $1`, [leadC]);
    const v2 = async (id) => (await pool.query(`SELECT id FROM crm_leads_v2 WHERE legacy_lead_id = $1 AND tenant_id = $2`, [id, T])).rows[0]?.id;
    const [vA, vB, vC] = [await v2(leadA), await v2(leadB), await v2(leadC)];

    r = await rep('/api/crm/leads?search=' + encodeURIComponent('Smoke ACL'));
    const names = (r.data?.data || []).map((l) => l.name);
    check('access', 'field executive lists only own leads', r.status === 200 && names.some((n) => n.startsWith('Smoke ACL B')) && !names.some((n) => n.startsWith('Smoke ACL A')), names.join(', ').slice(0, 100));
    r = await rep(`/api/crm/leads/${leadA}`);
    check('access', "field executive cannot open another's lead", r.status === 404, r.status);
    r = await rep(`/api/crm/leads/${leadB}`);
    check('access', 'field executive opens own lead', r.status === 200, r.status);
    r = await rep(`/api/crm/leads/${leadB}`, { method: 'PUT', body: { assigned_to: agentId } });
    check('access', 'field executive cannot reassign', r.status === 403, r.status);
    r = await rep(`/api/crm/inbox/${vA}`);
    check('access', "field executive cannot open another's Inbox thread", r.status === 404, r.status);
    r = await rep('/api/crm/inbox?status=all&search=' + encodeURIComponent('Smoke ACL'));
    check('access', 'field executive Inbox shows no other patients', r.status === 200 && !(r.data?.data?.conversations || []).some((c) => String(c.lead_id) === String(vA)), r.status);
    r = await rep(`/api/crm/v2/leads/${vA}`);
    check('access', "field executive cannot open another's lead in Hospital CRM", r.status === 404, r.status);
    r = await rep(`/api/crm/communication-hub/log?leadId=${leadA}`);
    check('access', "field executive cannot read another's message log", r.status === 404, r.status);

    r = await agent(`/api/crm/leads/${leadA}`);
    check('access', 'agent can look up any lead', r.status === 200, r.status);
    r = await agent(`/api/crm/leads/${leadA}`, { method: 'PUT', body: { assigned_to: agentId } });
    check('access', "agent cannot take another person's lead", r.status === 403, r.status);
    r = await agent(`/api/crm/inbox/${vC}/assign`, { method: 'PATCH', body: { userId: 'me' } });
    check('access', 'agent can take an unassigned lead', r.status === 200, `${r.status} ${msg(r)}`);
    evtId = (await pool.query(`INSERT INTO crm_communication_events (tenant_id, lead_id, channel, direction, message_type, provider, status, owner_user_id, metadata, created_at)
      VALUES ($1, $2, 'call', 'inbound', 'call', 'telecmi', 'answered', $3, '{"recording":"smoke"}'::jsonb, now()) RETURNING id`, [T, vA, admin.id])).rows[0].id;
    r = await agent(`/api/crm/inbox/${vA}/recording/evt:${evtId}`);
    check('access', "agent cannot play another person's call recording", r.status === 403, r.status);
    r = await rep(`/api/crm/inbox/${vA}/recording/evt:${evtId}`);
    check('access', "field executive cannot play recordings of another's patient", r.status === 404, r.status);

    r = await rep('/api/crm/engage/campaigns', { method: 'POST', body: { name: 'x' } });
    const r2 = await agent('/api/crm/engage/campaigns');
    check('access', 'campaigns refused for field executives and agents', r.status === 403 && r2.status === 403, `${r.status}/${r2.status}`);
    r = await as('/api/crm/engage/campaigns');
    check('access', 'campaigns open to managers', r.status === 200, r.status);
  } finally {
    if (evtId) await pool.query(`DELETE FROM crm_communication_events WHERE id = $1`, [evtId]);
    for (const id of leadIds.filter(Boolean)) {
      await pool.query(`DELETE FROM crm_activities WHERE lead_id = $1`, [id]);
      await pool.query(`DELETE FROM crm_leads_v2 WHERE legacy_lead_id = $1`, [id]);
      await pool.query(`DELETE FROM crm_leads WHERE id = $1`, [id]);
    }
    await pool.query(`UPDATE crm_contacts_v2 SET deleted_at = now() WHERE tenant_id = $1 AND COALESCE(full_name, name) LIKE 'Smoke ACL % ' || $2 AND deleted_at IS NULL`, [T, stamp]).catch(() => {});
    await pool.query(`DELETE FROM crm_contacts WHERE name LIKE 'Smoke ACL % ' || $1`, [stamp]).catch(() => {});
    const ids = [repId, agentId].filter(Boolean);
    if (ids.length) {
      await pool.query(`DELETE FROM crm_audit_log WHERE actor_user_id = ANY($1)`, [ids]).catch(() => {});
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]).catch((e) => check('access', 'temporary accounts removed', false, e.message));
    }
  }
}

// 6. Sending gates: outbound open, bulk still refused. Invalid payloads only, so nothing can be sent.
r = await as('/api/crm/whatsapp/templates/send', { method: 'POST', body: {} });
check('gates', 'outbound fence open (send reaches validation)', r.status !== 503 && r.status >= 400 && r.status < 500, `${r.status} ${msg(r)}`);
r = await as('/api/crm/segments/smoke-nonexistent/send', { method: 'POST', body: {} });
check('gates', 'bulk send still refused (503)', r.status === 503 && r.data?.code === 'bulk_sending_unavailable', `${r.status} ${msg(r)}`);

// Test leads are deleted above, but the notes the CRM logs about them ("Lead created", "Contact captured")
// stay behind and inflate the dashboard's activity counts. Remove this run's notes.
{
  const { rowCount } = await pool.query(`DELETE FROM crm_activities WHERE created_at >= $1 AND title ~* 'smoke'`, [RUN_START]);
  const { rows: [left] } = await pool.query(`SELECT count(*)::int AS n FROM crm_activities WHERE created_at >= $1 AND title ~* 'smoke'`, [RUN_START]);
  check('cleanup', 'test notes removed', left.n === 0, `${rowCount} removed, ${left.n} left`);
}

await pool.end();
const failed = results.filter((x) => !x.passed);
for (const g of [...new Set(results.map((x) => x.group))]) {
  const rows = results.filter((x) => x.group === g);
  console.log(`\n[${g}] ${rows.filter((x) => x.passed).length}/${rows.length}`);
  for (const x of rows) if (!x.passed || g !== 'screens') console.log(`  ${x.passed ? 'PASS' : 'FAIL'}  ${x.name}  ${x.detail}`);
}
console.log(`\nTOTAL ${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
