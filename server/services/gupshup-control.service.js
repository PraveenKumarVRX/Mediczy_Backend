/** Full Gupshup control for the tenant's WhatsApp app: template lifecycle (draft, lint, submit, sync,
 * delete), multilingual template families, language-aware sends, and every webhook event type.
 * Uses the app-scoped API key from Communication Hub > Integrations (verified against
 * api.gupshup.io/wa/app/{appId}/template). The App ID lives in deployment config (GUPSHUP_APP_ID)
 * because the settings form's built-in field list has no App ID field and would drop it on re-save. */
import { managedFetch as fetch } from '../integrations/transport.js';
import crypto from 'node:crypto';
import sharedPool from '../db/pgPool.js';
import { GupshupWhatsAppService } from './gupshup-whatsapp.service.js';
import { TEMPLATE_LIBRARY } from './whatsapp-template-library.js';

const API = 'https://api.gupshup.io';
const fail = (statusCode, message, details) => Object.assign(new Error(message), { statusCode, ...(details ? { fields: details } : {}) });

/** Indian languages Meta accepts for WhatsApp templates, plus English. */
export const TEMPLATE_LANGUAGES = {
  en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam',
  mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu',
};
const LANGUAGE_BY_NAME = Object.fromEntries(Object.entries(TEMPLATE_LANGUAGES).map(([code, name]) => [name.toLowerCase(), code]));
const toLanguage = value => {
  const v = String(value || '').trim().toLowerCase().replace(/[-_].*$/, '');
  return TEMPLATE_LANGUAGES[v] ? v : LANGUAGE_BY_NAME[v] || null;
};

function decrypt(value) {
  const key = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(key || '')) return {};
  const [iv, tag, bytes] = String(value).split(':');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
    d.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(bytes, 'hex')), d.final()]).toString('utf8'));
  } catch { return {}; }
}

export async function getGupshupApp(tenantId) {
  const { rows: [row] } = await sharedPool.query(
    `SELECT config, encrypted_credentials FROM crm_marketing_integrations
     WHERE tenant_id = $1 AND provider = 'whatsapp' AND integration_type = 'communication' AND status = 'configured' LIMIT 1`,
    [tenantId]
  );
  const config = typeof row?.config === 'string' ? JSON.parse(row.config) : (row?.config || {});
  if (config.provider !== 'gupshup') return null;
  const apiKey = decrypt(row.encrypted_credentials).apiKey;
  const appId = config.appId || process.env.GUPSHUP_APP_ID;
  if (!apiKey || !appId || !config.appName || !config.senderNumber) return null;
  return { appId, appName: config.appName, senderNumber: config.senderNumber, apiKey };
}

async function requireApp(tenantId) {
  const app = await getGupshupApp(tenantId);
  if (!app) throw fail(503, 'Gupshup is not fully configured (API key, app name, sender number and GUPSHUP_APP_ID are required)');
  return app;
}

async function gupshup(app, method, path, form) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { apikey: app.apiKey, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(form ? { body: new URLSearchParams(form).toString() } : {}),
    });
  } catch { throw fail(502, 'Gupshup could not be reached'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error') {
    const message = typeof data.message === 'string' ? data.message : data.message?.message;
    throw fail(response.status >= 500 ? 502 : 422, `Gupshup: ${message || `request failed (HTTP ${response.status})`}`);
  }
  return data;
}

// ─── Naming and content rules ─────────────────────────────────────────────────────────────────

const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
/** <brand>_<purpose>_<language>, e.g. medstar_appointment_reminder_te. Meta: lowercase, digits, underscores. */
export function templateName(brand, purpose, language) {
  const b = slug(brand), p = slug(purpose).replace(new RegExp(`^${b}_`), '').replace(new RegExp(`_(${Object.keys(TEMPLATE_LANGUAGES).join('|')})$`), '');
  if (!p) throw fail(400, 'A template purpose is required, e.g. "appointment reminder"');
  return `${b}_${p}_${language}`.slice(0, 180);
}

