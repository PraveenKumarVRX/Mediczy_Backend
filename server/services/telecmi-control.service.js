/** TeleCMI CHUB control from the CRM: account, agents, routing, call-log sync and live calls.
 * API: doc.telecmi.com/chub/docs (user/all|add|update|remove|status, balance, analysis, missed,
 * answered, out_missed, out_answered, webrtc/click2call). Webhooks: CDR + notify (voice-webhooks.route.js)
 * and the HTTP call flow, which asks the CRM where each incoming call should ring.
 *
 * TeleCMI has no contacts API, so the CRM is the address book: on every incoming call the flow request
 * carries the caller's number, the CRM matches it to a lead, rings that lead's owner first (or all
 * agents for a new caller) and shows staff who is calling. Agent passwords never leave this file. */
import { managedFetch as fetch } from '../integrations/transport.js';
import sharedPool from '../db/pgPool.js';
import { cache } from '../db/redis.js';

const BASE = 'https://rest.telecmi.com/v2/';
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const creds = () => ({ appid: Number(process.env.VOICE_TELECMI_PROVIDER_APPID), secret: process.env.VOICE_TELECMI_PROVIDER_SECRET });
export const telecmiConfigured = () => Boolean(creds().appid && creds().secret);
const last10 = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);
const mask = (p) => (p ? String(p).replace(/\d(?=\d{4})/g, '•') : null);

async function call(path, body = {}, { timeout = 12000 } = {}) {
  if (!telecmiConfigured()) throw fail(409, 'TeleCMI is not connected.');
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ ...creds(), ...body }) });
  const data = await res.json().catch(() => ({}));
  if (res.status !== 200 || (data.code && data.code !== 200)) {
    const why = data.msg || data.message || { 400: 'missing or invalid parameter', 401: 'authentication failed', 404: 'not found or authentication failed', 407: 'invalid app secret' }[res.status] || `HTTP ${res.status}`;
    throw fail(502, `TeleCMI ${path}: ${why}`);
  }
  return data;
}

// ── agents ───────────────────────────────────────────────────────────────────
let agentCache = { at: 0, rows: null };
export async function rawAgents({ fresh = false } = {}) {
  if (!fresh && agentCache.rows && Date.now() - agentCache.at < 300000) return agentCache.rows;
  const data = await call('user/all');
  agentCache = { at: Date.now(), rows: (data.agents || []).map((a) => ({ ...a, agent_id: String(a.agent_id) })) };
  return agentCache.rows;
}

export async function listAgents(tenantId) {
  const agents = await rawAgents({ fresh: true });
  const { rows: users } = await sharedPool.query(
    `SELECT id, NULLIF(trim(concat_ws(' ', "firstName", "lastName")), '') AS name, email, metadata->>'telecmi_user_id' AS telecmi_user_id
       FROM users WHERE tenant_id = $1 AND status = 'active' ORDER BY id`, [tenantId]);
  // TeleCMI's user APIs (v2 and v3) don't list every user who answers calls: team members such as the
  // account's main user only appear in call records. Show those too, so they can be linked to a CRM user.
  const { rows: seen } = await sharedPool.query(
    `SELECT metadata->>'agent_user' AS agent_id, max(metadata->>'team') AS team, count(*)::int AS calls, max(created_at) AS last_call
       FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi' AND metadata->>'agent_user' IS NOT NULL
      GROUP BY 1`, [tenantId]);
  const listed = new Set(agents.map((a) => a.agent_id));
  const fromCalls = seen.filter((s) => !listed.has(s.agent_id)).map((s) => ({ agent_id: s.agent_id, name: `Agent ${s.agent_id.split('_')[0]}`, extension: Number(s.agent_id.split('_')[0]) || null,
    phone: null, seen_only: true, team: s.team, calls: s.calls, last_call: s.last_call }));
  return {
    agents: [...agents.map((a) => ({ agent_id: a.agent_id, name: a.name, extension: a.extension, phone: mask(a.phone), notify: a.notify, start_time: a.start_time, end_time: a.end_time })), ...fromCalls]
      .map((a) => { const u = users.find((x) => x.telecmi_user_id === a.agent_id); return { ...a, crm_user: u ? { id: u.id, name: u.name || u.email } : null }; }),
    users: users.map((u) => ({ id: u.id, name: u.name || u.email, email: u.email, telecmi_user_id: u.telecmi_user_id })),
  };
}

