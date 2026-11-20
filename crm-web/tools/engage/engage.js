'use strict';
// Engage: campaigns, audiences, templates and automations on their canonical tables.
// Reuses the CRM session (localStorage crmToken / crmRefreshToken). Text is rendered with textContent only.

const CH = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS' };
const STAGES = ['new', 'attempting_contact', 'contacted', 'qualified', 'appointment_requested', 'appointment_booked', 'appointment_confirmed', 'visited', 'consulted', 'won', 'lost', 'nurture'];
const FIELDS = [
  { id: 'source', label: 'Source', ops: ['eq', 'neq'], values: ['whatsapp', 'phone', 'website', 'manual', 'referral', 'facebook-lead-ads', 'field_force', 'smoke'] },
  { id: 'lifecycle_stage', label: 'Stage', ops: ['eq', 'neq', 'in'], values: STAGES },
  { id: 'priority', label: 'Priority', ops: ['eq', 'neq'], values: ['low', 'medium', 'high', 'urgent'] },
  { id: 'score', label: 'Lead score', ops: ['gte', 'lte'] },
  { id: 'created_at', label: 'Created in the last … days', ops: ['since_days'] },
  { id: 'city', label: 'City', ops: ['eq', 'contains'] },
  { id: 'preferred_language', label: 'Preferred language', ops: ['eq'], values: ['en', 'te', 'hi'] },
  { id: 'consent_status', label: 'Consent', ops: ['eq', 'neq'], values: ['granted', 'unknown', 'denied', 'withdrawn'] },
];
const OPS = { eq: 'is', neq: 'is not', in: 'is any of', gte: 'at least', lte: 'at most', since_days: 'within', contains: 'contains' };
const state = { templates: [], audiences: [], options: null };

// ── API with token refresh (refresh rotates both tokens) ──
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
  if (!res.ok || data.success === false) throw new Error(data.message || `Request failed (${res.status})`);
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
const when = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const pretty = (s) => String(s || '').replace(/^medstar_/, '').replace(/_/g, ' ');
function say(text, ok = true) { const r = $('#result'); r.textContent = text || ''; r.className = `result ${ok ? 'good' : 'bad'}`; if (text) r.scrollIntoView({ block: 'nearest' }); }
const field = (label, input) => el('label', {}, label, input);
const select = (opts, value, attrs = {}) => el('select', attrs, ...opts.map(([v, l]) => el('option', { value: v, selected: String(v) === String(value) }, l)));

// ── tabs ──
function showTab(tab) {
  document.querySelectorAll('.etab').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  history.replaceState(null, '', `#${tab}`);
  say('');
  ({ campaigns: loadCampaigns, audiences: loadAudiences, templates: loadTemplates, automations: loadAutomations })[tab]();
}