/** Meta requires positional {{1}}, {{2}}…; CRM templates may use {{name}}. Converts and returns the mapping. */
export function toPositional(text) {
  const names = [];
  const converted = String(text || '').replace(/\{\{\s*([A-Za-z_][\w.]*|\d+)\s*\}\}/g, (_, name) => {
    if (/^\d+$/.test(name)) return `{{${name}}}`;
    let index = names.indexOf(name);
    if (index === -1) { names.push(name); index = names.length - 1; }
    return `{{${index + 1}}}`;
  });
  return { content: converted, variables: names };
}

const placeholders = text => (String(text || '').match(/\{\{(\d+)\}\}/g) || []).map(p => Number(p.slice(2, -2)));
const placeholderCount = text => new Set(placeholders(text)).size;

/** Blocks Meta's most common rejection causes; warns on unprofessional patterns. */
export function lintTemplate(content, category) {
  const errors = [], warnings = [];
  const text = String(content || '').trim();
  const nums = placeholders(text);
  if (!text) errors.push('Body is empty');
  if (text.length > 1024) errors.push('Body exceeds 1024 characters');
  if (/^\{\{\d+\}\}/.test(text)) errors.push('Body must not start with a variable; begin with text such as "Dear {{1}}"');
  if (/\{\{\d+\}\}[\s.!?]*$/.test(text)) errors.push('Body must not end with a variable; close with a sentence');
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(text)) errors.push('Two variables must not sit next to each other');
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  if (unique.some((n, i) => n !== i + 1)) errors.push('Variables must be numbered {{1}}, {{2}}, {{3}}… without gaps');
  if (nums.length && nums.some((n, i) => i > 0 && n < nums[i - 1] && !nums.slice(0, i).includes(n))) errors.push('Variables must first appear in order {{1}}, {{2}}…');
  if (text.replace(/\{\{\d+\}\}/g, '').trim().split(/\s+/).length < unique.length * 3) errors.push('Too many variables for the amount of text');
  if ((text.match(/\b[A-Z]{4,}\b/g) || []).filter(w => w !== 'YES' && w !== 'STOP').length) warnings.push('Avoid ALL CAPS words');
  if ((text.match(/\p{Extended_Pictographic}/gu) || []).length > 2) warnings.push('Use at most two emojis');
  if (/!{2,}/.test(text)) warnings.push('Avoid repeated exclamation marks');
  if (category === 'UTILITY' && /\b(offer|discount|free|sale|deal|cashback|limited time|% off)\b/i.test(text)) {
    warnings.push('Promotional wording in a UTILITY template: Meta may recategorise it as MARKETING');
  }
  if (/\b(bit\.ly|tinyurl|goo\.gl)\b/i.test(text)) warnings.push('Avoid URL shorteners; Meta often rejects them');
  return { errors, warnings };
}

const CATEGORY = { marketing: 'MARKETING', utility: 'UTILITY', authentication: 'AUTHENTICATION', otp: 'AUTHENTICATION',
  transactional: 'UTILITY', general: 'UTILITY', reminder: 'UTILITY', appointment: 'UTILITY', promotion: 'MARKETING' };
const toCategory = value => CATEGORY[String(value || 'utility').toLowerCase()] || String(value || '').toUpperCase();

// ─── Local template rows ──────────────────────────────────────────────────────────────────────

const STATUS_MAP = { APPROVED: 'approved', PENDING: 'pending_approval', SUBMITTED: 'pending_approval', IN_APPEAL: 'pending_approval',
  REJECTED: 'rejected', FAILED: 'rejected', DISABLED: 'disabled', PAUSED: 'disabled', DELETED: 'archived' };
const crmStatus = providerStatus => STATUS_MAP[String(providerStatus || '').toUpperCase()] || 'pending_approval';
const familyOf = name => String(name || '').replace(new RegExp(`_(${Object.keys(TEMPLATE_LANGUAGES).join('|')})$`), '');

