'use strict';
// Inbox: a three-pane workspace. Queue of conversations (one per lead) | timeline of every channel |
// the patient: journey, next step, tasks and details. Reuses the CRM session (localStorage crmToken /
// crmRefreshToken). Everything is rendered with textContent, never as HTML; no inline styles (CSP).

const LIST_POLL_MS = 10000;
const THREAD_POLL_MS = 5000;
const WAIT_ALERT_MIN = 30; // a patient waiting longer than this is shown in red
const CH_LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', call: 'Call', note: 'Note' };
const STAGE_LABEL = {
  new: 'New enquiry', attempting_contact: 'Trying to reach', contacted: 'Contacted', qualified: 'Qualified',
  appointment_requested: 'Appointment requested', appointment_booked: 'Appointment booked', appointment_confirmed: 'Appointment confirmed',
  visited: 'Visited', consulted: 'Consulted doctor', investigation_advised: 'Tests advised', procedure_advised: 'Procedure advised',
  admission_advised: 'Admission advised', billing_completed: 'Treated and billed', won: 'Treated and billed',
  nurture: 'Follow up later', lost: 'Lost', dormant: 'Dormant', duplicate: 'Duplicate',
};
// The five steps a front office tracks; each groups the detailed stages.
const STEPS = [
  { key: 'enquiry', label: 'Enquiry', stage: 'new', stages: ['new', 'attempting_contact'] },
  { key: 'contacted', label: 'Contacted', stage: 'contacted', stages: ['contacted', 'qualified'] },
  { key: 'booked', label: 'Booked', stage: 'appointment_booked', stages: ['appointment_requested', 'appointment_booked', 'appointment_confirmed'] },
  { key: 'visited', label: 'Visited', stage: 'visited', stages: ['visited', 'consulted', 'investigation_advised', 'procedure_advised', 'admission_advised'] },
  { key: 'treated', label: 'Treated', stage: 'billing_completed', stages: ['billing_completed', 'won'] },
];
const OFF_TRACK = ['lost', 'dormant', 'duplicate', 'nurture'];
const state = { status: 'open', channel: '', assigned: '', search: '', due: false, activeId: null, me: null, sig: '',
  templates: null, reply: null, templateMode: false, channels: {}, lead: null, show: 'all', events: [], tasks: [] };

// ── API with token refresh (refresh rotates both tokens, so both are written back) ──
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
  const res = await fetch(`/api/crm${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return api(method, path, body, true);
    go('/crm/login'); throw new Error('Session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.code === 'integration_not_configured' ? 'Sending is switched off on this installation.' : (data.message || `Request failed (${res.status})`));
  }
  return data.data !== undefined ? data.data : data;
}

// ── DOM helpers: text only ──
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
const $ = (sel) => document.querySelector(sel);
const time = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
// Dates people act on need their day: "12:22 pm" alone reads as already past.
function when(t) {
  if (!t) return '';
  const d = new Date(t), diff = Math.round((dayStart(d) - dayStart(new Date())) / 86400000);
  if (diff === 0) return `today ${time(t)}`;
  if (diff === 1) return `tomorrow ${time(t)}`;
  if (diff === -1) return `yesterday ${time(t)}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time(t)}`;
}
const joined = (...parts) => parts.filter(Boolean).join(' · ');
const day = (t) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
function shortTime(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return time(t);
  if (now - d < 6 * 864e5) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function waited(t) {
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
  return { m, label: m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d` };
}
function phoneLabel(p) { const d = String(p || '').replace(/\D/g, ''); if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`; if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`; return d ? `+${d}` : ''; }
const chTag = (ch) => el('span', { class: `ch ${ch}` }, CH_LABEL[ch] || ch);
const initials = (name) => String(name || '?').replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const tone = (s) => `t${[...String(s || '')].reduce((a, c) => (a + c.charCodeAt(0)) % 6, 0)}`;
const stepOf = (stage) => STEPS.findIndex((s) => s.stages.includes(stage));
function stageChip(stage) {
  const off = OFF_TRACK.includes(stage);
  return el('span', { class: `stage-chip ${off ? 'off' : `s${Math.max(0, stepOf(stage))}`}` }, STAGE_LABEL[stage] || 'New enquiry');
}
function banner(text, kind = 'warn') { const b = $('#banner'); b.hidden = !text; b.textContent = text || ''; b.className = `banner inbox-banner ${kind}`; }
let resultTimer;
function result(text, ok) {
  const r = $('#sendResult'); r.textContent = text || ''; r.className = `result ${ok ? 'good' : 'bad'}`;
  clearTimeout(resultTimer); if (text && ok) resultTimer = setTimeout(() => { r.textContent = ''; }, 5000);
}
function setView(view) { $('#inbox').dataset.view = view; }
const toLocalInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