// ── templates ──
async function loadTemplates() {
  const ch = $('#templateFilter').value;
  state.templates = await api('GET', `/engage/templates${ch ? `?channel=${ch}` : ''}`).catch((e) => { say(e.message, false); return []; });
  const list = $('#templateList');
  if (!state.templates.length) { list.replaceChildren(el('div', { class: 'empty' }, 'No templates yet.')); return; }
  list.replaceChildren(...state.templates.map((t) => el('div', { class: 'item' },
    el('div', {}, el('h3', {}, t.channel === 'whatsapp' ? pretty(t.family || t.name) : t.name),
      el('div', { class: 'meta' }, el('span', {}, CH[t.channel]), t.language_code ? el('span', {}, t.language_code.toUpperCase()) : null, el('span', { class: `status ${t.status}` }, t.status.replace(/_/g, ' ')), t.subject ? el('span', {}, `Subject: ${t.subject}`) : null)),
    el('div', { class: 'buttons' }, t.channel === 'whatsapp' ? el('a', { class: 'btn ghost small', href: '/crm-tools/whatsapp/' }, 'Manage') : [
      el('button', { class: 'btn ghost small', onclick: () => editTemplate(t) }, 'Edit'),
      el('button', { class: 'btn danger small', onclick: async () => { if (!confirm(`Archive "${t.name}"?`)) return; try { await api('DELETE', `/engage/templates/${t.id}`); say('Template archived.'); loadTemplates(); } catch (e) { say(e.message, false); } } }, 'Archive')]),
    el('div', { class: 'body' }, t.body),
    t.rejection_reason ? el('div', { class: 'err' }, `Meta: ${t.rejection_reason}`) : null)));
}
function editTemplate(t = null) {
  const f = $('#templateForm'); f.hidden = false;
  const channel = select([['email', 'Email'], ['sms', 'SMS']], t?.channel || 'email', { id: 'tChannel', disabled: Boolean(t) });
  const name = el('input', { id: 'tName', value: t?.name || '', maxlength: '120' });
  const subject = el('input', { id: 'tSubject', value: t?.subject || '', maxlength: '200' });
  const body = el('textarea', { id: 'tBody', rows: '6' }); body.value = t?.body || '';
  const subjWrap = field('Subject', subject);
  const sync = () => { subjWrap.hidden = channel.value !== 'email'; };
  channel.addEventListener('change', sync); sync();
  const insert = (tok) => { body.setRangeText(tok, body.selectionStart, body.selectionEnd, 'end'); body.focus(); };
  f.replaceChildren(el('h3', {}, t ? `Edit ${t.name}` : 'New email or SMS template'),
    el('div', { class: 'row' }, field('Channel', channel), field('Name', name)), subjWrap, field('Message', body),
    el('div', { class: 'tokens' }, 'Insert: ', ...['{{lead.name}}', '{{lead.first_name}}'].map((tok) => el('code', { onclick: () => insert(tok) }, tok)), ' — filled in for each patient.'),
    el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: async () => {
      try { await api(t ? 'PUT' : 'POST', `/engage/templates${t ? `/${t.id}` : ''}`, { channel: channel.value, name: name.value, subject: subject.value, body: body.value }); f.hidden = true; say('Template saved.'); loadTemplates(); } catch (e) { say(e.message, false); }
    } }, 'Save'), el('button', { class: 'btn ghost', onclick: () => { f.hidden = true; } }, 'Cancel')));
  name.focus();
}

