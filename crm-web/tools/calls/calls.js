'use strict';
// Calls: TeleCMI control (agents, routing, call-log sync, live calls). Reuses the CRM session.
async function refreshSession() {
  const refreshToken = localStorage.getItem('crmRefreshToken');
  if (!refreshToken) return false;
  const res = await fetch('/api/crm/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  if (!data.token) return false;
  localStorage.setItem('crmToken', data.token);
  if (data.refreshToken) localStorage.setItem('crmRefreshToken', data.refreshToken);
  return true;
}
async function api(method, path, body, retried) {
  const token = localStorage.getItem('crmToken');
  if (!token) { go('/crm/login'); throw new Error('Not signed in'); }
  const res = await fetch(`/api/crm${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (res.status === 401 && !retried) { if (await refreshSession()) return api(method, path, body, true); go('/crm/login'); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) { const e = new Error(data.message || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data.data !== undefined ? data.data : data;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else if (k === 'value') node.value = v; else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
const $ = (s) => document.querySelector(s);
const ago = (t) => { if (!t) return 'never'; const s = Math.round((Date.now() - new Date(t)) / 1000); return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString('en-IN'); };
const phone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : (d ? `+${d}` : 'Unknown'); };
function say(text, ok = true) { const r = $('#result'); r.textContent = text || ''; r.className = `result ${ok ? 'good' : 'bad'}`; }
const field = (label, input) => el('label', {}, label, input);
let isAdmin = false, users = [];

async function loadOverview() {
  let o;
  try { o = await api('GET', '/telephony/overview'); } catch (e) { say(e.message, false); return; }
  const card = (label, value, sub, warn) => el('div', { class: `card${warn ? ' warn' : ''}` }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), sub ? el('div', { class: 'sub' }, sub) : null);
  const lowBalance = o.balance && o.balance.amount < 50;
  $('#cards').replaceChildren(
    card('TeleCMI', o.configured ? (o.error ? 'Error' : 'Connected') : 'Not connected', o.error || (o.configured ? `App …${o.appidSuffix}` : 'Add credentials on the server'), !o.configured || o.error),
    card('Business number', phone(o.number), 'Patients call this number'),
    card('Balance', o.balance ? `₹${o.balance.amount.toFixed(2)}` : '—', o.balance ? (lowBalance ? 'Too low to place calls: top up in TeleCMI' : `Plan valid until ${new Date(o.balance.expires).toLocaleDateString('en-IN')}`) : '', lowBalance),
    card('Agents', o.agents ?? '—', o.agents ? 'People who can take calls' : 'Add agents below so calls can ring someone', !o.agents),
    card('Last 24 hours', o.last24 ? `${o.last24.total} calls` : '—', o.last24 ? `${o.last24.answered} answered · ${o.last24.missed} missed` : ''),
    card('Webhooks', o.webhook.lastCdrAt ? 'Receiving' : 'Nothing received yet', `Last call record ${ago(o.webhook.lastCdrAt)} · last routing request ${ago(o.webhook.lastFlowAt)}`, !o.webhook.lastCdrAt));
  if (o.urls) {
    const copy = (text) => el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); say('Copied.'); } catch { say('Select the address and copy it.', false); } } }, 'Copy');
    $('#setup').replaceChildren(
      el('li', {}, 'TeleCMI → Settings → ', el('strong', {}, 'Webhooks'), ' → Add. Type ', el('strong', {}, 'Call report'), ', method POST, this URL. Then add a second one with type ', el('strong', {}, 'Notify'), ' and the same URL:', el('div', { class: 'url' }, el('code', {}, o.urls.webhook), copy(o.urls.webhook))),
      el('li', {}, 'TeleCMI → call flow for your number → add the ', el('strong', {}, 'HTTP (piopiy) script'), ' step with this URL, so the CRM decides who each call rings (lead owner first):', el('div', { class: 'url' }, el('code', {}, o.urls.flow), copy(o.urls.flow))),
      el('li', {}, 'Add agents below (or in TeleCMI → Settings → User) and link each to a CRM user.'),
      el('li', {}, 'Top up the TeleCMI balance, then call ', el('strong', {}, phone(o.number)), ' to test. The call appears in the Inbox within seconds.'),
      el('li', { class: 'muted' }, 'Keep these URLs private: they contain the webhook key. Don\'t regenerate the App Secret in TeleCMI; the CRM uses the current one.'));
  }
  drawRouting(o.routing);
  const s = o.webhook.lastSync;
  $('#syncInfo').textContent = s ? `Last pull ${ago(s.at)}: ${s.fetched} records checked, ${s.added} added, ${s.known} already filed.` : 'No pull yet.';
}

async function loadLive() {
  const rows = await api('GET', '/telephony/live').catch(() => []);
  $('#live').replaceChildren(...(rows.length ? rows.map((c) => el('li', {},
    el('div', {}, el('div', { class: 'who' }, c.caller?.name || 'New caller'), el('div', { class: 'muted' }, phone(c.from), c.caller?.legacy_lead_id ? ` · lead #${c.caller.legacy_lead_id}` : '', c.caller?.owner_name ? ` · owner ${c.caller.owner_name}` : '')),
    el('span', { class: c.status }, c.status === 'answered' ? `Answered${c.agent ? ` by ${c.agent}` : ''}` : 'Ringing'),
    c.caller?.legacy_lead_id ? el('a', { class: 'btn ghost small', href: `/crm-tools/inbox/?lead=${c.caller.legacy_lead_id}` }, 'Open') : null)) : [el('li', { class: 'empty' }, 'No calls ringing right now.')]));
}