// ── queue ──
async function loadList() {
  const qs = new URLSearchParams({ status: state.status });
  if (state.channel) qs.set('channel', state.channel);
  if (state.assigned) qs.set('assigned', state.assigned);
  if (state.search) qs.set('search', state.search);
  if (state.due) qs.set('due', '1');
  try {
    const data = await api('GET', `/inbox?${qs}`);
    if (!$('#banner').dataset.live) banner('');
    state.channels = data.channels || state.channels;
    $('#countOpen').textContent = data.counts?.open ?? 0;
    $('#countPending').textContent = data.counts?.pending ?? 0;
    $('#countClosed').textContent = data.counts?.closed ?? 0;
    $('#countDue').textContent = data.counts?.due ?? 0;
    $('#dueChip').classList.toggle('alert', Boolean(data.counts?.due));
    document.title = data.counts?.unread ? `(${data.counts.unread}) Inbox · Medstar CRM` : 'Inbox · Medstar CRM';
    renderList(data.conversations || []);
  } catch (error) { banner(`Couldn't load conversations: ${error.message}`, 'bad'); }
}
function renderList(items) {
  const list = $('#convoList');
  if (!items.length) {
    const what = state.channel ? `${CH_LABEL[state.channel]} ` : '';
    const label = { open: 'open', pending: 'waiting', closed: 'done' }[state.status];
    list.replaceChildren(el('li', { class: 'list-empty' }, state.search ? 'No conversations match your search.' : state.due ? 'No follow-ups due. Nice.' : `No ${label} ${what}conversations.`));
    return;
  }
  list.replaceChildren(...items.map((c) => {
    const preview = c.last_message ? `${c.last_direction === 'outbound' ? 'You: ' : ''}${c.last_message}` : (c.last_channel === 'call' ? 'Call' : 'No messages yet');
    const w = c.waiting_since ? waited(c.waiting_since) : null;
    const li = el('li', { class: `convo${String(c.lead_id) === String(state.activeId) ? ' active' : ''}${c.unread ? ' unread' : ''}`, tabindex: '0', role: 'button',
      'aria-label': `${c.name}${c.unread ? `, ${c.unread} unread` : ''}${w ? `, waiting ${w.label}` : ''}` },
      el('span', { class: `avatar ${tone(c.name)}`, 'aria-hidden': 'true' }, initials(c.name)),
      el('div', { class: 'c-main' },
        el('div', { class: 'c-top' },
          el('span', { class: 'name' }, c.name),
          w ? el('span', { class: `wait${w.m >= WAIT_ALERT_MIN ? ' late' : ''}`, title: `Waiting for a reply since ${when(c.waiting_since)}` }, `⏱ ${w.label}`)
            : el('span', { class: 'time' }, shortTime(c.last_at))),
        el('div', { class: 'preview' }, c.last_channel ? chTag(c.last_channel) : null, ' ', preview),
        el('div', { class: 'c-meta' }, stageChip(c.lifecycle_stage),
          ['high', 'urgent'].includes(c.priority) ? el('span', { class: `prio ${c.priority}` }, c.priority === 'urgent' ? 'Urgent' : 'High') : null,
          c.due ? el('span', { class: 'due-tag', title: c.next_action || 'Follow-up due' }, 'Due') : null,
          el('span', { class: 'owner' }, c.assigned_to_name || 'Unassigned'))),
      c.unread ? el('span', { class: 'unread-dot', 'aria-hidden': 'true' }, String(c.unread)) : null);
    li.addEventListener('click', () => openThread(c.lead_id));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openThread(c.lead_id); } });
    return li;
  }));
}

