'use strict';
// WhatsApp control page. Reuses the CRM session (localStorage crmToken / crmRefreshToken).
// All provider and webhook data is rendered with textContent — never as HTML.

const STATUS_LABEL = { draft: 'Draft', pending_approval: 'In review', approved: 'Approved', rejected: 'Rejected', disabled: 'Disabled', archived: 'Deleted' };
let languages = { en: 'English' };
let templates = [];
let outboundEnabled = false;

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
    const err = new Error(data.code === 'integration_not_configured'
      ? 'Sending is switched off on this installation (CRM_OUTBOUND_ENABLED).' : (data.message || `Request failed (${res.status})`));
    err.details = data.details; throw err;
  }
  return data.data;
}

// ── tiny DOM helper: text only ──
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
const $ = sel => document.querySelector(sel);
const prettyFamily = f => String(f || '').replace(/^medstar_/, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
const fmtTime = t => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function setResult(node, text, ok) { node.textContent = text; node.className = `result ${ok ? 'good' : 'bad'}`; }

// ── status ──
async function loadStatus() {
  const s = await api('GET', '/whatsapp/status');
  languages = s.languages || languages;
  outboundEnabled = Boolean(s.outboundEnabled);
  const t = s.templates || {};
  const sub = s.subscription || {};
  const card = (label, value, sub, dot) => el('div', { class: 'card' },
    el('div', { class: 'label' }, label), el('div', { class: 'value' }, dot ? el('span', { class: `dot ${dot}` }) : null, value), sub ? el('div', { class: 'sub' }, sub) : null);
  $('#statusCards').replaceChildren(
    card('Gupshup app', s.configured ? s.appName : 'Not connected', s.configured ? 'API key verified' : 'Add credentials in CRM Settings → WhatsApp', s.configured ? 'good' : 'bad'),
    card('Business number', s.senderNumber || '—', 'Messages are sent from this number'),
    card('Incoming messages', sub.active ? 'Receiving' : 'Not receiving', sub.active ? `${(sub.events || []).length} event types subscribed` : 'Webhook not active in Gupshup', sub.active ? 'good' : 'bad'),
    card('Account health', s.accountHealth?.health_message ? (s.accountHealth.health_score >= 50 ? 'Good' : 'Attention') : 'No issues reported',
      s.accountHealth?.health_message || 'Meta has not flagged this account', s.accountHealth?.health_score != null && s.accountHealth.health_score < 50 ? 'bad' : 'good'),
    card('Templates', `${t.approved || 0} approved`, `${t.pending_approval || 0} in review · ${t.draft || 0} drafts · ${t.rejected || 0} rejected`),
    card('Sending', outboundEnabled ? 'Enabled' : 'Switched off', outboundEnabled ? 'Templates and replies can be sent' : 'Pre-launch switch is off', outboundEnabled ? 'good' : 'warn'),
  );
  const banner = $('#banner');
  const warnings = [
    !s.configured && 'WhatsApp is not connected. Add the Gupshup app name, number and API key in CRM Settings → WhatsApp.',
    s.configured && !sub.active && 'Gupshup is not forwarding incoming messages to the CRM. Add the CRM webhook in Gupshup → Webhooks.',
    !outboundEnabled && 'Sending is switched off on this installation, so templates cannot be sent to patients yet. Drafting and Meta review still work.',
  ].filter(Boolean);
  banner.hidden = !warnings.length;
  banner.className = `banner ${!s.configured ? 'bad' : 'warn'}`;
  banner.replaceChildren(...warnings.map(w => el('div', {}, w)));
  const langOptions = Object.entries(languages).map(([code, name]) => [code, name]);
  $('#filterLanguage').replaceChildren(el('option', { value: '' }, 'All languages'), ...langOptions.map(([c, n]) => el('option', { value: c }, n)));
  $('#sendTemplate [name=language]').replaceChildren(el('option', { value: '' }, "Lead's preference"), ...langOptions.map(([c, n]) => el('option', { value: c }, n)));
}

// ── templates ──
async function loadTemplates(sync = true) {
  templates = await api('GET', `/whatsapp/templates${sync ? '' : '?sync=false'}`);
  renderTemplates();
  const approvedFamilies = [...new Set(templates.filter(t => t.status === 'approved').map(t => t.family || t.name))];
  $('#sendTemplate [name=family]').replaceChildren(...(approvedFamilies.length
    ? approvedFamilies.map(f => el('option', { value: f.replace(/^medstar_/, '') }, prettyFamily(f)))
    : [el('option', { value: '' }, 'No approved templates yet')]));
}
function renderTemplates() {
  const status = $('#filterStatus').value, lang = $('#filterLanguage').value;
  const shown = templates.filter(t => (!status || t.status === status) && (!lang || t.language_code === lang));
  const groups = new Map();
  for (const t of shown) { const k = t.family || t.name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const container = $('#templates');
  if (!groups.size) {
    container.replaceChildren(el('p', { class: 'muted' }, templates.length ? 'No templates match these filters.' : 'No WhatsApp templates yet. Load the hospital library or create one below.'));
    updateSubmitButton(); return;
  }
  container.replaceChildren(...[...groups].map(([family, items]) => el('div', { class: 'family' },
    el('div', { class: 'family-head' },
      el('h3', {}, prettyFamily(family)),
      el('span', { class: 'meta' }, `${items[0].category} · ${items.map(i => i.language || i.language_code).join(', ')}`)),
    ...items.map(variantRow))));
  updateSubmitButton();
}
function variantRow(t) {
  const isDraft = t.status === 'draft';
  const needsReview = isDraft && t.language_code !== 'en' && t.metadata?.needsNativeReview;
  return el('div', { class: 'variant-item' },
    el('input', { type: 'checkbox', class: 'pick', 'data-id': t.id, disabled: !isDraft, 'aria-label': `Select ${t.name}`, onchange: updateSubmitButton }),
    el('div', { class: 'lang-col' }, el('div', { class: 'lang-chip' }, t.language || t.language_code),
      el('span', { class: `badge ${t.status}` }, STATUS_LABEL[t.status] || t.status),
      needsReview ? el('div', {}, el('span', { class: 'badge review', title: 'Have a native speaker check this before submitting' }, 'Needs native review')) : null),
    el('div', {}, el('div', { class: 'body' }, t.body), el('div', { class: 'name' }, t.name),
      t.rejection_reason ? el('div', { class: 'reason' }, `Meta rejected this: ${t.rejection_reason}`) : null),
    el('div', { class: 'buttons' },
      isDraft ? el('button', { class: 'btn small', type: 'button', onclick: () => submitOne(t) }, 'Submit') : null,
      el('button', { class: 'btn small danger', type: 'button', onclick: () => removeTemplate(t) }, 'Delete')));
}
function updateSubmitButton() {
  const n = document.querySelectorAll('.pick:checked').length;
  const btn = $('#submitDrafts');
  btn.disabled = !n; btn.textContent = n ? `Submit ${n} to Meta` : 'Submit selected';
}
async function submitOne(t) {
  if (!confirm(`Submit "${t.name}" to Meta for review?`)) return;
  try { await api('POST', `/whatsapp/templates/${t.id}/submit`); await refreshTemplates(); }
  catch (e) { alert(e.message); }
}
async function submitSelected() {
  const ids = [...document.querySelectorAll('.pick:checked')].map(c => Number(c.dataset.id));
  if (!ids.length || !confirm(`Submit ${ids.length} template(s) to Meta for review? Gupshup allows about 10 per minute, so this is paced.`)) return;
  const btn = $('#submitDrafts'); btn.disabled = true;
  const failures = [];
  for (const [i, id] of ids.entries()) {
    btn.textContent = `Submitting ${i + 1} of ${ids.length}…`;
    try { await api('POST', `/whatsapp/templates/${id}/submit`); } catch (e) { failures.push(`${templates.find(t => t.id === String(id) || t.id === id)?.name || id}: ${e.message}`); }
    if (i < ids.length - 1) await new Promise(r => setTimeout(r, 7000));
  }
  await refreshTemplates();
  if (failures.length) alert(`Some templates were not submitted:\n\n${failures.join('\n')}`);
}
async function removeTemplate(t) {
  const onMeta = Boolean(t.provider_template_id);
  if (!confirm(onMeta ? `Delete "${t.name}" from Meta? Meta blocks reusing this exact name for 30 days.` : `Delete draft "${t.name}"?`)) return;
  try { await api('DELETE', `/whatsapp/templates/${t.id}`); await refreshTemplates(); } catch (e) { alert(e.message); }
}
async function refreshTemplates(sync = false) { await Promise.all([loadTemplates(sync), loadStatus()]); }

// ── new template form ──
function addVariant(code) {
  const used = [...document.querySelectorAll('#variants [name=language]')].map(s => s.value);
  const next = code || Object.keys(languages).find(c => !used.includes(c)) || 'en';
  const node = $('#variantRow').content.firstElementChild.cloneNode(true);
  const select = node.querySelector('[name=language]');
  select.replaceChildren(...Object.entries(languages).map(([c, n]) => el('option', { value: c, selected: c === next }, n)));
  node.querySelector('.remove').addEventListener('click', () => { node.remove(); });
  const body = node.querySelector('[name=body]');
  let timer;
  body.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => lintVariant(node), 450); });
  $('#variants').append(node);
}
async function lintVariant(node) {
  const body = node.querySelector('[name=body]').value;
  const list = node.querySelector('.lint');
  if (!body.trim()) { list.replaceChildren(); return; }
  try {
    const r = await api('POST', '/whatsapp/templates/lint', { body, category: $('#newTemplate [name=category]').value });
    list.replaceChildren(...r.errors.map(e => el('li', { class: 'error' }, e)), ...r.warnings.map(w => el('li', { class: 'warning' }, w)),
      ...(!r.errors.length && !r.warnings.length ? [el('li', { class: 'ok' }, '✓ Ready for Meta review')] : []));
  } catch { list.replaceChildren(); }
}
async function saveTemplate(event) {
  event.preventDefault();
  const form = event.target, mode = event.submitter?.value || 'draft', out = $('#formResult');
  const variants = {};
  for (const v of document.querySelectorAll('#variants .variant')) {
    const body = v.querySelector('[name=body]').value.trim();
    if (body) variants[v.querySelector('[name=language]').value] = body;
  }
  if (!form.purpose.value.trim()) return setResult(out, 'Give the template a purpose, e.g. "Appointment reminder".', false);
  if (!Object.keys(variants).length) return setResult(out, 'Write the message in at least one language.', false);
  const examples = form.examples.value.split(',').map(s => s.trim()).filter(Boolean);
  try {
    setResult(out, mode === 'submit' ? 'Saving and submitting to Meta…' : 'Saving…', true);
    const r = await api('POST', '/whatsapp/templates', { purpose: form.purpose.value, category: form.category.value, examples, variants, submit: mode === 'submit' });
    const failed = r.variants.filter(v => v.submitted === false);
    setResult(out, failed.length ? `Saved. Not submitted: ${failed.map(f => `${f.name} (${f.error})`).join('; ')}`
      : `${mode === 'submit' ? 'Submitted' : 'Saved'}: ${r.variants.map(v => v.name).join(', ')}`, !failed.length);
    if (!failed.length) { form.reset(); $('#variants').replaceChildren(); addVariant('en'); }
    await refreshTemplates();
  } catch (e) { setResult(out, e.message, false); }
}