async function upsertProviderTemplate(client, tenantId, t) {
  const status = crmStatus(t.status);
  const values = [tenantId, t.elementName, String(t.category || 'UTILITY').toLowerCase(), t.data || '', status,
    t.id, String(t.status || '').toUpperCase(), t.languageCode || null, t.reason || t.rejectedReason || null,
    JSON.stringify({ quality: t.quality || null, templateType: t.templateType || null, placeholders: placeholderCount(t.data), family: familyOf(t.elementName) })];
  const byId = await client.query(
    `UPDATE crm_communication_templates SET name=$2, category=$3, body=$4, status=$5::varchar, provider_status=$7, language_code=$8,
       rejection_reason=$9, metadata = metadata || $10::jsonb, updated_at=NOW(),
       approved_at = CASE WHEN $5::varchar = 'approved' THEN COALESCE(approved_at, NOW()) ELSE approved_at END
     WHERE tenant_id=$1 AND provider='gupshup' AND provider_template_id=$6 RETURNING id`, values);
  if (byId.rows[0]) return byId.rows[0].id;
  const adopted = await client.query(
    `UPDATE crm_communication_templates SET category=$3, body=$4, status=$5::varchar, provider='gupshup', provider_template_id=$6,
       provider_status=$7, language_code=$8, rejection_reason=$9, metadata = metadata || $10::jsonb, updated_at=NOW()
     WHERE id = (SELECT id FROM crm_communication_templates WHERE tenant_id=$1 AND channel='whatsapp' AND name=$2
                 AND provider_template_id IS NULL ORDER BY version DESC LIMIT 1) RETURNING id`, values);
  if (adopted.rows[0]) return adopted.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO crm_communication_templates (tenant_id, name, channel, category, body, status, provider, provider_template_id,
       provider_status, language_code, rejection_reason, metadata, variables)
     VALUES ($1,$2,'whatsapp',$3,$4,$5::varchar,'gupshup',$6,$7,$8,$9,$10::jsonb,'[]'::jsonb) RETURNING id`, values);
  return inserted.rows[0].id;
}

/** Pull every template from Gupshup and reconcile into the CRM (status, category, rejection reason). */
export async function syncTemplates(tenantId) {
  const app = await requireApp(tenantId);
  const data = await gupshup(app, 'GET', `/wa/app/${app.appId}/template`);
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    for (const t of templates) if (t?.id && t?.elementName) await upsertProviderTemplate(client, tenantId, t);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  return { synced: templates.length };
}

export async function listTemplates(tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT id, name, category, body, status, provider_status, language_code, rejection_reason, provider_template_id,
            metadata->>'family' AS family, metadata, updated_at, approved_at
     FROM crm_communication_templates WHERE tenant_id=$1 AND channel='whatsapp' AND status <> 'archived'
     ORDER BY metadata->>'family' NULLS LAST, language_code, updated_at DESC`,
    [tenantId]
  );
  return rows.map(r => ({ ...r, language: TEMPLATE_LANGUAGES[r.language_code] || r.language_code }));
}

/** Validate and normalise one language variant into everything Meta needs. */
function prepareVariant(app, { purpose, language, body, category, examples = [], header, footer }) {
  const lang = toLanguage(language);
  if (!lang) throw fail(400, `Unsupported language "${language}". Supported: ${Object.entries(TEMPLATE_LANGUAGES).map(([c, n]) => `${n} (${c})`).join(', ')}`);
  const cat = toCategory(category);
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(cat)) throw fail(400, 'Category must be marketing, utility or authentication');
  const { content, variables } = toPositional(body);
  const lint = lintTemplate(content, cat);
  if (lint.errors.length) throw fail(400, `Template "${purpose}" (${TEMPLATE_LANGUAGES[lang]}) needs fixes before Meta will accept it: ${lint.errors.join('; ')}`, lint);
  const elementName = templateName(app.appName, purpose, lang);
  const example = content.replace(/\{\{(\d+)\}\}/g, (_, n) => examples[Number(n) - 1] || variables[Number(n) - 1]?.replace(/_/g, ' ') || `sample ${n}`);
  return { elementName, lang, cat, content, variables, example, header, footer, warnings: lint.warnings, family: familyOf(elementName) };
}