async function loadAgents() {
  let data;
  try { data = await api('GET', '/telephony/agents'); } catch (e) { $('#agents').replaceChildren(el('p', { class: 'muted' }, e.message)); return; }
  users = data.users;
  if (!data.agents.length) { $('#agents').replaceChildren(el('p', { class: 'empty' }, 'No agents yet. Add the people who take calls; their mobile rings when a patient calls.')); return; }
  $('#agents').replaceChildren(el('table', { class: 'agents' },
    el('tr', {}, el('th', {}, 'Agent'), el('th', {}, 'Ext'), el('th', {}, 'Mobile'), el('th', {}, 'CRM user'), el('th', {}, 'Status'), el('th', {}, '')),
    ...data.agents.map((a) => {
      const link = el('select', { 'aria-label': `CRM user for ${a.name}` }, el('option', { value: '' }, 'Not linked'), ...users.map((u) => el('option', { value: String(u.id), selected: a.crm_user?.id === u.id }, u.name)));
      link.addEventListener('change', async () => { try { await api('PUT', `/telephony/agents/${a.agent_id}`, { crmUserId: link.value ? Number(link.value) : null }); say('Link saved.'); } catch (e) { say(e.message, false); loadAgents(); } });
      const status = el('select', { 'aria-label': `Status for ${a.name}` }, ...['online', 'break', 'offline'].map((s) => el('option', { value: s }, s)));
      status.value = 'online';
      status.addEventListener('change', async () => { try { await api('POST', `/telephony/agents/${a.agent_id}/status`, { status: status.value }); say(`${a.name} is now ${status.value}.`); } catch (e) { say(e.message, false); } });
      if (a.seen_only) {
        return el('tr', {}, el('td', {}, a.name, el('div', { class: 'muted' }, `${a.agent_id} · seen on ${a.calls} call${a.calls === 1 ? '' : 's'}${a.team ? ` · team ${a.team.split('_')[0]}` : ''}`)),
          el('td', {}, String(a.extension || '—')), el('td', {}, 'Managed in TeleCMI'), el('td', {}, link), el('td', {}, '—'), el('td', { class: 'muted' }, 'Not listed by TeleCMI\'s API'));
      }
      return el('tr', {}, el('td', {}, a.name, el('div', { class: 'muted' }, a.agent_id)), el('td', {}, String(a.extension)), el('td', {}, a.phone || '—'), el('td', {}, link), el('td', {}, status),
        el('td', {}, el('button', { class: 'btn ghost small', type: 'button', onclick: () => agentForm(a) }, 'Edit'), ' ',
          el('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (!confirm(`Remove ${a.name} from TeleCMI? Calls will stop ringing their phone.`)) return; try { await api('DELETE', `/telephony/agents/${a.agent_id}`); say('Agent removed.'); loadAgents(); loadOverview(); } catch (e) { say(e.message, false); } } }, 'Remove')));
    })));
}

function agentForm(a = null) {
  const f = $('#agentForm'); f.hidden = false;
  const name = el('input', { value: a?.name || '', maxlength: '60', required: true });
  const ext = el('input', { type: 'number', min: '100', max: '999', value: a?.extension || '', required: !a, disabled: Boolean(a) });
  const ph = el('input', { inputmode: 'tel', placeholder: a ? 'Leave blank to keep' : '10-digit mobile', required: !a });
  const pw = el('input', { type: 'password', minlength: '6', placeholder: a ? 'Leave blank to keep' : 'At least 6 characters', required: !a, autocomplete: 'new-password' });
  const user = el('select', {}, el('option', { value: '' }, 'Not linked'), ...users.map((u) => el('option', { value: String(u.id), selected: a?.crm_user?.id === u.id }, u.name)));
  f.replaceChildren(el('h3', {}, a ? `Edit ${a.name}` : 'Add agent'),
    el('div', { class: 'row' }, field('Name', name), field('Extension (3 digits)', ext), field('Mobile (calls ring here)', ph)),
    el('div', { class: 'row' }, field('TeleCMI password', pw), field('CRM user', user)),
    el('p', { class: 'muted' }, 'The agent can also sign in to the TeleCMI app with their extension ID and this password.'),
    el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'submit' }, a ? 'Save' : 'Add agent'), el('button', { class: 'btn ghost', type: 'button', onclick: () => { f.hidden = true; } }, 'Cancel')));
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (a) await api('PUT', `/telephony/agents/${a.agent_id}`, { name: name.value, ...(ph.value ? { phone: ph.value } : {}), ...(pw.value ? { password: pw.value } : {}), crmUserId: user.value ? Number(user.value) : null });
      else await api('POST', '/telephony/agents', { name: name.value, extension: Number(ext.value), phone: ph.value, password: pw.value, crmUserId: user.value ? Number(user.value) : null });
      f.hidden = true; say(a ? 'Agent updated.' : 'Agent added on TeleCMI.'); loadAgents(); loadOverview();
    } catch (err) { say(err.message, false); }
  };
  name.focus();
}