// ── send ──
async function sendTemplate(event) {
  event.preventDefault();
  const f = event.target, out = $('#sendResult');
  if (!f.family.value) return setResult(out, 'There are no approved templates to send yet.', false);
  if (!/^\d+$/.test(f.leadId.value.trim())) return setResult(out, 'Enter the numeric lead ID from the Leads page.', false);
  try {
    const r = await api('POST', '/whatsapp/templates/send', { family: f.family.value, language: f.language.value || undefined,
      leadId: Number(f.leadId.value), params: f.params.value.split(',').map(s => s.trim()).filter(Boolean) });
    setResult(out, `Sent "${r.template}" in ${r.language} to ${r.to}.`, true);
    loadEvents();
  } catch (e) { setResult(out, e.message, false); }
}

// ── events ──
async function loadEvents() {
  const events = await api('GET', '/whatsapp/events?limit=100');
  $('#events').replaceChildren(...(events.length ? events.map(e => el('li', {},
    el('span', { class: 'time' }, fmtTime(e.received_at)), el('span', { class: 'type' }, `${e.event_type}${e.event_subtype ? ` · ${e.event_subtype}` : ''}`),
    el('span', {}, e.summary || ''))) : [el('li', { class: 'muted' }, 'No events yet. They appear here as Gupshup reports them.')]));
}