async function storeDraft(client, tenantId, v, actorUserId, extraMeta = {}) {
  const meta = JSON.stringify({ family: v.family, purpose: v.family, example: v.example, variableNames: v.variables,
    placeholders: placeholderCount(v.content), header: v.header || null, footer: v.footer || null, lintWarnings: v.warnings, ...extraMeta });
  const existing = await client.query(
    `SELECT id, provider_template_id FROM crm_communication_templates WHERE tenant_id=$1 AND channel='whatsapp' AND name=$2 ORDER BY version DESC LIMIT 1`,
    [tenantId, v.elementName]
  );
  if (existing.rows[0]?.provider_template_id) return { id: existing.rows[0].id, skipped: 'already submitted to Meta' };
  if (existing.rows[0]) {
    await client.query(
      `UPDATE crm_communication_templates SET category=$2, body=$3, language_code=$4, variables=$5::jsonb, metadata = metadata || $6::jsonb,
         status='draft', updated_at=NOW() WHERE id=$1`,
      [existing.rows[0].id, v.cat.toLowerCase(), v.content, v.lang, JSON.stringify(v.variables), meta]);
    return { id: existing.rows[0].id, updated: true };
  }
  const { rows: [row] } = await client.query(
    `INSERT INTO crm_communication_templates (tenant_id, name, channel, category, body, status, language_code, variables, metadata, created_by)
     VALUES ($1,$2,'whatsapp',$3,$4,'draft',$5,$6::jsonb,$7::jsonb,$8) RETURNING id`,
    [tenantId, v.elementName, v.cat.toLowerCase(), v.content, v.lang, JSON.stringify(v.variables), meta, actorUserId || null]);
  return { id: row.id, created: true };
}