async function linkUser(tenantId, crmUserId, agentId) {
  if (!crmUserId) return;
  await sharedPool.query(`UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) - 'telecmi_user_id' WHERE tenant_id = $1 AND metadata->>'telecmi_user_id' = $2`, [tenantId, agentId]);
  const { rowCount } = await sharedPool.query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('telecmi_user_id', $3::text) WHERE tenant_id = $1 AND id = $2 AND status = 'active'`,
    [tenantId, Number(crmUserId), agentId]);
  if (!rowCount) throw fail(400, 'That CRM user is not active.');
}

function validPhone(p) { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `91${d}` : (d.length >= 11 && d.length <= 15 ? d : null); }

export async function addAgent(tenantId, { name, extension, phone, password, crmUserId, smsAlert = true }) {
  const nm = String(name || '').trim().slice(0, 60);
  const ext = Number(extension);
  const ph = validPhone(phone);
  if (!nm) throw fail(400, 'Enter the agent\'s name.');
  if (!(ext >= 100 && ext <= 999)) throw fail(400, 'Extension must be a 3-digit number (100–999).');
  if (!ph) throw fail(400, 'Enter the agent\'s mobile number (calls ring here).');
  if (String(password || '').length < 6) throw fail(400, 'Password needs at least 6 characters (used to sign in to the TeleCMI app).');
  const data = await call('user/add', { extension: ext, name: nm, phone_number: ph, password: String(password), sms_alert: Boolean(smsAlert) });
  const agentId = String(data.agent?.agent_id || '');
  agentCache.at = 0;
  if (agentId && crmUserId) await linkUser(tenantId, crmUserId, agentId);
  return { agent_id: agentId, name: nm, extension: ext, linked: Boolean(crmUserId) };
}

export async function updateAgent(tenantId, agentId, { name, phone, password, crmUserId, smsAlert }) {
  const current = (await rawAgents({ fresh: true })).find((a) => a.agent_id === String(agentId));
  if (!current) {
    // Seen on calls but not listed by TeleCMI's API: only the CRM link can change here.
    const { rows } = await sharedPool.query(`SELECT 1 FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi' AND metadata->>'agent_user' = $2 LIMIT 1`, [tenantId, String(agentId)]);
    if (!rows.length) throw fail(404, 'Agent not found on TeleCMI.');
    if (name || phone || password) throw fail(409, 'This agent is managed in the TeleCMI dashboard (it is not available through their API). You can still link it to a CRM user.');
    if (crmUserId) await linkUser(tenantId, crmUserId, String(agentId));
    else await sharedPool.query(`UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) - 'telecmi_user_id' WHERE tenant_id = $1 AND metadata->>'telecmi_user_id' = $2`, [tenantId, String(agentId)]);
    return { agent_id: String(agentId), linked: Boolean(crmUserId) };
  }
  const ph = phone ? validPhone(phone) : current.phone;
  if (!ph) throw fail(400, 'Enter a valid mobile number.');
  await call('user/update', { id: current.agent_id, name: String(name || current.name).slice(0, 60), phone_number: String(ph),
    password: password ? String(password) : current.password, ...(smsAlert === undefined ? {} : { sms_alert: Boolean(smsAlert) }) });
  agentCache.at = 0;
  if (crmUserId !== undefined) {
    if (crmUserId) await linkUser(tenantId, crmUserId, current.agent_id);
    else await sharedPool.query(`UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) - 'telecmi_user_id' WHERE tenant_id = $1 AND metadata->>'telecmi_user_id' = $2`, [tenantId, current.agent_id]);
  }
  return { agent_id: current.agent_id, updated: true };
}

