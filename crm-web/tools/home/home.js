'use strict';
// The CRM dashboard. Shown inside /crm/dashboard (embedded by the overlay, with ?embed=1) and on its own
// at /crm-tools/home/. Every figure comes from GET /api/crm/home, computed one way in one place.
const EMBED = new URLSearchParams(location.search).has('embed');
const toTop = (url) => window.go(url); // /crm-tools/embed.js: app navigation when shown inside the CRM

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
async function api(path, retried) {
  const token = localStorage.getItem('crmToken');
  if (!token) { toTop('/crm/login'); throw new Error('Not signed in'); }
  const res = await fetch(`/api/crm${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) { if (await refreshSession()) return api(path, true); toTop('/crm/login'); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data.data !== undefined ? data.data : data;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') node.className = v; else node.setAttribute(k, v === true ? '' : v); }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
const $ = (s) => document.querySelector(s);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* optional */ } } };
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const mins = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);
const windowLabel = (days) => (Number(days) >= 3650 ? 'All time' : `Last ${days} days`);

// A card. When the value is zero, `empty` replaces the sub-line with what it means or what to do next.
function card(label, value, sub, href, { alert = false, empty = null } = {}) {
  const zero = value === 0 || value === '0';
  const inner = [el('div', { class: 'label' }, label), el('div', { class: 'value big' }, value), el('div', { class: 'sub' }, zero && empty ? empty : sub)];
  return el('div', { class: `card${alert && !zero ? ' alert' : ''}${zero ? ' zero' : ''}` }, href ? el('a', { href }, inner) : inner);
}

function renderJourney(j, days) {
  $('#journeyNote').textContent = `${windowLabel(days)}: leads that arrived in this period, how far they have got. Move a patient along from the Inbox (Journey stage).`;
  if (!j || !j.total) {
    $('#journey').replaceChildren(el('p', { class: 'empty' }, 'No leads arrived in this period yet. Leads from WhatsApp, calls and the website appear here automatically. ',
      el('a', { href: '/crm/leads' }, 'Add a lead')));
    return;
  }
  const rows = j.steps.map((s, i) => {
    const bar = el('span'); bar.style.width = `${Math.max(2, Math.round((s.reached / j.total) * 100))}%`;
    const prev = i ? j.steps[i - 1].reached : null;
    return el('div', { class: 'journey-row' },
      el('span', { class: 'step' }, s.label),
      el('div', { class: 'track' }, bar),
      el('span', { class: 'num' }, String(s.reached)),
      el('span', { class: 'muted rate' }, i ? `${pct(s.reached, prev)} of previous` : 'arrived'),
      el('span', { class: 'muted now' }, s.now ? `${s.now} here now` : ''));
  });
  const visited = j.steps.find((s) => s.key === 'visited')?.reached || 0;
  $('#journey').replaceChildren(...rows, el('p', { class: 'muted foot' },
    `Enquiry to visit: ${pct(visited, j.total)}`, j.lost ? ` · ${j.lost} lost` : '', j.nurture ? ` · ${j.nurture} to follow up later` : ''));
}

async function load() {
  const days = $('#period').value, owner = $('#owner').value;
  store.set('mq-home-days', days); store.set('mq-home-owner', owner);
  let d;
  try { d = await api(`/home?days=${days}&owner=${owner}`); } catch (e) { const b = $('#banner'); b.hidden = false; b.className = 'banner bad'; b.textContent = `Couldn't load: ${e.message}`; return; }
  $('#banner').hidden = true;
  try { const p = await api('/profile'); if (p?.crmUser?.firstName) $('#hello').textContent = `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${p.crmUser.firstName}`; } catch { /* greeting is optional */ }
  $('#owner').hidden = !d.canSwitchOwner;
  const mineView = d.owner === 'me';
  $('#sub').textContent = mineView ? 'Your leads and conversations' : ({ organisation: 'Hospital-wide view', marketing: 'Acquisition and campaigns', personal: 'Your leads and conversations' }[d.scope] || '');

  const m = d.me;
  $('#mine').replaceChildren(
    card('Unread conversations', m.unread_conversations, 'On your leads, every channel', '/crm-tools/inbox/', { alert: true, empty: 'All caught up' }),
    card('Waiting for a first reply', m.awaiting_first_reply, 'Your leads from the last 14 days', '/crm-tools/inbox/?status=open', { alert: true, empty: 'Every new lead has had a reply' }),
    card('Missed calls to return', m.missed_calls_to_return, 'Last 7 days, not called back', '/crm-tools/inbox/', { alert: true, empty: 'No missed calls waiting' }),
    card('Overdue tasks', m.overdue_tasks, 'Scheduled and not completed', '/crm/activities', { alert: true, empty: 'Nothing overdue' }));

  const setup = d.setup;
  const panel = $('#setupPanel');
  panel.hidden = !setup || setup.done >= setup.total;
  if (setup && !panel.hidden) {
    if (!panel.dataset.init) { panel.open = window.innerWidth > 800; panel.dataset.init = '1'; } // collapsed on phones
    $('#setupCount').textContent = `${setup.done} of ${setup.total} done`;
    $('#setup').replaceChildren(...setup.steps.map((s) => el('li', { class: s.done ? 'is-done' : '' }, el('span', { class: 'mark', 'aria-label': s.done ? 'Done' : 'To do' }, s.done ? '✓' : '○'),
      el('span', { class: s.done ? 'done' : '' }, el('a', { href: s.href }, s.label), s.detail || (!s.done && s.hint) ? el('div', { class: 'muted' }, [s.detail, !s.done ? s.hint : null].filter(Boolean).join(' · ')) : null))));
  }

  renderJourney(d.journey, d.days);

  const o = d.org, win = windowLabel(d.days);
  const trend = (now, prev) => { if (!prev || Number(d.days) >= 3650) return null; const ch = Math.round(((now - prev) / prev) * 100); return el('span', { class: `trend ${ch >= 0 ? 'up' : 'down'}` }, `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%`); };
  const orgCards = [card('New leads', o.new_leads ? [String(o.new_leads), trend(o.new_leads, o.new_leads_prev)] : 0, win, '/crm/leads', { empty: `None · ${win.toLowerCase()}` }),
    card('Awaiting first reply', o.awaiting_first_reply, 'Leads from the last 14 days', '/crm-tools/inbox/', { alert: true, empty: 'Every lead has had a reply' })];
  if (d.scope !== 'personal') {
    orgCards.push(card('Median first response', mins(o.median_first_response_min), `${win} · lead arriving to our first reply`),
      card('Messages', o.messages_sent ? `${o.messages_sent} sent` : 0, `${pct(o.messages_delivered, o.messages_sent)} delivered · ${pct(o.messages_read, o.messages_sent)} read · ${o.messages_received} received · ${win.toLowerCase()}`, '/crm-tools/inbox/', { empty: `${o.messages_received} received, none sent · ${win.toLowerCase()}` }),
      card('Calls', o.calls, `${o.missed_calls} missed incoming · ${win.toLowerCase()}`, '/crm-tools/calls/', { empty: `No calls · ${win.toLowerCase()}` }),
      card('Treated and billed', o.converted, win, null, { empty: `None yet · ${win.toLowerCase()}` }));
    if (Number(o.billed_revenue) > 0) orgCards.push(card('Billed revenue', inr(o.billed_revenue), win));
    if (o.open_deals || Number(o.won_value) > 0) orgCards.push(card('Deals', inr(o.open_deal_value), `${o.open_deals} open · ${inr(o.won_value)} won`, '/crm/deals'));
    orgCards.push(card('Campaigns running', o.active_campaigns, 'Engage, right now', '/crm-tools/engage/', { empty: 'None running · start one in Engage' }));
  } else {
    orgCards.push(card('Calls', o.calls, win, '/crm-tools/inbox/', { empty: `No calls · ${win.toLowerCase()}` }),
      card('Missed calls', o.missed_calls, win, '/crm-tools/inbox/', { alert: true, empty: 'None missed' }));
  }
  $('#org').replaceChildren(...orgCards);
  $('#orgH').textContent = mineView || d.scope === 'personal' ? 'My figures' : 'Hospital overview';
  $('#orgNote').textContent = `${win}, unless a card says otherwise.`;

  $('#sourcesPanel').hidden = !d.sources.length;
  $('#srcNote').textContent = win;
  const max = Math.max(1, ...d.sources.map((s) => s.leads));
  $('#sources').replaceChildren(...d.sources.map((s) => { const bar = el('span'); bar.style.width = `${Math.round((s.leads / max) * 100)}%`; return el('div', { class: 'bar-row' }, el('span', {}, s.source.replace(/[-_]/g, ' ')), el('div', { class: 'track' }, bar), el('span', {}, String(s.leads))); }));
  $('#reports').replaceChildren(...d.reports.map((r) => el('li', {}, el('a', { href: r.path }, r.label))));

  $('#teamPanel').hidden = !d.team;
  if (d.team) $('#team').replaceChildren(el('table', { class: 'team' },
    el('tr', {}, el('th', {}, 'Person'), el('th', {}, 'Role'), el('th', {}, 'Open leads'), el('th', {}, 'Awaiting reply'), el('th', {}, 'Median response'), el('th', {}, 'Converted')),
    ...d.team.map((t) => el('tr', {}, el('td', {}, t.name || '—'), el('td', {}, String(t.role || '—').replace(/_/g, ' ')), el('td', {}, String(t.open_leads)), el('td', {}, String(t.awaiting_reply)), el('td', {}, mins(t.median_response_min)), el('td', {}, String(t.converted))))));
}

const savedDays = store.get('mq-home-days'), savedOwner = store.get('mq-home-owner');
if (savedDays && [...$('#period').options].some((o) => o.value === savedDays)) $('#period').value = savedDays;
if (savedOwner === 'me' || savedOwner === 'all') $('#owner').value = savedOwner;
$('#period').addEventListener('change', load);
$('#owner').addEventListener('change', load);
load();
setInterval(() => { if (!document.hidden) load(); }, 60000);