/** Create a template family: one variant per language, saved as drafts and optionally submitted. */
export async function createTemplateFamily(tenantId, input, actorUserId) {
  const app = await requireApp(tenantId);
  const variants = input.variants && typeof input.variants === 'object'
    ? Object.entries(input.variants) : [[input.languageCode || input.language || 'en', input.body || input.content]];
  if (!variants.length) throw fail(400, 'Provide at least one language variant');
  const prepared = variants.map(([language, body]) => prepareVariant(app, { purpose: input.purpose || input.name, language, body,
    category: input.category, examples: input.examples, header: input.header, footer: input.footer }));
  const client = await sharedPool.connect();
  const saved = [];
  try {
    await client.query('BEGIN');
    for (const v of prepared) saved.push({ ...await storeDraft(client, tenantId, v, actorUserId, input.metadata), name: v.elementName, language: v.lang, warnings: v.warnings });
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  if (input.submit) for (const s of saved) if (!s.skipped) Object.assign(s, await submitTemplate(tenantId, s.id).then(t => ({ submitted: true, status: t.status })).catch(e => ({ submitted: false, error: e.message })));
  return { family: prepared[0].family, variants: saved };
}

/** Load the professional library as drafts (never auto-submitted). */
export async function loadTemplateLibrary(tenantId, actorUserId, { languages } = {}) {
  const wanted = Array.isArray(languages) && languages.length ? languages.map(toLanguage).filter(Boolean) : null;
  const results = [];
  for (const t of TEMPLATE_LIBRARY) {
    const variants = Object.fromEntries(Object.entries(t.variants).filter(([lang]) => !wanted || wanted.includes(lang)));
    if (!Object.keys(variants).length) continue;
    results.push(await createTemplateFamily(tenantId, { purpose: t.purpose, category: t.category, examples: t.examples, variants,
      metadata: { source: 'library', needsNativeReview: false, languageReviewedAt: '2026-11-15' } }, actorUserId));
  }
  return { families: results.length, templates: results.flatMap(r => r.variants) };
}

/** Submit a local draft to Gupshup/Meta for review. */
export async function submitTemplate(tenantId, templateId) {
  const app = await requireApp(tenantId);
  const { rows: [t] } = await sharedPool.query(
    `SELECT * FROM crm_communication_templates WHERE tenant_id=$1 AND id=$2 AND channel='whatsapp'`, [tenantId, templateId]);
  if (!t) throw fail(404, 'Template not found');
  if (t.provider_template_id) throw fail(409, `Already submitted (Meta status: ${t.provider_status || t.status})`);
  const meta = t.metadata || {};
  const v = prepareVariant(app, { purpose: meta.family || t.name, language: t.language_code || 'en', body: t.body, category: t.category,
    examples: [], header: meta.header, footer: meta.footer });
  if (v.elementName !== t.name) throw fail(409, `Template name "${t.name}" does not follow the naming convention; expected "${v.elementName}"`);
  const form = { elementName: v.elementName, languageCode: v.lang, content: v.content, category: v.cat, vertical: 'medstar_crm',
    templateType: 'TEXT', example: meta.example || v.example, allowTemplateCategoryChange: 'false',
    ...(v.header ? { header: v.header, exampleHeader: v.header } : {}), ...(v.footer ? { footer: v.footer } : {}) };
  const data = await gupshup(app, 'POST', `/wa/app/${app.appId}/template`, form);
  const p = data.template || {};
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    await upsertProviderTemplate(client, tenantId, { ...p, elementName: p.elementName || v.elementName, data: p.data || v.content,
      category: p.category || v.cat, languageCode: p.languageCode || v.lang, status: p.status || 'PENDING' });
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  return (await sharedPool.query('SELECT * FROM crm_communication_templates WHERE id=$1', [t.id])).rows[0];
}

/** Bulk submit, paced under Gupshup's ~10 template creations/minute limit. */
export async function submitTemplates(tenantId, templateIds, { delayMs = 7000 } = {}) {
  const results = [];
  for (const [i, id] of templateIds.entries()) {
    if (i) await new Promise(resolve => setTimeout(resolve, delayMs));
    try { const t = await submitTemplate(tenantId, id); results.push({ id, name: t.name, submitted: true, status: t.status }); }
    catch (error) { results.push({ id, submitted: false, error: error.message }); }
  }
  return results;
}

/** Single-template create (used by the Communication Hub's existing Templates tab): draft, then submit. */
export async function createTemplate(tenantId, input, actorUserId) {
  const result = await createTemplateFamily(tenantId, { ...input, submit: true }, actorUserId);
  return (await sharedPool.query('SELECT * FROM crm_communication_templates WHERE id=$1', [result.variants[0].id])).rows[0];
}

export async function deleteTemplate(tenantId, templateId) {
  const app = await requireApp(tenantId);
  const { rows: [t] } = await sharedPool.query(
    `SELECT id, name, provider_template_id FROM crm_communication_templates WHERE tenant_id=$1 AND id=$2 AND channel='whatsapp'`,
    [tenantId, templateId]);
  if (!t) throw fail(404, 'Template not found');
  if (t.provider_template_id) await gupshup(app, 'DELETE', `/wa/app/${app.appId}/template/${encodeURIComponent(t.name)}`);
  await sharedPool.query(`UPDATE crm_communication_templates SET status='archived', provider_status=COALESCE($2, provider_status), updated_at=NOW() WHERE id=$1`,
    [t.id, t.provider_template_id ? 'DELETED' : null]);
  return { deleted: true, id: t.id, name: t.name, removedFromMeta: Boolean(t.provider_template_id) };
}

/** Send an approved template to a lead (legacy CRM lead id). Pass templateId, or family + optional
 * language: the variant is chosen from explicit language → lead's preferred language → English. */
export async function sendTemplate(tenantId, { templateId, family, language, leadId, params = [] }, actorUserId) {
  const app = await requireApp(tenantId);
  const { rows: [lead] } = await sharedPool.query(
    `SELECT l.id AS legacy_id, l.name, l.phone, v.id AS v2_id, v.person_id, v.contact_id, c.preferred_language
     FROM crm_leads l JOIN crm_leads_v2 v ON v.legacy_lead_id = l.id AND v.tenant_id = $1
     LEFT JOIN crm_contacts_v2 c ON c.id = v.contact_id WHERE l.id = $2`, [tenantId, leadId]);
  if (!lead) throw fail(404, 'Lead not found');

  let t;
  if (templateId) {
    t = (await sharedPool.query(`SELECT * FROM crm_communication_templates WHERE tenant_id=$1 AND id=$2 AND channel='whatsapp' AND provider='gupshup'`,
      [tenantId, templateId])).rows[0];
  } else if (family) {
    const order = [toLanguage(language), toLanguage(lead.preferred_language), 'en'].filter(Boolean);
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_communication_templates WHERE tenant_id=$1 AND channel='whatsapp' AND provider='gupshup' AND status='approved'
         AND metadata->>'family' = $2`, [tenantId, familyOf(slug(family).startsWith(slug(app.appName)) ? slug(family) : `${slug(app.appName)}_${slug(family)}`)]);
    t = order.map(l => rows.find(r => r.language_code === l)).find(Boolean) || rows[0];
  }
  if (!t) throw fail(404, 'No matching WhatsApp template found');
  if (t.status !== 'approved') throw fail(409, `Template is ${t.status}; only Meta-approved templates can be sent`);
  const needed = placeholderCount(t.body);
  if (!Array.isArray(params) || params.length !== needed || params.some(p => p == null || String(p).trim() === '')) {
    throw fail(400, `This template needs exactly ${needed} value(s)`);
  }
  const to = String(lead.phone || '').replace(/\D/g, '');
  if (to.length < 10) throw fail(400, `${lead.name} has no valid WhatsApp number on file`);
  const destination = to.length === 10 ? `91${to}` : to;

  const svc = new GupshupWhatsAppService({ config: { apiKey: app.apiKey, appName: app.appName, sourceNumber: app.senderNumber } });
  const sent = await svc.sendTemplate({ to: destination, templateId: t.provider_template_id, params: params.map(String) });
  const rendered = t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1]);

  let conversationId = (await sharedPool.query(
    `SELECT id FROM crm_conversations WHERE tenant_id=$1 AND lead_id=$2 AND channel='whatsapp' AND status<>'closed' ORDER BY created_at DESC LIMIT 1`,
    [tenantId, lead.v2_id])).rows[0]?.id;
  if (!conversationId) {
    conversationId = (await sharedPool.query(
      `INSERT INTO crm_conversations (tenant_id, lead_id, identity_id, channel, status, last_message_at, metadata)
       VALUES ($1,$2,$3,'whatsapp','open',NOW(),$4::jsonb) RETURNING id`,
      [tenantId, lead.v2_id, lead.person_id, JSON.stringify({ provider: 'gupshup', customer_id: `+${destination}` })])).rows[0].id;
  } else {
    await sharedPool.query('UPDATE crm_conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1', [conversationId]);
  }
  await sharedPool.query(
    `INSERT INTO crm_communication_events (tenant_id, lead_id, contact_id, identity_id, conversation_id, channel, direction,
       message_type, template_id, body_preview, provider, provider_message_id, status, sent_at, owner_user_id, metadata)
     VALUES ($1,$2,$3,$4,$5,'whatsapp','outbound','template',$6,$7,'gupshup',$8,'sent',NOW(),$9,$10::jsonb)`,
    [tenantId, lead.v2_id, lead.contact_id, lead.person_id, conversationId, t.id, rendered.slice(0, 2000), sent.messageId,
      actorUserId || null, JSON.stringify({ template: t.name, language: t.language_code, to: `+${destination}` })]);
  await sharedPool.query('UPDATE crm_leads SET last_contacted=NOW(), updated_at=NOW() WHERE id=$1', [lead.legacy_id]);
  return { sent: true, messageId: sent.messageId, to: `+${destination}`, template: t.name, language: TEMPLATE_LANGUAGES[t.language_code] || t.language_code };
}

/** Send an approved template to a phone number that is not a patient lead (for example a referring
 * doctor). Same template rules as sendTemplate; the caller logs the message where it belongs. */
export async function sendTemplateToNumber(tenantId, { templateId, family, language, to, params = [] }) {
  const app = await requireApp(tenantId);
  let t;
  if (templateId) {
    t = (await sharedPool.query(`SELECT * FROM crm_communication_templates WHERE tenant_id=$1 AND id=$2 AND channel='whatsapp' AND provider='gupshup'`,
      [tenantId, templateId])).rows[0];
  } else if (family) {
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_communication_templates WHERE tenant_id=$1 AND channel='whatsapp' AND provider='gupshup' AND status='approved'
         AND metadata->>'family' = $2`, [tenantId, familyOf(slug(family).startsWith(slug(app.appName)) ? slug(family) : `${slug(app.appName)}_${slug(family)}`)]);
    t = [toLanguage(language), 'en'].filter(Boolean).map((l) => rows.find((r) => r.language_code === l)).find(Boolean) || rows[0];
  }
  if (!t) throw fail(404, 'No matching WhatsApp template found');
  if (t.status !== 'approved') throw fail(409, `Template is ${t.status}; only Meta-approved templates can be sent`);
  const needed = placeholderCount(t.body);
  if (!Array.isArray(params) || params.length !== needed || params.some((x) => x == null || String(x).trim() === '')) {
    throw fail(400, `This template needs exactly ${needed} value(s)`);
  }
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) throw fail(400, 'No valid WhatsApp number on file');
  const destination = digits.length === 10 ? `91${digits}` : digits;
  const svc = new GupshupWhatsAppService({ config: { apiKey: app.apiKey, appName: app.appName, sourceNumber: app.senderNumber } });
  const sent = await svc.sendTemplate({ to: destination, templateId: t.provider_template_id, params: params.map(String) });
  return { messageId: sent.messageId, to: `+${destination}`, template: t, rendered: t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1]) };
}