// ── audiences ──
async function loadAudiences() {
  state.audiences = await api('GET', '/engage/audiences').catch((e) => { say(e.message, false); return []; });
  const list = $('#audienceList');
  if (!state.audiences.length) { list.replaceChildren(el('div', { class: 'empty' }, 'No audiences yet. Create one from rules (for example: source is WhatsApp) or pick leads for a static list.')); return; }
  list.replaceChildren(...state.audiences.map((a) => {
    const rules = a.type === 'static' ? `${(a.filter_definition?.lead_ids || []).length} picked leads` : (a.filter_definition?.conditions || []).map((c) => `${(FIELDS.find((f) => f.id === c.field) || {}).label || c.field} ${OPS[c.op] || c.op} ${Array.isArray(c.value) ? c.value.join(', ') : c.value}`).join(' · ');
    const members = el('div', { class: 'body' });
    return el('div', { class: 'item' },
      el('div', {}, el('h3', {}, a.name), el('div', { class: 'meta' }, el('span', {}, a.type === 'static' ? 'Static list' : 'Rule-based'), el('span', {}, `${a.member_count ?? 0} leads`), el('span', {}, `used by ${a.campaigns} campaign${a.campaigns === 1 ? '' : 's'}`), el('span', {}, `updated ${when(a.last_refreshed_at)}`))),
      el('div', { class: 'buttons' },
        el('button', { class: 'btn ghost small', onclick: async () => { const rows = await api('GET', `/engage/audiences/${a.id}/members`).catch((e) => { say(e.message, false); return []; }); members.replaceChildren(rows.length ? el('table', { class: 'mini' }, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Mobile'), el('th', {}, 'Email'), el('th', {}, 'Consent')), ...rows.map((m) => el('tr', {}, el('td', {}, m.name), el('td', {}, m.phone || '—'), el('td', {}, m.email || '—'), el('td', {}, m.consent)))) : 'No members right now.'); } }, 'Members'),
        el('button', { class: 'btn ghost small', onclick: () => editAudience(a) }, 'Edit'),
        el('button', { class: 'btn danger small', onclick: async () => { if (!confirm(`Delete audience "${a.name}"?`)) return; try { await api('DELETE', `/engage/audiences/${a.id}`); say('Audience deleted.'); loadAudiences(); } catch (e) { say(e.message, false); } } }, 'Delete')),
      el('div', { class: 'body' }, rules), members);
  }));
}
function editAudience(a = null) {
  const f = $('#audienceForm'); f.hidden = false;
  const name = el('input', { value: a?.name || '', maxlength: '150' });
  const type = select([['dynamic', 'Rule-based (updates itself)'], ['static', 'Static list (leads you pick)']], a?.type || 'dynamic');
  const rulesBox = el('div', { class: 'form' }), staticBox = el('div', { class: 'form' }), preview = el('div', { class: 'preview-box' }, '…');
  const picked = new Map((a?.filter_definition?.lead_ids || []).map((id) => [Number(id), `Lead #${id}`]));
  let rules = (a?.filter_definition?.conditions || []).map((c) => ({ ...c }));
  if (!rules.length) rules = [{ field: 'source', op: 'eq', value: 'whatsapp' }];
  let timer;
  const refreshPreview = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try { const p = await api('POST', '/engage/audiences/preview', body()); preview.replaceChildren(el('strong', {}, `${p.total} leads`), ` match · ${p.reachable} reachable (consent) · ${p.with_phone} with mobile · ${p.with_email} with email`); }
    catch (e) { preview.textContent = e.message; } }, 300); };
  const body = () => (type.value === 'static' ? { type: 'static', leadIds: [...picked.keys()] } : { type: 'dynamic', conditions: rules.map((r) => ({ ...r, value: r.op === 'in' ? String(r.value).split(',').map((v) => v.trim()).filter(Boolean) : r.value })) });
  const drawRules = () => {
    rulesBox.replaceChildren(...rules.map((r, i) => {
      const def = FIELDS.find((x) => x.id === r.field) || FIELDS[0];
      const fieldSel = select(FIELDS.map((x) => [x.id, x.label]), r.field, { onchange: (e) => { const d = FIELDS.find((x) => x.id === e.target.value); rules[i] = { field: d.id, op: d.ops[0], value: d.values ? d.values[0] : '' }; drawRules(); refreshPreview(); } });
      const opSel = select(def.ops.map((o) => [o, OPS[o]]), r.op, { onchange: (e) => { r.op = e.target.value; refreshPreview(); } });
      const val = def.values && r.op !== 'in' ? select(def.values.map((v) => [v, v.replace(/_/g, ' ')]), r.value, { onchange: (e) => { r.value = e.target.value; refreshPreview(); } })
        : el('input', { value: Array.isArray(r.value) ? r.value.join(', ') : (r.value ?? ''), placeholder: r.op === 'in' ? 'comma separated' : (r.op === 'since_days' ? 'days' : ''), oninput: (e) => { r.value = e.target.value; refreshPreview(); } });
      return el('div', { class: 'rule' }, fieldSel, opSel, val, el('button', { class: 'btn ghost small', type: 'button', onclick: () => { rules.splice(i, 1); drawRules(); refreshPreview(); } }, 'Remove'));
    }), el('button', { class: 'btn ghost small', type: 'button', onclick: () => { rules.push({ field: 'lifecycle_stage', op: 'eq', value: 'new' }); drawRules(); refreshPreview(); } }, 'Add rule'), el('p', { class: 'muted' }, 'A lead must match every rule.'));
  };
  const chips = el('div', { class: 'chips-line' });
  const drawChips = () => chips.replaceChildren(...[...picked].map(([id, label]) => el('span', { class: 'pick' }, label, el('button', { type: 'button', 'aria-label': `Remove ${label}`, onclick: () => { picked.delete(id); drawChips(); refreshPreview(); } }, '×'))));
  const search = el('input', { placeholder: 'Search leads by name, number or email', autocomplete: 'off' });
  const results = el('div', { class: 'chips-line' });
  let st;
  search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(async () => {
    const rows = await api('GET', `/engage/leads?q=${encodeURIComponent(search.value)}`).catch(() => []);
    results.replaceChildren(...rows.map((l) => el('button', { class: 'btn ghost small', type: 'button', onclick: () => { picked.set(Number(l.lead_id), l.name); drawChips(); refreshPreview(); } }, `+ ${l.name}`)));
  }, 250); });
  staticBox.append(search, results, el('div', { class: 'muted' }, 'In this list:'), chips);
  const syncType = () => { rulesBox.hidden = type.value === 'static'; staticBox.hidden = type.value !== 'static'; refreshPreview(); };
  type.addEventListener('change', syncType);
  f.replaceChildren(el('h3', {}, a ? `Edit ${a.name}` : 'New audience'), el('div', { class: 'row' }, field('Name', name), field('Type', type)), rulesBox, staticBox, preview,
    el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: async () => {
      try { const r = await api(a ? 'PUT' : 'POST', `/engage/audiences${a ? `/${a.id}` : ''}`, { name: name.value, ...body() }); f.hidden = true; say(`Audience saved: ${r.member_count} leads.`); loadAudiences(); } catch (e) { say(e.message, false); }
    } }, 'Save'), el('button', { class: 'btn ghost', onclick: () => { f.hidden = true; } }, 'Cancel')));
  drawRules(); drawChips(); syncType(); name.focus();
}