export async function removeAgent(tenantId, agentId) {
  await call('user/remove', { id: String(agentId) });
  agentCache.at = 0;
  await sharedPool.query(`UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) - 'telecmi_user_id' WHERE tenant_id = $1 AND metadata->>'telecmi_user_id' = $2`, [tenantId, String(agentId)]);
  return { removed: true };
}

export async function setAgentStatus(agentId, status) {
  if (!['online', 'offline', 'break', 'dialer'].includes(status)) throw fail(400, 'Status must be online, offline, break or dialer.');
  await call('user/status', { id: String(agentId), status });
  return { agent_id: String(agentId), status };
}

// ── routing settings (tenants.settings.telephony) ────────────────────────────
const DEFAULT_ROUTING = { ownerFirst: true, rule: 'parallel', timeout: 25, loop: 1, fallback: null };
export async function getRouting(tenantId) {
  const { rows: [t] } = await sharedPool.query(`SELECT settings->'telephony' AS t FROM tenants WHERE id = $1`, [tenantId]);
  return { ...DEFAULT_ROUTING, ...(t?.t || {}) };
}
export async function saveRouting(tenantId, input = {}) {
  const next = {
    ownerFirst: input.ownerFirst !== false,
    rule: input.rule === 'sequential' ? 'sequential' : 'parallel',
    timeout: Math.min(Math.max(Number(input.timeout) || 25, 10), 90),
    loop: Math.min(Math.max(Number(input.loop) || 1, 1), 3),
    fallback: input.fallback && ['team', 'ivr'].includes(input.fallback.action) && /^[\w@.-]{1,80}$/.test(input.fallback.name || '')
      ? { action: input.fallback.action, name: input.fallback.name } : null,
  };
  await sharedPool.query(`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{telephony}', $2::jsonb), updated_at = now() WHERE id = $1`, [tenantId, JSON.stringify(next)]);
  return next;
}

// ── caller identification + incoming call flow ──────────────────────────────
export async function identifyCaller(tenantId, number) {
  const p10 = last10(number);
  if (p10.length < 10) return null;
  const { rows: [lead] } = await sharedPool.query(
    `SELECT lv.id AS lead_id, l.id AS legacy_lead_id, l.name, l.status, l.source, l.assigned_to,
            NULLIF(trim(concat_ws(' ', u."firstName", u."lastName")), '') AS owner_name, u.metadata->>'telecmi_user_id' AS owner_agent,
            (SELECT count(*)::int FROM crm_communication_events e WHERE e.tenant_id = lv.tenant_id AND e.lead_id = lv.id) AS interactions
       FROM crm_leads l JOIN crm_leads_v2 lv ON lv.legacy_lead_id = l.id AND lv.tenant_id = $1 AND lv.deleted_at IS NULL
       LEFT JOIN users u ON u.id = l.assigned_to AND u.tenant_id = lv.tenant_id
      WHERE right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = $2
      ORDER BY (l.status NOT IN ('converted', 'lost')) DESC, l.updated_at DESC LIMIT 1`, [tenantId, p10]);
  if (lead) return lead;
  const { rows: [contact] } = await sharedPool.query(
    `SELECT name FROM crm_contacts WHERE tenant_uid = (SELECT tenant_uid FROM crm_leads_v2 WHERE tenant_id = $1 LIMIT 1)
        AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2 LIMIT 1`, [tenantId, p10]);
  return contact ? { name: contact.name, contact_only: true } : null;
}

export async function routeIncoming(tenantId, body) {
  const from = String(body?.from ?? '');
  const caller = await identifyCaller(tenantId, from).catch(() => null);
  const routing = await getRouting(tenantId);
  await pushLiveCall(tenantId, { id: String(body?.cmiuuid || from + Date.now()), from, status: 'ringing', caller });
  let agents = [];
  try { agents = await rawAgents(); } catch { /* TeleCMI unreachable: fall back below */ }
  const ringable = agents.filter((a) => a.phone);
  const owner = routing.ownerFirst && caller?.owner_agent ? ringable.find((a) => a.agent_id === caller.owner_agent) : null;
  if (owner) {
    // The lead's owner first; everyone else only if the owner doesn't pick up.
    return { route: 'owner', response: { code: 200, loop: routing.loop, followme: true, hangup: false, timeout: routing.timeout, rule: 'sequential',
      result: [owner, ...ringable.filter((a) => a !== owner)].map((a) => ({ agent_id: a.agent_id, phone: String(a.phone) })) } };
  }
  if (ringable.length) {
    return { route: 'all', response: { code: 200, loop: routing.loop, followme: true, hangup: false, timeout: routing.timeout, rule: routing.rule,
      result: ringable.map((a) => ({ agent_id: a.agent_id, phone: String(a.phone) })) } };
  }
  if (routing.fallback) return { route: 'fallback', response: { action: routing.fallback.action, name: routing.fallback.name } };
  return { route: 'none', response: { code: 200, loop: 1, followme: false, hangup: false, timeout: routing.timeout, result: [] } };
}