// ─── Webhook events beyond messages/delivery receipts ─────────────────────────────────────────

export async function logChannelEvent(tenantId, { type, subtype, reference, summary, payload }) {
  await sharedPool.query(
    `INSERT INTO crm_channel_events (tenant_id, provider, event_type, event_subtype, reference, summary, payload)
     VALUES ($1,'gupshup',$2,$3,$4,$5,$6::jsonb)`,
    [tenantId, type, subtype || null, reference || null, summary || null, JSON.stringify(payload || {})]);
}

export async function handleTemplateEvent(tenantId, p) {
  const sub = p?.type;
  if (sub === 'status-update') {
    const status = crmStatus(p.status);
    await sharedPool.query(
      `UPDATE crm_communication_templates SET status=$3::varchar, provider_status=$4, rejection_reason=$5, updated_at=NOW(),
         approved_at = CASE WHEN $3::varchar='approved' THEN COALESCE(approved_at, NOW()) ELSE approved_at END
       WHERE tenant_id=$1 AND provider='gupshup' AND provider_template_id=$2`,
      [tenantId, p.id, status, String(p.status || '').toUpperCase(), p.rejectedReason || null]);
    return `Template ${p.elementName} ${String(p.status).toLowerCase()}${p.rejectedReason ? ` (${p.rejectedReason})` : ''}`;
  }
  if (sub === 'category-update') {
    const next = p.category?.new || p.category?.correct;
    if (p.category?.new) {
      await sharedPool.query(`UPDATE crm_communication_templates SET category=$3, updated_at=NOW() WHERE tenant_id=$1 AND provider='gupshup' AND provider_template_id=$2`,
        [tenantId, p.id, String(next).toLowerCase()]);
    }
    return `Template ${p.elementName} category ${p.category?.new ? 'changed' : 'flagged for change'} → ${next}`;
  }
  if (sub === 'quality-update') {
    await sharedPool.query(`UPDATE crm_communication_templates SET metadata = metadata || $3::jsonb, updated_at=NOW() WHERE tenant_id=$1 AND provider='gupshup' AND provider_template_id=$2`,
      [tenantId, p.id, JSON.stringify({ quality: p.quality })]);
    return `Template ${p.elementName} quality ${p.quality}`;
  }
  return `Template event ${sub || 'unknown'}`;
}