function drawRouting(r) {
  const f = $('#routingForm');
  const owner = el('input', { type: 'checkbox', checked: r.ownerFirst }); owner.style.width = 'auto';
  const rule = el('select', {}, el('option', { value: 'parallel', selected: r.rule === 'parallel' }, 'Ring all agents together'), el('option', { value: 'sequential', selected: r.rule === 'sequential' }, 'Ring agents one after another'));
  const timeout = el('input', { type: 'number', min: '10', max: '90', value: String(r.timeout) });
  const loop = el('input', { type: 'number', min: '1', max: '3', value: String(r.loop) });
  const fbAction = el('select', {}, el('option', { value: '' }, 'None'), el('option', { value: 'ivr', selected: r.fallback?.action === 'ivr' }, 'IVR'), el('option', { value: 'team', selected: r.fallback?.action === 'team' }, 'Team'));
  const fbName = el('input', { value: r.fallback?.name || '', placeholder: 'e.g. welcome@1234567 or reception_1234567' });
  f.replaceChildren(el('label', { class: 'check' }, owner, ' Ring the lead\'s owner first when a known patient calls'),
    el('div', { class: 'row' }, field('New callers', rule), field('Ring time (seconds)', timeout), field('Attempts', loop)),
    el('div', { class: 'row' }, field('If no agent is available, send to', fbAction), field('IVR or team name (from TeleCMI)', fbName)),
    el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'submit' }, 'Save routing')));
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('PUT', '/telephony/routing', { ownerFirst: owner.checked, rule: rule.value, timeout: Number(timeout.value), loop: Number(loop.value), fallback: fbAction.value ? { action: fbAction.value, name: fbName.value } : null }); say('Routing saved.'); }
    catch (err) { say(err.message, false); }
  };
}

async function start() {
  try { await api('GET', '/telephony/agents'); isAdmin = true; } catch (e) { isAdmin = e.status !== 403 ? true : false; }
  document.querySelectorAll('.admin-only').forEach((s) => { s.hidden = !isAdmin; });
  $('#addAgentBtn').addEventListener('click', () => agentForm());
  $('#refresh').addEventListener('click', () => { loadOverview(); loadLive(); if (isAdmin) loadAgents(); });
  $('#syncBtn').addEventListener('click', async () => { const b = $('#syncBtn'); b.disabled = true; say('Pulling call logs from TeleCMI…'); try { const r = await api('POST', '/telephony/logs/refresh', { hours: 24 }); say(`Checked ${r.fetched} records: ${r.added} added, ${r.known} already filed.`); loadOverview(); } catch (e) { say(e.message, false); } finally { b.disabled = false; } });
  await loadOverview(); loadLive(); if (isAdmin) loadAgents();
  setInterval(() => { if (!document.hidden) loadLive(); }, 5000);
  setInterval(() => { if (!document.hidden) loadOverview(); }, 60000);
}
start();
