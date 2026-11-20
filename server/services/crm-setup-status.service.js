/** Getting-started checklist for the CRM dashboard (rendered by /crm-tools/overlay/overlay.js).
 * Each step reports done/not done from live data, with where to fix it. Cheap queries only; the
 * TeleCMI agent count is cached for 10 minutes so the dashboard never waits on TeleCMI. */
import { managedFetch as fetch } from '../integrations/transport.js';
import sharedPool from '../db/pgPool.js';
import { listCrmChannelIntegrations } from './crm-channel-integrations.service.js';

let agentCache = { at: 0, count: null };
async function telecmiAgents() {
  if (Date.now() - agentCache.at < 600000) return agentCache.count;
  const appid = Number(process.env.VOICE_TELECMI_PROVIDER_APPID), secret = process.env.VOICE_TELECMI_PROVIDER_SECRET;
  let count = null;
  if (appid && secret) {
    try {
      const res = await fetch('https://rest.telecmi.com/v2/user/all', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appid, secret }), signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data?.code === 200) count = Number(data.count) || 0;
    } catch { /* unknown */ }
  }
  agentCache = { at: Date.now(), count };
  return count;
}

export async function setupStatus(tenantId, tenantUid) {
  const integrations = await listCrmChannelIntegrations(tenantId).catch(() => []);
  const live = (ch) => integrations.find((i) => i.channel === ch)?.deliveryMode === 'live';
  const { rows: [n] } = await sharedPool.query(
    `SELECT (SELECT count(*) FROM crm_leads_v2 WHERE tenant_id = $1 AND deleted_at IS NULL)::int AS leads,
            (SELECT count(*) FROM crm_communication_templates WHERE tenant_id = $1 AND channel = 'whatsapp' AND status = 'approved')::int AS templates,
            (SELECT count(*) FROM users WHERE tenant_id = $1 AND status = 'active')::int AS users,
            (SELECT count(*) FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi')::int AS telecmi_calls,
            (SELECT count(*) FROM users WHERE tenant_id = $1 AND status = 'active' AND metadata->>'telecmi_user_id' IS NOT NULL)::int AS linked_agents,
            (SELECT count(DISTINCT metadata->>'agent_user') FROM crm_communication_events WHERE tenant_id = $1 AND provider = 'telecmi' AND metadata->>'agent_user' IS NOT NULL)::int AS seen_agents`,
    [tenantId]);
  const agents = await telecmiAgents();
  const steps = [
    { id: 'whatsapp', label: 'Connect WhatsApp', done: live('whatsapp'), href: '/crm/settings', hint: 'Settings & Channels → WhatsApp' },
    { id: 'templates', label: 'Get WhatsApp templates approved', done: n.templates > 0, detail: `${n.templates} approved`, href: '/crm-tools/whatsapp/' },
    { id: 'email', label: 'Connect email (also enables password reset)', done: live('email'), href: '/crm/settings', hint: 'Settings & Channels → Email' },
    { id: 'leads', label: 'Add or import your first leads', done: n.leads > 0, detail: `${n.leads} leads`, href: '/crm/leads' },
    { id: 'team', label: 'Invite your team', done: n.users > 1, detail: `${n.users} active user${n.users === 1 ? '' : 's'}`, href: '/crm/team' },
    // TeleCMI's user API doesn't list every agent (dashboard-created users only show up in call records).
    { id: 'calls', label: 'Set up TeleCMI calling', done: Math.max(agents ?? 0, n.seen_agents) > 0 && n.telecmi_calls > 0,
      detail: `${Math.max(agents ?? 0, n.seen_agents)} agent${Math.max(agents ?? 0, n.seen_agents) === 1 ? '' : 's'} · ${n.telecmi_calls ? `${n.telecmi_calls} call${n.telecmi_calls === 1 ? '' : 's'} recorded` : 'no call records received yet'}${n.linked_agents ? ` · ${n.linked_agents} linked to CRM users` : ''}`,
      href: '/crm-tools/calls/', hint: 'Calls page: agents, routing and webhook links' },
  ];
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