/** Account health (reviews, violations, restrictions, tier changes) surfaces on the integration record. */
export async function handleAccountEvent(tenantId, p) {
  const inner = p?.payload || {};
  const summary = p?.type === 'tier-event' ? `Messaging tier ${inner.event}: ${inner.oldLimit} → ${inner.currentLimit}`
    : `Account ${p?.type}: ${inner.status || inner.event || 'update'}${inner.violation_type ? ` (${inner.violation_type})` : ''}`;
  const bad = /VIOLATION|RESTRICT|FLAGGED|REJECT|DISABLED|BANNED/i.test(`${inner.status} ${inner.event}`);
  await sharedPool.query(
    `UPDATE crm_marketing_integrations SET health_message=$2, health_score=$3, last_health_check_at=NOW(), updated_at=clock_timestamp()
     WHERE tenant_id=$1 AND provider='whatsapp' AND integration_type='communication'`,
    [tenantId, summary.slice(0, 500), bad ? 20 : 100]);
  return summary;
}

/** Opt-in / opt-out → consent on the matching contact (payload shape varies; matched on last 10 digits). */
export async function handleUserEvent(tenantId, p) {
  const phone = String(p?.phone || p?.payload?.phone || p?.source || '').replace(/\D/g, '');
  const sub = String(p?.type || '').toLowerCase();
  const consent = /opt(ed)?-?out/.test(sub) ? 'withdrawn' : /opt(ed)?-?in/.test(sub) ? 'granted' : null;
  if (phone.length >= 10 && consent) {
    await sharedPool.query(
      `UPDATE crm_contacts_v2 SET consent_status=$3, updated_at=NOW()
       WHERE tenant_id=$1 AND right(regexp_replace(COALESCE(phone_e164,''),'[^0-9]','','g'),10)=right($2,10)`,
      [tenantId, phone, consent]);
  }
  return `User ${sub || 'event'}${phone ? ` ****${phone.slice(-4)}` : ''}${consent ? ` → consent ${consent}` : ''}`;
}