// ── campaigns ──
async function loadCampaigns() {
  let data;
  try { data = await api('GET', '/engage/campaigns'); } catch (e) { say(e.message, false); return; }
  const banner = $('#banner');
  banner.hidden = data.bulkEnabled;
  banner.className = 'banner warn';
  banner.textContent = 'Bulk sending is switched off on this installation (CRM_BULK_SENDING_ENABLED). You can prepare and launch campaigns; they start sending once it is switched on.';
  const list = $('#campaignList');
  if (!data.campaigns.length) { list.replaceChildren(el('div', { class: 'empty' }, 'No campaigns yet. Create an audience first, then a campaign that sends an approved template to it.')); return; }
  list.replaceChildren(...data.campaigns.map((c) => {
    const s = c.stats || {}; const total = c.member_count || 0; const done = (s.sent || 0) + (s.failed || 0) + (s.skipped || 0);
    const recips = el('div', { class: 'body' });
    const btn = (label, verb, cls = 'btn ghost small') => el('button', { class: cls, onclick: async () => { try { const r = await api('POST', `/engage/campaigns/${c.id}/${verb}`); say(r.note || `Campaign ${r.status}.`); loadCampaigns(); } catch (e) { say(e.message, false); } } }, label);
    return el('div', { class: 'item' },
      el('div', {}, el('h3', {}, c.name), el('div', { class: 'meta' }, el('span', { class: `status ${c.status}` }, c.status), el('span', {}, CH[c.channel]), el('span', {}, `to ${c.audience_name || 'audience'} (${total})`),
        el('span', {}, `template: ${pretty(String(c.template_name).replace(/^family:/, ''))}`), el('span', {}, c.starts_at ? `starts ${when(c.starts_at)}` : 'starts on launch'))),
      el('div', { class: 'buttons' }, c.status === 'draft' ? [el('button', { class: 'btn ghost small', onclick: () => editCampaign(c) }, 'Edit'), btn('Launch', 'launch', 'btn small')] : null,
        c.status === 'active' ? btn('Pause', 'pause') : null, c.status === 'paused' ? btn('Resume', 'resume', 'btn small') : null,
        c.status !== 'draft' ? el('button', { class: 'btn ghost small', onclick: async () => { const rows = await api('GET', `/engage/campaigns/${c.id}/recipients`).catch(() => []); recips.replaceChildren(rows.length ? el('table', { class: 'mini' }, el('tr', {}, el('th', {}, 'Lead'), el('th', {}, 'Result'), el('th', {}, 'Delivery'), el('th', {}, 'When')), ...rows.map((r) => el('tr', {}, el('td', {}, r.name), el('td', {}, r.reason ? `${r.status}: ${r.reason}` : r.status), el('td', {}, r.delivery || '—'), el('td', {}, when(r.sent_at))))) : 'Nothing sent yet.'); } }, 'Recipients') : null,
        ['completed', 'paused', 'draft'].includes(c.status) ? btn('Archive', 'archive', 'btn danger small') : null),
      c.status !== 'draft' ? (() => { const bar = el('span'); bar.style.width = `${total ? Math.min(100, Math.round((done / total) * 100)) : 0}%`; return el('div', { class: 'progress', title: `${done} of ${total}` }, bar); })() : null,
      c.status !== 'draft' ? el('div', { class: 'meta' }, `${s.sent || 0} sent · ${s.delivered || 0} delivered · ${s.read || 0} read · ${s.skipped || 0} skipped · ${s.failed || 0} failed`) : null,
      c.last_error ? el('div', { class: 'err' }, c.last_error) : null, recips);
  }));
}
async function editCampaign(c = null) {
  const [audiences, templates] = await Promise.all([api('GET', '/engage/audiences'), api('GET', '/engage/templates')]).catch((e) => { say(e.message, false); return [[], []]; });
  if (!audiences.length) { say('Create an audience first (Audiences tab).', false); return; }
  const f = $('#campaignForm'); f.hidden = false;
  const name = el('input', { value: c?.name || '', maxlength: '150' });
  const channel = select(Object.entries(CH), c?.channel || 'whatsapp');
  const audience = select(audiences.map((a) => [a.id, `${a.name} (${a.member_count ?? 0})`]), c?.audience_ref);
  const tplBox = el('div', { class: 'form' }), params = el('div', { class: 'template-params' });
  const startsAt = el('input', { type: 'datetime-local' });
  if (c?.starts_at) startsAt.value = new Date(new Date(c.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  let tplSel;
  const families = () => { const m = new Map(); for (const t of templates.filter((x) => x.channel === 'whatsapp' && x.status === 'approved')) { const k = t.family || t.name; if (!m.has(k)) m.set(k, { family: k, langs: [], placeholders: t.placeholders, names: t.variable_names || [] }); m.get(k).langs.push(t.language_code); } return [...m.values()]; };
  const drawParams = (count, names = []) => {
    const old = (c?.metadata?.params || []);
    params.replaceChildren(...Array.from({ length: count }, (_, i) => field(`{{${i + 1}}} ${String(names[i] || 'value').replace(/_/g, ' ')}`, el('input', { 'data-p': String(i), value: old[i] ?? (i === 0 && /name/i.test(names[0] || '') ? '{{lead.first_name}}' : '') }))));
  };
  const drawTpl = () => {
    if (channel.value === 'whatsapp') {
      const fam = families();
      tplSel = select(fam.map((x) => [`family:${x.family}`, `${pretty(x.family)} · ${x.langs.join('/').toUpperCase()}`]), c?.template_ref, { onchange: () => { const x = fam.find((y) => `family:${y.family}` === tplSel.value); drawParams(x?.placeholders || 0, x?.names); } });
      tplBox.replaceChildren(field('Approved WhatsApp template (each patient gets their language)', tplSel), params, el('div', { class: 'tokens' }, 'Values can use ', el('code', {}, '{{lead.name}}'), ' or ', el('code', {}, '{{lead.first_name}}'), '.'));
      const x = fam.find((y) => `family:${y.family}` === tplSel.value) || fam[0]; drawParams(x?.placeholders || 0, x?.names);
    } else {
      const list = templates.filter((t) => t.channel === channel.value && t.status === 'approved');
      tplSel = select(list.length ? list.map((t) => [t.id, t.name]) : [['', `No ${CH[channel.value]} templates yet`]], c?.template_ref);
      tplBox.replaceChildren(field(`${CH[channel.value]} template`, tplSel)); params.replaceChildren();
    }
  };
  channel.addEventListener('change', drawTpl);
  f.replaceChildren(el('h3', {}, c ? `Edit ${c.name}` : 'New campaign'), el('div', { class: 'row' }, field('Name', name), field('Channel', channel), field('Audience', audience)), tplBox,
    field('Start (optional; blank = when launched)', startsAt),
    el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: async () => {
      const ref = tplSel?.value || '';
      const payload = { name: name.value, channel: channel.value, audienceId: Number(audience.value), startsAt: startsAt.value ? new Date(startsAt.value).toISOString() : null,
        params: [...params.querySelectorAll('input')].map((i) => i.value), ...(ref.startsWith('family:') ? { family: ref.slice(7) } : { templateId: Number(ref) }) };
      try { await api(c ? 'PUT' : 'POST', `/engage/campaigns${c ? `/${c.id}` : ''}`, payload); f.hidden = true; say('Campaign saved as a draft. Launch it when ready.'); loadCampaigns(); } catch (e) { say(e.message, false); }
    } }, 'Save draft'), el('button', { class: 'btn ghost', onclick: () => { f.hidden = true; } }, 'Cancel')));
  drawTpl(); name.focus();
}