// ── conversation ──
async function openThread(id) {
  state.activeId = String(id); state.sig = ''; state.reply = null; state.templateMode = false;
  for (const f of ['#contactForm', '#followupForm', '#apptForm']) $(f).hidden = true;
  $('#emptyThread').hidden = true; $('#thread').hidden = false; $('#patientPane').hidden = false;
  setView('thread');
  result('');
  history.replaceState(null, '', `#lead=${id}`);
  window.mqSyncUrl?.(`#lead=${id}`); // inside the CRM: keep the app's address on this conversation
  await loadThread(true);
  loadList();
}
async function loadThread(scroll) {
  if (!state.activeId) return;
  const id = state.activeId;
  let data;
  try { data = await api('GET', `/inbox/${id}`); } catch (error) { result(error.message, false); return; }
  if (id !== state.activeId) return;
  const lead = data.lead; state.lead = lead; state.channels = data.channels || state.channels; state.tasks = data.tasks || [];
  $('#threadName').textContent = lead.name || 'Unnamed lead';
  $('#threadSub').replaceChildren(stageChip(lead.lifecycle_stage), el('span', { class: 'meta-text' }, joined(phoneLabel(lead.phone), lead.assigned_to_name ? `Owner ${lead.assigned_to_name}` : 'Unassigned')),
    lead.phone ? el('span', { class: `win ${lead.window.open ? 'open' : 'closed'}` }, lead.window.open ? `WhatsApp open until ${when(lead.window.closesAt)}` : 'WhatsApp: template only') : null);
  document.querySelectorAll('[data-set-status]').forEach((b) => { const on = b.dataset.setStatus === lead.status; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  const callBtn = $('#callBtn');
  callBtn.disabled = !state.telephony?.canCall || !lead.phone;
  callBtn.title = !lead.phone ? 'No mobile number on this lead' : (state.telephony?.canCall ? `Call ${phoneLabel(lead.phone)} through TeleCMI` : (state.telephony?.reason || 'Calling is not available'));
  renderPatient(lead, data.summary || {});
  setupComposer(data.events.filter((e) => e.channel !== 'system'));

  const sig = JSON.stringify([state.show, data.events.map((e) => [e.key, e.status])]);
  if (sig === state.sig) return;
  state.sig = sig; state.events = data.events;
  renderTimeline(scroll);
}
const SHOW = {
  all: () => true,
  messages: (e) => ['whatsapp', 'sms', 'email'].includes(e.channel),
  calls: (e) => e.channel === 'call',
  notes: (e) => e.channel === 'note',
  activity: (e) => e.channel === 'system' || e.channel === 'note',
};
function renderTimeline(scroll) {
  const box = $('#messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const events = state.events.filter(SHOW[state.show] || SHOW.all);
  const nodes = []; let lastDay = '';
  for (const e of events) {
    const d = day(e.at);
    if (d !== lastDay) { nodes.push(el('li', { class: 'day' }, d)); lastDay = d; }
    nodes.push(renderEvent(e));
  }
  if (!events.length) nodes.push(el('li', { class: 'day' }, state.show === 'all' ? 'No messages yet' : 'Nothing of this kind yet'));
  box.replaceChildren(...nodes);
  if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
}
function renderEvent(e) {
  if (e.channel === 'system') {
    const text = e.kind === 'stage'
      ? `Journey stage: ${STAGE_LABEL[e.from_stage] || e.from_stage || 'New'} → ${STAGE_LABEL[e.to_stage] || e.to_stage}`
      : `✓ Task done: ${e.subject || ''}`;
    return el('li', { class: 'sys' }, el('span', {}, text), el('span', { class: 'muted' }, joined(e.by_name, time(e.at))));
  }
  if (e.channel === 'note') {
    return el('li', { class: 'msg note' }, el('div', { class: 'head' }, chTag('note'), ' ', joined(e.by_name || 'Team', time(e.at))), e.body || e.subject || '');
  }
  if (e.channel === 'call') {
    const missed = e.status === 'missed' || (e.meta && e.meta.answered === false);
    const label = e.direction === 'inbound' ? (missed ? 'Missed call' : 'Incoming call') : (missed ? 'Outgoing call · not answered' : 'Outgoing call');
    const play = e.meta?.recording ? el('button', { class: 'btn ghost small', type: 'button', onclick: (ev) => playRecording(ev.currentTarget, e.key) }, '▶ Play recording') : null;
    return el('li', { class: `msg call${missed && e.direction === 'inbound' ? ' failed' : ''}` }, el('div', { class: 'head' }, chTag('call'), ' ', joined(label, time(e.at))),
      el('div', { class: 'call-body' }, el('span', {}, e.body || e.status || ''), play),
      e.by_name ? el('div', { class: 'foot' }, e.direction === 'outbound' ? e.by_name : `Answered by ${e.by_name}`) : null);
  }
  const outbound = e.direction === 'outbound';
  const status = outbound ? ({ read: 'Read', delivered: 'Delivered', sent: 'Sent', failed: 'Not delivered', queued: 'Sending' }[e.status] || e.status || '') : '';
  return el('li', { class: `msg ${outbound ? 'outbound' : 'inbound'}${e.status === 'failed' ? ' failed' : ''}` },
    el('div', { class: 'head' }, chTag(e.channel), e.template_name ? `Template · ${e.template_name}` : null),
    e.subject && e.channel === 'email' ? el('div', { class: 'subj' }, e.subject) : null,
    e.body || (e.kind && e.kind !== 'message' ? `[${e.kind}]` : ''),
    e.failure_reason ? el('div', { class: 'err' }, e.failure_reason) : null,
    el('div', { class: 'foot' }, joined(outbound && e.by_name ? e.by_name : null, time(e.at), status || null)));
}
async function playRecording(button, key) {
  button.disabled = true; button.textContent = 'Loading…';
  try {
    const token = localStorage.getItem('crmToken');
    const res = await fetch(`/api/crm/inbox/${state.activeId}/recording/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Recording unavailable (${res.status})`);
    button.replaceWith(el('audio', { controls: true, autoplay: true, src: URL.createObjectURL(await res.blob()) }));
  } catch (error) { button.disabled = false; button.textContent = '▶ Play recording'; result(error.message, false); }
}

// ── patient ──
function renderPatient(lead, summary) {
  const name = lead.name || 'Unnamed lead';
  const av = $('#pAvatar'); av.textContent = initials(name); av.className = `avatar big ${tone(name)}`;
  $('#pName').textContent = name;
  $('#pContact').textContent = [phoneLabel(lead.phone), lead.email].filter(Boolean).join(' · ') || 'No contact details';
  $('#pOwner').textContent = lead.assigned_to_name ? `Owner: ${lead.assigned_to_name}` : 'No owner yet';
  $('#assignMe').hidden = state.me != null && Number(lead.assigned_to) === Number(state.me);
  if (document.activeElement !== $('#pPriority')) $('#pPriority').value = lead.priority || 'medium';

  // Journey stepper
  const stage = lead.lifecycle_stage || 'new', at = stepOf(stage), off = OFF_TRACK.includes(stage);
  $('#stepper').replaceChildren(...STEPS.map((s, i) => el('li', { class: `step${!off && i < at ? ' done' : ''}${!off && i === at ? ' current' : ''}` },
    el('button', { type: 'button', 'aria-current': !off && i === at ? 'step' : null, title: i === 2 ? 'Book an appointment' : `Move to ${s.label}`,
      onclick: () => (i === 2 ? openForm('#apptForm') : setStage(s.stage)) }, el('span', { class: 'dot' }, !off && i < at ? '✓' : String(i + 1)), el('span', { class: 'lbl' }, s.label)))));
  $('#stepper').classList.toggle('off', off);
  const sel = $('#stageSelect');
  if (!sel.querySelector(`option[value="${stage}"]`)) sel.append(el('option', { value: stage }, STAGE_LABEL[stage] || stage));
  if (document.activeElement !== sel) sel.value = stage;

  // Next step and tasks
  const open = state.tasks.filter((t) => !t.completed_at), done = state.tasks.filter((t) => t.completed_at);
  const next = open[0];
  const overdue = (t) => t.due_at && new Date(t.due_at) < new Date();
  $('#nextLine').replaceChildren(next
    ? el('span', { class: overdue(next) ? 'late' : '' }, `${next.title}${next.due_at ? ` · ${when(next.due_at)}` : ''}${overdue(next) ? ' (overdue)' : ''}`)
    : el('span', { class: 'muted' }, 'Nothing scheduled. Add a follow-up so this patient isn\'t forgotten.'));
  const taskRow = (t) => el('li', { class: `task${t.completed_at ? ' done' : ''}${!t.completed_at && overdue(t) ? ' late' : ''}` },
    el('button', { class: 'check', type: 'button', 'aria-label': t.completed_at ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`, 'aria-pressed': String(Boolean(t.completed_at)),
      onclick: () => toggleTask(t) }, t.completed_at ? '✓' : ''),
    el('div', { class: 't-body' }, el('div', { class: 't-title' }, t.title),
      el('div', { class: 't-meta' }, joined(t.completed_at ? `Done ${when(t.completed_at)}` : (t.due_at ? `Due ${when(t.due_at)}` : 'No due date'), t.by_name))));
  $('#taskList').replaceChildren(...(open.length ? open.map(taskRow) : [el('li', { class: 'muted empty-line' }, 'No open tasks.')]),
    ...(done.length ? [el('li', { class: 'done-head muted' }, `Done in the last 30 days (${done.length})`), ...done.slice(0, 5).map(taskRow)] : []));

  // Details
  const fact = (k, v, href) => [el('dt', {}, k), el('dd', {}, href ? el('a', { href }, v) : (v || '—'))];
  const consent = { granted: 'Agreed to messages', denied: 'Declined messages', withdrawn: 'Withdrew consent' }[lead.consent_status] || 'Not recorded';
  $('#facts').replaceChildren(
    ...fact('Mobile', phoneLabel(lead.phone)), ...fact('Email', lead.email), ...fact('City', lead.city),
    ...fact('Language', lead.preferred_language), ...fact('Source', String(lead.source || '').replace(/[-_]/g, ' ')),
    ...(lead.referring_doctor ? fact('Referred by', lead.referring_doctor, `/crm/doctors/${lead.referring_doctor_id}`) : []),
    ...fact('Lead', `#${lead.legacy_lead_id} on the Leads page`, `/crm/leads?open=${lead.legacy_lead_id}`),
    ...fact('First contact', when(summary.first_contact_at || lead.created_at)),
    ...fact('Our last reply', summary.last_contact_at ? when(summary.last_contact_at) : 'Not yet'),
    ...fact('Consent', consent));
  $('#stats').replaceChildren(
    el('div', { class: 'stat' }, el('b', {}, String(summary.messages ?? 0)), el('span', {}, 'messages')),
    el('div', { class: 'stat' }, el('b', {}, String(summary.calls ?? 0)), el('span', {}, summary.missed_calls ? `calls · ${summary.missed_calls} missed` : 'calls')),
    el('div', { class: 'stat' }, el('b', {}, String(summary.notes ?? 0)), el('span', {}, 'notes')));
}
function openForm(sel) {
  for (const f of ['#followupForm', '#apptForm', '#contactForm']) if (f !== sel) $(f).hidden = true;
  const f = $(sel); f.hidden = !f.hidden;
  if (!f.hidden) {
    if (sel === '#followupForm' && !$('#fuWhen').value) { const d = new Date(Date.now() + 3600e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); $('#fuWhen').value = toLocalInput(d); }
    if (sel === '#apptForm' && !$('#apWhen').value) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); $('#apWhen').value = toLocalInput(d); }
    f.querySelector('input')?.focus();
  }
  if (window.matchMedia('(max-width: 1099px)').matches) setView('patient');
}
async function setStage(stage) {
  try { await api('POST', `/inbox/${state.activeId}/stage`, { stage }); result(`Journey stage: ${STAGE_LABEL[stage] || stage}.`, true); state.sig = ''; await loadThread(); loadList(); }
  catch (error) { result(error.message, false); loadThread(); }
}
async function toggleTask(t) {
  try { await api('PATCH', `/inbox/tasks/${t.id}`, { done: !t.completed_at }); result(t.completed_at ? 'Task reopened.' : `Done: ${t.title}.`, true); state.sig = ''; await loadThread(); loadList(); }
  catch (error) { result(error.message, false); }
}

// ── composer ──
function setupComposer(events) {
  if (!state.reply) {
    // Default to the channel the patient last used, if it can be replied on.
    const lastInbound = [...events].reverse().find((e) => e.direction === 'inbound' && ['whatsapp', 'sms', 'email'].includes(e.channel));
    const pref = lastInbound?.channel || (state.lead.phone ? 'whatsapp' : 'email');
    state.reply = state.channels[pref]?.live ? pref : (['whatsapp', 'sms', 'email'].find((c) => state.channels[c]?.live) || 'note');
  }
  document.querySelectorAll('[data-reply]').forEach((b) => {
    const ch = b.dataset.reply;
    const usable = ch === 'note' || (state.channels[ch]?.live && (ch === 'email' ? Boolean(state.lead.email) : Boolean(state.lead.phone)));
    b.disabled = !usable;
    b.title = usable ? '' : (ch === 'email' && !state.lead.email ? 'No email address on this lead' : (!state.channels[ch]?.live ? `${CH_LABEL[ch]} is not connected` : 'No mobile number on this lead'));
    b.classList.toggle('active', ch === state.reply);
  });
  const wa = state.reply === 'whatsapp';
  const mustTemplate = wa && !state.lead.window.open;
  const templateMode = wa && (state.templateMode || mustTemplate);
  $('#replySubject').hidden = state.reply !== 'email';
  $('#textMode').hidden = templateMode;
  $('#templateMode').hidden = !templateMode;
  $('#toggleTemplate').hidden = !wa || mustTemplate;
  // Quick answers insert into a free-text reply; an approved template cannot be edited.
  $('#quickBtn').hidden = templateMode;
  if (templateMode) { $('#quickPop').hidden = true; $('#quickBtn').setAttribute('aria-expanded', 'false'); }
  $('#toggleTemplate').textContent = templateMode ? 'Write a message instead' : 'Use a template';
  $('#sendBtn').textContent = state.reply === 'note' ? 'Add note' : (templateMode ? 'Send template' : 'Send');
  $('#composer').classList.toggle('note-mode', state.reply === 'note');
  $('#replyText').placeholder = state.reply === 'note' ? 'Write an internal note for the team (not sent to the patient)…' : 'Type a reply… (Enter to send, Shift+Enter for a new line)';
  $('#channelHint').textContent = state.reply === 'note' ? 'Visible to the CRM team only'
    : wa ? (state.lead.window.open ? `Free text allowed until ${when(state.lead.window.closesAt)}` : 'More than 24 hours since the patient wrote: approved templates only')
    : `Sends to ${state.reply === 'email' ? state.lead.email : phoneLabel(state.lead.phone)}`;
  $('#templateHint').textContent = mustTemplate ? 'WhatsApp only allows an approved template until the patient writes again.' : 'Pick an approved template and fill in its values.';
  if (templateMode) ensureTemplates();
}
async function ensureTemplates() {
  if (!state.templates) {
    try { state.templates = (await api('GET', '/whatsapp/templates?sync=false')).filter((t) => t.status === 'approved'); }
    catch (error) { state.templates = []; result(`Couldn't load templates: ${error.message}`, false); }
    const pick = $('#templatePick');
    pick.replaceChildren(el('option', { value: '' }, state.templates.length ? 'Choose an approved template…' : 'No approved templates'),
      ...state.templates.map((t) => el('option', { value: String(t.id) }, `${String(t.family || t.name).replace(/^medstar_/, '').replace(/_/g, ' ')} · ${t.language || t.language_code}`)));
  }
  renderTemplate();
}
function renderTemplate() {
  const t = (state.templates || []).find((x) => String(x.id) === $('#templatePick').value);
  const params = $('#templateParams');
  if (!t) { $('#templatePreview').textContent = ''; params.replaceChildren(); return; }
  const count = Number(t.metadata?.placeholders) || (String(t.body).match(/\{\{\d+\}\}/g) || []).length;
  const names = t.metadata?.variableNames || [];
  if (params.dataset.for !== String(t.id)) {
    const fields = [];
    for (let i = 1; i <= count; i += 1) {
      const label = String(names[i - 1] || `Value ${i}`).replace(/_/g, ' ');
      fields.push(el('label', {}, `{{${i}}} ${label}`, el('input', { 'data-param': String(i), maxlength: '200', oninput: renderTemplate })));
    }
    params.replaceChildren(...fields);
    params.dataset.for = String(t.id);
    const first = params.querySelector('[data-param="1"]');
    if (first && /name/i.test(names[0] || '') && state.lead?.name && !/^WhatsApp /.test(state.lead.name)) first.value = state.lead.name;
  }
  const values = [...params.querySelectorAll('input')].map((i) => i.value.trim());
  $('#templatePreview').textContent = String(t.body).replace(/\{\{(\d+)\}\}/g, (m, n) => values[n - 1] || m);
}
async function send(e) {
  e.preventDefault();
  if (!state.activeId) return;
  const btn = $('#sendBtn');
  const templateMode = !$('#templateMode').hidden;
  const body = { channel: state.reply };
  if (templateMode) {
    body.templateId = Number($('#templatePick').value);
    body.params = [...$('#templateParams').querySelectorAll('input')].map((i) => i.value.trim());
    if (!body.templateId) return result('Choose a template first.', false);
    if (body.params.some((p) => !p)) return result('Fill in every value.', false);
  } else {
    body.text = $('#replyText').value.trim();
    if (!body.text) return result(state.reply === 'note' ? 'Write the note first.' : 'Type a message.', false);
    if (state.reply === 'email') body.subject = $('#replySubject').value.trim() || 'Medstar Hospitals';
  }
  btn.disabled = true; result(state.reply === 'note' ? 'Saving…' : 'Sending…', true);
  try {
    await api('POST', `/inbox/${state.activeId}/send`, body);
    if (!templateMode) $('#replyText').value = '';
    result(state.reply === 'note' ? 'Note added.' : `${templateMode ? 'Template' : CH_LABEL[state.reply]} sent.`, true);
    state.templateMode = false;
    await loadThread(true); loadList();
  } catch (error) { result(error.message, false); }
  finally { btn.disabled = false; }
}

// ── wiring ──
let quickAnswers = null;
async function toggleQuick() {
  const pop = $('#quickPop');
  const open = pop.hidden;
  pop.hidden = !open;
  $('#quickBtn').setAttribute('aria-expanded', String(open));
  if (!open) return;
  if (!quickAnswers) {
    try { quickAnswers = (await api('GET', '/call-centre/quick-answers')).items.filter((x) => x.active !== false); }
    catch (error) { quickAnswers = []; banner(error.message, 'bad'); }
  }
  $('#quickSearch').value = '';
  renderQuick();
  $('#quickSearch').focus();
}
function renderQuick() {
  const q = $('#quickSearch').value.trim().toLowerCase();
  const items = (quickAnswers || []).filter((x) => !q || `${x.title} ${x.body} ${x.category}`.toLowerCase().includes(q))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'answer' ? -1 : 1));
  const list = $('#quickList');
  list.replaceChildren(...(items.length ? items.map((x) => el('li', {}, el('button', { type: 'button', onclick: () => useQuick(x) },
    el('span', { class: 'q-cat' }, `${x.kind === 'script' ? 'Script' : 'Answer'} · ${x.category}`), el('span', { class: 'q-title' }, x.title), el('span', { class: 'q-body' }, x.body))))
    : [el('li', { class: 'muted small-text' }, quickAnswers?.length ? 'Nothing matches.' : 'No quick answers yet. A Business Head adds them in Call centre → Scripts and answers.')]));
}
function useQuick(x) {
  if (!$('#textMode').hidden) {
    const t = $('#replyText');
    const at = t.selectionStart ?? t.value.length;
    t.value = t.value.slice(0, at) + x.body + t.value.slice(t.selectionEnd ?? at);
    t.focus();
    t.selectionStart = t.selectionEnd = at + x.body.length;
  } else {
    navigator.clipboard?.writeText(x.body).catch(() => {});
    banner('Templates cannot be edited, so the answer was copied instead.', 'ok');
  }
  api('POST', `/call-centre/quick-answers/${x.id}/used`, {}).catch(() => {});
  toggleQuick();
}

function wire() {
  document.querySelectorAll('[data-status]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-status]').forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
    state.status = tab.dataset.status; loadList();
  }));
  document.querySelectorAll('[data-channel]').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('[data-channel]').forEach((c) => c.classList.toggle('active', c === chip));
    state.channel = chip.dataset.channel; loadList();
  }));
  $('#dueChip').addEventListener('click', () => { state.due = !state.due; $('#dueChip').classList.toggle('active', state.due); $('#dueChip').setAttribute('aria-pressed', String(state.due)); loadList(); });
  document.querySelectorAll('[data-show]').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('[data-show]').forEach((c) => c.classList.toggle('active', c === chip));
    state.show = chip.dataset.show; state.sig = ''; renderTimeline(true);
  }));
  document.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', () => { state.reply = b.dataset.reply; state.templateMode = false; result(''); loadThread(); }));
  let searchTimer;
  $('#search').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = e.target.value.trim(); loadList(); }, 300); });
  $('#assigned').addEventListener('change', (e) => { state.assigned = e.target.value; loadList(); });
  $('#composer').addEventListener('submit', send);
  $('#replyText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } });
  $('#templatePick').addEventListener('change', renderTemplate);
  $('#toggleTemplate').addEventListener('click', () => { state.templateMode = !state.templateMode; loadThread(); });
  // Quick answers: the call centre's scripts and answers, inserted into the reply at the cursor.
  $('#quickBtn').addEventListener('click', toggleQuick);
  $('#quickSearch').addEventListener('input', renderQuick);
  $('#quickSearch').addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleQuick(); });
  document.querySelectorAll('[data-set-status]').forEach((b) => b.addEventListener('click', async () => {
    const status = b.dataset.setStatus;
    try { await api('PATCH', `/inbox/${state.activeId}/status`, { status }); result({ open: 'Reopened.', pending: 'Marked waiting on the patient.', closed: 'Marked done.' }[status], true); loadThread(); loadList(); }
    catch (error) { result(error.message, false); }
  }));
  $('#stageSelect').addEventListener('change', (e) => setStage(e.target.value));
  $('#pPriority').addEventListener('change', async (e) => {
    try { await api('PATCH', `/inbox/${state.activeId}/fields`, { priority: e.target.value }); result(`Priority: ${e.target.selectedOptions[0].textContent}.`, true); loadList(); }
    catch (error) { result(error.message, false); loadThread(); }
  });
  $('#assignMe').addEventListener('click', async () => {
    try { await api('PATCH', `/inbox/${state.activeId}/assign`, { userId: 'me' }); result('Assigned to you. You are now the lead owner.', true); loadThread(); loadList(); }
    catch (error) { result(error.message, false); }
  });
  $('#followupBtn').addEventListener('click', () => openForm('#followupForm'));
  $('#apptBtn').addEventListener('click', () => openForm('#apptForm'));
  document.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { b.closest('form').hidden = true; }));
  document.querySelectorAll('#followupForm [data-in], #followupForm [data-tomorrow], #followupForm [data-days]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date();
    if (b.dataset.in) d.setMinutes(d.getMinutes() + Number(b.dataset.in), 0, 0);
    if (b.dataset.tomorrow) { d.setDate(d.getDate() + 1); d.setHours(Number(b.dataset.tomorrow), 0, 0, 0); }
    if (b.dataset.days) { d.setDate(d.getDate() + Number(b.dataset.days)); d.setHours(10, 0, 0, 0); }
    $('#fuWhen').value = toLocalInput(d);
  }));
  $('#followupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const due = new Date($('#fuWhen').value);
    try {
      await api('POST', `/inbox/${state.activeId}/tasks`, { title: $('#fuTitle').value, dueAt: due.toISOString() });
      $('#followupForm').hidden = true; $('#fuWhen').value = ''; result(`Follow-up added: ${$('#fuTitle').value}, ${when(due)}.`, true);
      state.sig = ''; await loadThread(); loadList();
    } catch (error) { result(error.message, false); }
  });
  $('#apptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date($('#apWhen').value);
    try {
      await api('POST', `/inbox/${state.activeId}/appointment`, { at: at.toISOString(), note: $('#apNote').value });
      $('#apptForm').hidden = true; $('#apWhen').value = ''; $('#apNote').value = '';
      result(`Appointment booked for ${when(at)}.`, true); state.sig = ''; await loadThread(); loadList();
    } catch (error) { result(error.message, false); }
  });
  $('#editContact').addEventListener('click', () => {
    const f = $('#contactForm');
    if (!f.hidden) { f.hidden = true; return; }
    const l = state.lead || {};
    $('#cfName').value = l.name || ''; $('#cfPhone').value = l.phone || ''; $('#cfEmail').value = l.email || ''; $('#cfCity').value = l.city || '';
    openForm('#contactForm'); $('#cfName').focus();
  });
  $('#cfCancel').addEventListener('click', () => { $('#contactForm').hidden = true; });
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: $('#cfName').value, phone: $('#cfPhone').value, email: $('#cfEmail').value };
    if ($('#cfCity').value.trim()) body.city = $('#cfCity').value;
    try {
      const r = await api('PATCH', `/inbox/${state.activeId}/contact`, body);
      $('#contactForm').hidden = true;
      result(r.changed?.length ? `Saved: ${r.changed.join(', ')}.` : 'No changes.', true);
      state.sig = ''; await loadThread(); loadList();
    } catch (error) { result(error.message, false); }
  });
  $('#callBtn').addEventListener('click', async () => {
    const btn = $('#callBtn'); btn.disabled = true; result('Placing call…', true);
    try { const r = await api('POST', `/inbox/${state.activeId}/call`); result(r.message || 'Calling…', true); }
    catch (error) { result(error.message, false); }
    finally { setTimeout(() => { btn.disabled = !state.telephony?.canCall; }, 4000); }
  });
  $('#patientToggle').addEventListener('click', () => setView($('#inbox').dataset.view === 'patient' ? 'thread' : 'patient'));
  $('#patientClose').addEventListener('click', () => setView('thread'));
  $('#backToList').addEventListener('click', () => {
    setView('list'); state.activeId = null; $('#thread').hidden = true; $('#patientPane').hidden = true; $('#emptyThread').hidden = false;
    history.replaceState(null, '', location.pathname); window.mqSyncUrl?.(''); loadList();
  });
}