export async function recentChannelEvents(tenantId, limit = 50) {
  const { rows } = await sharedPool.query(
    `SELECT id, event_type, event_subtype, reference, summary, received_at FROM crm_channel_events
     WHERE tenant_id=$1 AND provider='gupshup' ORDER BY received_at DESC LIMIT $2`,
    [tenantId, Math.min(Math.max(Number(limit) || 50, 1), 200)]);
  return rows;
}

export async function gupshupStatus(tenantId) {
  const app = await getGupshupApp(tenantId);
  const { rows: [integration] } = await sharedPool.query(
    `SELECT health_message, health_score, last_health_check_at FROM crm_marketing_integrations
     WHERE tenant_id=$1 AND provider='whatsapp' AND integration_type='communication'`, [tenantId]);
  const { rows: counts } = await sharedPool.query(
    `SELECT status, count(*)::int AS n FROM crm_communication_templates WHERE tenant_id=$1 AND channel='whatsapp' GROUP BY status`, [tenantId]);
  // What Gupshup will actually forward to us: confirms the callback is active and pointed here.
  let subscription = null;
  if (app) {
    const data = await gupshup(app, 'GET', `/wa/app/${app.appId}/subscription`).catch(() => null);
    const ours = (data?.subscriptions || []).find(s => String(s.url || '').includes('/api/channel-webhooks/whatsapp/'));
    subscription = ours ? { active: Boolean(ours.active), name: ours.tag || null, version: ours.version, events: ours.modes || [] } : { active: false };
  }
  return {
    configured: Boolean(app), appName: app?.appName || null, senderNumber: app?.senderNumber || null, appIdConfigured: Boolean(app?.appId),
    webhookConfigured: Boolean(process.env.CRM_WHATSAPP_WEBHOOK_TOKEN), subscription, accountHealth: integration || null,
    outboundEnabled: process.env.CRM_OUTBOUND_ENABLED === 'true',
    templates: Object.fromEntries(counts.map(c => [c.status, c.n])), languages: TEMPLATE_LANGUAGES,
  };
}