// ── wire up ──
async function loadAll(sync) {
  try { await loadStatus(); } catch (e) { $('#statusCards').replaceChildren(el('p', { class: 'muted' }, e.message)); }
  if (!$('#variants').children.length) addVariant('en');
  await Promise.all([loadTemplates(sync).catch(e => $('#templates').replaceChildren(el('p', { class: 'muted' }, e.message))),
    loadEvents().catch(e => $('#events').replaceChildren(el('li', { class: 'muted' }, e.message)))]);
}
$('#refreshAll').addEventListener('click', () => loadAll(true));
$('#filterStatus').addEventListener('change', renderTemplates);
$('#filterLanguage').addEventListener('change', renderTemplates);
$('#submitDrafts').addEventListener('click', submitSelected);
$('#syncTemplates').addEventListener('click', async e => {
  e.target.disabled = true;
  try { const r = await api('POST', '/whatsapp/templates/refresh'); await refreshTemplates(); e.target.textContent = `Checked ${r.synced} with Meta`; }
  catch (err) { alert(err.message); } finally { e.target.disabled = false; }
});
$('#loadLibrary').addEventListener('click', async e => {
  if (!confirm('Load the hospital template library (English, Telugu, Hindi) as drafts? Nothing is submitted to Meta.')) return;
  e.target.disabled = true;
  try { const r = await api('POST', '/whatsapp/templates/library', {}); await refreshTemplates(); alert(`Loaded ${r.templates.length} templates as drafts.`); }
  catch (err) { alert(err.message); } finally { e.target.disabled = false; }
});
$('#addLanguage').addEventListener('click', () => addVariant());
$('#newTemplate').addEventListener('submit', saveTemplate);
$('#sendTemplate').addEventListener('submit', sendTemplate);
loadAll(true);