async function start() {
  wire();
  try { const p = await api('GET', '/profile'); state.me = p?.crmUser?.id ?? p?.id ?? null; } catch { /* list still works */ }
  try { state.telephony = await api('GET', '/inbox/telephony'); } catch { state.telephony = null; }
  try { await api('GET', '/inbox/telephony/agents'); $('#adminLinks').hidden = false; } catch { $('#adminLinks').hidden = true; } // admins only (team:manage)
  await loadList();
  // Deep links: #lead=<v2 lead id> from the list, ?lead=<legacy lead id> from the Leads page.
  const legacy = Number(new URLSearchParams(location.search).get('lead'));
  const v2 = Number((location.hash.match(/^#lead=(\d+)$/) || [])[1]);
  if (legacy) { try { const r = await api('GET', `/inbox/by-legacy/${legacy}`); openThread(r.lead_id); } catch (error) { banner(error.message, 'bad'); } }
  else if (v2) openThread(v2);
  setInterval(() => { if (!document.hidden) loadList(); }, LIST_POLL_MS);
  // Who is calling right now (TeleCMI), shown above the panes.
  setInterval(async () => {
    if (document.hidden) return;
    const calls = await api('GET', '/telephony/live').catch(() => []);
    const ringing = calls.filter((c) => c.status === 'ringing');
    if (!ringing.length) { if ($('#banner').dataset.live) { banner(''); delete $('#banner').dataset.live; } return; }
    const c = ringing[0];
    banner(`Incoming call: ${c.caller?.name || 'new caller'} (${phoneLabel(c.from) || 'unknown number'})${c.caller?.owner_name ? ` · owner ${c.caller.owner_name}` : ''}`, 'warn');
    $('#banner').dataset.live = '1';
  }, 5000);
  setInterval(() => { if (!document.hidden && state.activeId) loadThread(false); }, THREAD_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadList(); loadThread(false); } });
}
start();