// ── automations ──
async function loadAutomations() {
  const [rows, opts] = await Promise.all([api('GET', '/engage/automations'), state.options ? state.options : api('GET', '/engage/automations/options')]).catch((e) => { say(e.message, false); return [[], null]; });
  state.options = opts;
  const list = $('#automationList');
  if (!rows.length) { list.replaceChildren(el('div', { class: 'empty' }, 'No automations yet. Example: when a new WhatsApp lead arrives, send the enquiry acknowledgement template.')); return; }
  const trig = (a) => { const t = opts?.triggers.find((x) => x.id === a.trigger_type); const cfg = a.trigger_config || {}; const aud = opts?.audiences.find((x) => String(x.id) === String(cfg.segmentId)); return `${t?.label || a.trigger_type}${cfg.segmentId ? `: ${aud?.name || cfg.segmentId}` : ''}${cfg.toStage ? `: ${cfg.toStage}` : ''}${cfg.score != null ? `: ${cfg.score}` : ''}${cfg.source ? `: ${cfg.source}` : ''}${cfg.days != null ? `: ${cfg.days} days` : ''}`; };
  const act = (a) => { const c = a.action_config || {}; if (a.action_type === 'send_message') return `Send ${CH[c.channel] || c.channel}${c.family ? ` template ${pretty(c.family)}` : ''}`; if (a.action_type === 'add_tag') return `Tag "${c.tag}"`; const u = opts?.users.find((x) => String(x.id) === String(c.ownerUserId)); return `Assign to ${u?.name || u?.email || c.ownerUserId}`; };
  list.replaceChildren(...rows.map((a) => el('div', { class: 'item' },
    el('div', {}, el('h3', {}, a.name), el('div', { class: 'meta' }, el('span', { class: `status ${a.status}` }, a.status), el('span', {}, `When: ${trig(a)}`), el('span', {}, `Then: ${act(a)}`), a.delay_minutes ? el('span', {}, `after ${a.delay_minutes} min`) : null)),
    el('div', { class: 'buttons' },
      a.status !== 'published' ? el('button', { class: 'btn small', onclick: () => setAutoStatus(a, 'published') }, 'Publish') : el('button', { class: 'btn ghost small', onclick: () => setAutoStatus(a, 'paused') }, 'Pause'),
      el('button', { class: 'btn danger small', onclick: async () => { if (!confirm(`Delete automation "${a.name}"?`)) return; try { await api('DELETE', `/engage/automations/${a.id}`); say('Automation deleted.'); loadAutomations(); } catch (e) { say(e.message, false); } } }, 'Delete')))));
}
async function setAutoStatus(a, status) { try { await api('PATCH', `/engage/automations/${a.id}/status`, { status }); say(status === 'published' ? 'Published. It runs every 5 minutes.' : 'Paused.'); loadAutomations(); } catch (e) { say(e.message, false); } }
async function editAutomation() {
  const opts = state.options || await api('GET', '/engage/automations/options').catch(() => null);
  if (!opts) return; state.options = opts;
  const f = $('#automationForm'); f.hidden = false;
  const name = el('input', { maxlength: '200' });
  const trigger = select(opts.triggers.map((t) => [t.id, t.label]), 'lead_created');
  const trigCfg = el('div');
  const delay = el('input', { type: 'number', min: '0', value: '0' });
  const action = select(opts.actions.map((a) => [a.id, a.label]), 'send_message');
  const actCfg = el('div', { class: 'form' });
  let cfgInput;
  const drawTrig = () => {
    const t = opts.triggers.find((x) => x.id === trigger.value);
    if (t.config === 'segmentId') cfgInput = select(opts.audiences.map((a) => [a.id, a.name]), '');
    else if (t.config === 'toStage') cfgInput = select(STAGES.map((s) => [s, s.replace(/_/g, ' ')]), 'qualified');
    else if (t.config === 'source') cfgInput = select(FIELDS[0].values.map((v) => [v, v]), 'whatsapp');
    else if (t.config) cfgInput = el('input', { type: 'number', min: '0', value: t.config === 'days' ? '7' : '50' });
    else cfgInput = null;
    trigCfg.replaceChildren(cfgInput ? field('Which', cfgInput) : '');
  };
  let chSel, tplSel, paramsBox, msgIn, subjIn, tagIn, ownerSel;
  const drawAct = () => {
    if (action.value === 'send_message') {
      chSel = select(Object.entries(CH), 'whatsapp', { onchange: drawAct2 }); actCfg.replaceChildren(field('Channel', chSel), el('div', { id: 'actDetail', class: 'form' })); drawAct2();
    } else if (action.value === 'add_tag') { tagIn = el('input', { placeholder: 'e.g. whatsapp-enquiry' }); actCfg.replaceChildren(field('Tag', tagIn)); }
    else { ownerSel = select(opts.users.map((u) => [u.id, u.name || u.email]), ''); actCfg.replaceChildren(field('Owner', ownerSel)); }
  };
  function drawAct2() {
    const box = actCfg.querySelector('#actDetail');
    if (chSel.value === 'whatsapp') {
      const fams = [...new Map(opts.templates.filter((t) => t.channel === 'whatsapp').map((t) => [t.family || t.name, t])).values()];
      paramsBox = el('div', { class: 'template-params' });
      tplSel = select(fams.map((t) => [t.family || t.name, pretty(t.family || t.name)]), '', { onchange: () => drawP() });
      const drawP = () => { const t = fams.find((x) => (x.family || x.name) === tplSel.value); paramsBox.replaceChildren(...Array.from({ length: t?.placeholders || 0 }, (_, i) => field(`{{${i + 1}}}`, el('input', { value: i === 0 ? '{{lead.name}}' : '' })))); };
      box.replaceChildren(field('Approved template (patient\'s language)', tplSel), paramsBox, el('div', { class: 'tokens' }, el('code', {}, '{{lead.name}}'), ' is filled in for each patient.')); drawP();
    } else {
      subjIn = el('input', { placeholder: 'Subject' }); msgIn = el('textarea', { rows: '4' });
      box.replaceChildren(chSel.value === 'email' ? field('Subject', subjIn) : '', field('Message', msgIn));
    }
  }
  trigger.addEventListener('change', drawTrig); action.addEventListener('change', drawAct);
  f.replaceChildren(el('h3', {}, 'New automation'), field('Name', name), el('div', { class: 'row' }, field('When', trigger), trigCfg, field('Wait (minutes)', delay)), field('Then', action), actCfg,
    el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: async () => {
      const t = opts.triggers.find((x) => x.id === trigger.value);
      const triggerConfig = t.config ? { [t.config]: t.config === 'score' || t.config === 'days' || t.config === 'segmentId' ? Number(cfgInput.value) : cfgInput.value } : {};
      let actionConfig;
      if (action.value === 'send_message') actionConfig = chSel.value === 'whatsapp' ? { channel: 'whatsapp', family: tplSel.value, params: [...paramsBox.querySelectorAll('input')].map((i) => i.value) } : { channel: chSel.value, subject: subjIn.value, message: msgIn.value };
      else if (action.value === 'add_tag') actionConfig = { tag: tagIn.value };
      else actionConfig = { ownerUserId: Number(ownerSel.value) };
      try { await api('POST', '/engage/automations', { name: name.value, triggerType: trigger.value, triggerConfig, delayMinutes: Number(delay.value) || 0, actionType: action.value, actionConfig }); f.hidden = true; say('Saved as a draft. Publish it to start.'); loadAutomations(); } catch (e) { say(e.message, false); }
    } }, 'Save draft'), el('button', { class: 'btn ghost', onclick: () => { f.hidden = true; } }, 'Cancel')));
  drawTrig(); drawAct(); name.focus();
}

// ── wiring ──
document.querySelectorAll('.etab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelector('[data-new="template"]').addEventListener('click', () => editTemplate());
document.querySelector('[data-new="audience"]').addEventListener('click', () => editAudience());
document.querySelector('[data-new="campaign"]').addEventListener('click', () => editCampaign());
document.querySelector('[data-new="automation"]').addEventListener('click', () => editAutomation());
$('#templateFilter').addEventListener('change', loadTemplates);
showTab(['campaigns', 'audiences', 'templates', 'automations'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'campaigns');