// ── live calls (screen pop) ──────────────────────────────────────────────────
const liveKey = (tenantId) => `voice:telecmi:live:${tenantId}`;
export async function pushLiveCall(tenantId, entry) {
  const list = ((await cache.get(liveKey(tenantId)).catch(() => null)) || []).filter((c) => Date.now() - c.at < 180000 && c.id !== entry.id);
  list.unshift({ ...entry, at: Date.now() });
  await cache.set(liveKey(tenantId), list.slice(0, 20), 300).catch(() => {});
}
export async function updateLiveCall(tenantId, id, patch) {
  const list = (await cache.get(liveKey(tenantId)).catch(() => null)) || [];
  const next = patch === null ? list.filter((c) => c.id !== id) : list.map((c) => (c.id === id ? { ...c, ...patch, at: Date.now() } : c));
  await cache.set(liveKey(tenantId), next, 300).catch(() => {});
}
export async function liveCalls(tenantId) {
  return ((await cache.get(liveKey(tenantId)).catch(() => null)) || []).filter((c) => Date.now() - c.at < 180000);
}

/** Live "notify" events: show ringing calls, mark who answered, clear on hangup. */
export async function handleLiveEvent(tenantId, c, body) {
  if (c.direction === 'outbound' && body.conversation_uuid) {
    // The agent leg of an inbound call: carries which user/team picked up.
    if (c.status === 'answered') {
      const { rows: [u] } = await sharedPool.query(`SELECT NULLIF(trim(concat_ws(' ', "firstName", "lastName")), '') AS name FROM users WHERE tenant_id = $1 AND metadata->>'telecmi_user_id' = $2 LIMIT 1`, [tenantId, String(body.user || '')]);
      await updateLiveCall(tenantId, String(body.conversation_uuid), { status: 'answered', agent: u?.name || (body.user ? `agent ${String(body.user).split('_')[0]}` : null) });
    }
    return;
  }
  if (c.direction !== 'inbound') return;
  const id = String(body.conversation_uuid || body.cmiuuid || '');
  if (!id) return;
  if (['waiting', 'started', 'ringing'].includes(c.status)) {
    const existing = (await liveCalls(tenantId)).find((x) => x.id === id);
    if (!existing) await pushLiveCall(tenantId, { id, from: String(body.from ?? ''), status: 'ringing', caller: await identifyCaller(tenantId, body.from).catch(() => null) });
  } else if (c.status === 'answered') {
    await updateLiveCall(tenantId, id, { status: 'answered', agent: c.agentUser });
  } else if (['hangup', 'ended', 'completed'].includes(c.status)) {
    await updateLiveCall(tenantId, id, null);
  }
}

// ── account status + call-log sync ───────────────────────────────────────────
export async function telephonyOverview(tenantId) {
  const configured = telecmiConfigured();
  let balance = null, agents = null, last24 = null, error = null;
  if (configured) {
    try {
      const [b, a, s] = await Promise.all([call('balance'), rawAgents({ fresh: true }), call('analysis', { start_date: Date.now() - 864e5, end_date: Date.now() })]);
      balance = { amount: Number(b.balance), expires: b.expire ? new Date(b.expire).toISOString() : null };
      agents = a.length; last24 = { total: s.total, answered: s.answered, missed: s.missed };
    } catch (e) { error = e.message; }
  }
  const { rows: [h] } = await sharedPool.query(
    `SELECT max(created_at) AS last_cdr, count(*)::int AS calls_7d FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi' AND created_at > now() - interval '7 days'`, [tenantId]);
  const lastFlow = await cache.get(`voice:telecmi:lastflow:${tenantId}`).catch(() => null);
  const lastSync = await cache.get(`voice:telecmi:lastsync:${tenantId}`).catch(() => null);
  let number = null;
  try { number = JSON.parse(process.env.VOICE_PROVIDER_BINDINGS || '{}')[process.env.CRM_TENANT_UID]?.number || null; } catch { /* none */ }
  const base = (process.env.VOICE_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const token = process.env.VOICE_TELECMI_WEBHOOK_TOKEN || '';
  return { configured, appidSuffix: configured ? String(creds().appid).slice(-4) : null, number, balance, agents, last24, error,
    webhook: { lastCdrAt: h.last_cdr, calls7d: h.calls_7d, lastFlowAt: lastFlow?.at || null, lastSync },
    urls: token ? { webhook: `${base}/api/voice-webhooks/telecmi/${token}`, flow: `${base}/api/voice-webhooks/telecmi-flow/${token}` } : null,
    routing: await getRouting(tenantId) };
}

/** Pulls TeleCMI's call logs and files any call the webhooks missed (deduplicated). */
export async function syncCallLogs(tenantId, { hours = 6, maxPages = 10 } = {}) {
  const { recordTelecmiCdr } = await import('./crm-telecmi-calls.service.js');
  const end = Date.now(), start = end - Math.min(hours, 72) * 3600e3;
  const kinds = [['missed', 'inbound', 'missed'], ['answered', 'inbound', 'answered'], ['out_missed', 'outbound', 'missed'], ['out_answered', 'outbound', 'answered']];
  const out = { fetched: 0, added: 0, known: 0, skipped: 0 };
  for (const [path, direction, status] of kinds) {
    for (let page = 1; page <= maxPages; page += 1) {
      const data = await call(path, { start_date: start, end_date: end, page, limit: 20 });
      const rows = data.cdr || [];
      for (const r of rows) {
        out.fetched += 1;
        const id = String(r.cmiuid || '');
        if (!id) { out.skipped += 1; continue; }
        const { rows: known } = await sharedPool.query(
          `SELECT 1 FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi' AND (provider_message_id = $2 OR metadata->>'cmiuuid' = $2) LIMIT 1`, [tenantId, id]);
        if (known.length) { out.known += 1; continue; }
        const customer = direction === 'inbound' ? r.from : r.to;
        // A webhook may already have filed this call under its conversation/call id: same number, direction and minute.
        const { rows: near } = await sharedPool.query(
          `SELECT 1 FROM crm_communication_events e JOIN crm_leads_v2 lv ON lv.id = e.lead_id JOIN crm_leads l ON l.id = lv.legacy_lead_id
            WHERE e.tenant_id = $1 AND e.provider = 'telecmi' AND e.direction = $2 AND abs(extract(epoch FROM e.created_at - to_timestamp($3 / 1000.0))) < 120
              AND right(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = $4 LIMIT 1`, [tenantId, direction, Number(r.time) || end, last10(customer)]);
        if (near.length) { out.known += 1; continue; }
        const res = await recordTelecmiCdr(tenantId, { type: 'cdr', direction, status, from: direction === 'inbound' ? r.from : undefined, to: direction === 'outbound' ? r.to : r.to,
          cmiuuid: id, conversation_uuid: id, call_id: direction === 'outbound' ? id : undefined, answeredsec: status === 'answered' ? Number(r.billedsec) || 0 : 0,
          user: r.agent, record: r.record === true || r.record === 'true', filename: r.filename, time: r.time, source: 'api_sync' });
        if (res?.eventId && !res.merged) out.added += 1; else out.skipped += 1;
      }
      if (rows.length < 20) break;
    }
  }
  await cache.set(`voice:telecmi:lastsync:${tenantId}`, { at: new Date().toISOString(), ...out }, 86400).catch(() => {});
  return out;
}
