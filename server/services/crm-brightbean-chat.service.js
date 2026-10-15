/**
 * CRM chat-automation extensions.
 *
 * Capability modeled on the public BrightBean Chat behavior; this service is
 * independently authored for Mediqzy and uses the existing tenant-scoped
 * CRM/social tables. It deliberately exposes only bounded actions and never
 * executes user-supplied code or arbitrary outbound HTTP.
 */
import pool from '../db/pgPool.js';
import { dispatchTrigger } from './crm-social-growth.service.js';
import { runFlow } from './crm-flow-builder.service.js';

const CHANNELS = new Set(['instagram', 'facebook', 'whatsapp', 'sms', 'email']);
const RULE_MATCH_TYPES = new Set(['keyword', 'event', 'status', 'label']);
const TEMPLATE_CATEGORIES = new Set(['marketing', 'utility', 'authentication']);
const TEMPLATE_TRANSITIONS = Object.freeze({
  draft: new Set(['submitted']),
  submitted: new Set(['approved', 'rejected']),
  approved: new Set(['paused']),
  rejected: new Set(['draft', 'submitted']),
  paused: new Set(['approved', 'draft']),
});

const actorId = (user) => {
  const value = Number.parseInt(user?.id, 10);
  return Number.isInteger(value) ? value : null;
};

function boundedLimit(value, fallback = 50, max = 200) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), max);
}

function requireChannel(value) {
  const channel = String(value || '').trim().toLowerCase();
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('Unsupported channel'), { statusCode: 400 });
  return channel;
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normaliseLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return [...new Set(labels.map((label) => String(label || '').trim().toLowerCase()).filter(Boolean))].slice(0, 50);
}

export async function listInboxConversations(tenantUid, { channel, status = 'open', assignedTo, limit = 50 } = {}) {
  const params = [tenantUid];
  const where = ['tenant_uid=$1'];
  if (channel) { params.push(requireChannel(channel)); where.push(`channel=$${params.length}`); }
  if (status && status !== 'all') { params.push(String(status)); where.push(`status=$${params.length}`); }
  if (assignedTo) { params.push(Number(assignedTo)); where.push(`assigned_team_user_id=$${params.length}`); }
  const pageSize = boundedLimit(limit);
  const { rows } = await pool.query(`
    SELECT * FROM social_inbox_conversations
    WHERE ${where.join(' AND ')}
    ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
    LIMIT ${pageSize}
  `, params);
  return rows;
}

export async function assignConversation(tenantUid, conversationId, assignedTo, user) {
  const assignee = assignedTo == null || assignedTo === '' ? null : Number(assignedTo);
  if (assignee !== null && !Number.isInteger(assignee)) throw Object.assign(new Error('assignedTo must be an integer or null'), { statusCode: 400 });
  const { rows } = await pool.query(`
    UPDATE social_inbox_conversations
       SET assigned_team_user_id=$3, updated_at=NOW()
     WHERE tenant_uid=$1 AND id=$2
     RETURNING *
  `, [tenantUid, conversationId, assignee]);
  return rows[0] || null;
}

export async function setConversationStatus(tenantUid, conversationId, status) {
  if (!['open', 'closed'].includes(String(status))) throw Object.assign(new Error('status must be open or closed'), { statusCode: 400 });
  const { rows } = await pool.query(`
    UPDATE social_inbox_conversations
       SET status=$3, closed_at=CASE WHEN $3='closed' THEN NOW() ELSE NULL END, updated_at=NOW()
     WHERE tenant_uid=$1 AND id=$2
     RETURNING *
  `, [tenantUid, conversationId, status]);
  return rows[0] || null;
}

export async function setConversationLabels(tenantUid, conversationId, labels) {
  const { rows } = await pool.query(`
    UPDATE social_inbox_conversations SET labels=$3::jsonb, updated_at=NOW()
     WHERE tenant_uid=$1 AND id=$2 RETURNING *
  `, [tenantUid, conversationId, JSON.stringify(normaliseLabels(labels))]);
  return rows[0] || null;
}

export async function takeoverConversation(tenantUid, conversationId, reason, user) {
  const text = String(reason || 'Human operator takeover').trim().slice(0, 500);
  if (!text) throw Object.assign(new Error('reason is required'), { statusCode: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const conversation = await client.query('SELECT id FROM social_inbox_conversations WHERE tenant_uid=$1 AND id=$2 FOR UPDATE', [tenantUid, conversationId]);
    if (!conversation.rows[0]) { await client.query('ROLLBACK'); return null; }
    const { rows } = await client.query(`
      INSERT INTO crm_social_automation_pauses (tenant_uid,conversation_id,reason,paused_by)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (tenant_uid,conversation_id) WHERE resumed_at IS NULL
      DO UPDATE SET reason=EXCLUDED.reason,paused_by=EXCLUDED.paused_by,paused_at=NOW()
      RETURNING *
    `, [tenantUid, conversationId, text, actorId(user)]);
    await client.query('UPDATE social_inbox_conversations SET human_takeover_at=NOW(),human_takeover_by=$3,updated_at=NOW() WHERE tenant_uid=$1 AND id=$2', [tenantUid, conversationId, actorId(user)]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function releaseConversation(tenantUid, conversationId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      UPDATE crm_social_automation_pauses SET resumed_at=NOW()
       WHERE tenant_uid=$1 AND conversation_id=$2 AND resumed_at IS NULL RETURNING *
    `, [tenantUid, conversationId]);
    await client.query('UPDATE social_inbox_conversations SET human_takeover_at=NULL,human_takeover_by=NULL,updated_at=NOW() WHERE tenant_uid=$1 AND id=$2', [tenantUid, conversationId]);
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function listInboxRules(tenantUid, { active } = {}) {
  const { rows } = await pool.query(`
    SELECT * FROM crm_social_inbox_rules
     WHERE tenant_uid=$1 AND ($2::boolean IS NULL OR active=$2)
     ORDER BY priority ASC, updated_at DESC
  `, [tenantUid, active === undefined ? null : String(active) === 'true']);
  return rows;
}

function validateRuleConfig(matchType, matchConfig, actionConfig) {
  if (!RULE_MATCH_TYPES.has(matchType)) throw Object.assign(new Error('Unsupported inbox rule match type'), { statusCode: 400 });
  if (!matchConfig || typeof matchConfig !== 'object' || Array.isArray(matchConfig)) throw Object.assign(new Error('matchConfig must be an object'), { statusCode: 400 });
  if (!actionConfig || typeof actionConfig !== 'object' || Array.isArray(actionConfig)) throw Object.assign(new Error('actionConfig must be an object'), { statusCode: 400 });
  const allowedActions = ['label', 'assignTo', 'close', 'pause', 'flowId'];
  if (Object.keys(actionConfig).some((key) => !allowedActions.includes(key))) throw Object.assign(new Error('Inbox rule contains an unsupported action'), { statusCode: 400 });
  if (actionConfig.label && String(actionConfig.label).length > 80) throw Object.assign(new Error('Rule label is too long'), { statusCode: 400 });
  return { matchConfig, actionConfig };
}

export async function createInboxRule(tenantUid, input, user) {
  const name = String(input.name || '').trim();
  const matchType = String(input.matchType || '').trim();
  if (!name || name.length > 160) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  const channel = input.channel ? requireChannel(input.channel) : null;
  validateRuleConfig(matchType, input.matchConfig || {}, input.actionConfig || {});
  const { rows } = await pool.query(`
    INSERT INTO crm_social_inbox_rules
      (tenant_uid,name,channel,match_type,match_config,action_config,priority,active,created_by,updated_by)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$9)
    ON CONFLICT (tenant_uid,name) DO UPDATE SET
      channel=EXCLUDED.channel,match_type=EXCLUDED.match_type,match_config=EXCLUDED.match_config,
      action_config=EXCLUDED.action_config,priority=EXCLUDED.priority,active=EXCLUDED.active,
      updated_by=EXCLUDED.updated_by,updated_at=NOW()
    RETURNING *
  `, [tenantUid, name, channel, matchType, JSON.stringify(input.matchConfig || {}), JSON.stringify(input.actionConfig || {}), Number.isInteger(Number(input.priority)) ? Number(input.priority) : 100, input.active !== false, actorId(user)]);
  return rows[0];
}

export async function updateInboxRule(tenantUid, id, input, user) {
  const current = await pool.query('SELECT * FROM crm_social_inbox_rules WHERE tenant_uid=$1 AND id=$2', [tenantUid, id]);
  if (!current.rows[0]) return null;
  const row = current.rows[0];
  const merged = {
    name: input.name ?? row.name,
    channel: input.channel ?? row.channel,
    matchType: input.matchType ?? row.match_type,
    matchConfig: input.matchConfig ?? parseJson(row.match_config),
    actionConfig: input.actionConfig ?? parseJson(row.action_config),
    priority: input.priority ?? row.priority,
    active: input.active ?? row.active,
  };
  const name = String(merged.name || '').trim();
  if (!name || name.length > 160) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  const channel = merged.channel ? requireChannel(merged.channel) : null;
  validateRuleConfig(String(merged.matchType || ''), merged.matchConfig || {}, merged.actionConfig || {});
  const { rows } = await pool.query(`
    UPDATE crm_social_inbox_rules
       SET name=$3, channel=$4, match_type=$5, match_config=$6::jsonb,
           action_config=$7::jsonb, priority=$8, active=$9, updated_by=$10, updated_at=NOW()
     WHERE tenant_uid=$1 AND id=$2
     RETURNING *
  `, [tenantUid, id, name, channel, merged.matchType, JSON.stringify(merged.matchConfig || {}), JSON.stringify(merged.actionConfig || {}), Number.isInteger(Number(merged.priority)) ? Number(merged.priority) : 100, merged.active !== false, actorId(user)]);
  return rows[0] || null;
}

export async function deleteInboxRule(tenantUid, id) {
  const { rowCount } = await pool.query('DELETE FROM crm_social_inbox_rules WHERE tenant_uid=$1 AND id=$2', [tenantUid, id]);
  return rowCount > 0;
}

function ruleMatches(rule, event) {
  if (rule.channel && rule.channel !== event.channel) return false;
  const config = parseJson(rule.match_config);
  if (rule.match_type === 'keyword') {
    const haystack = String(event.text || '').toLowerCase();
    const keywords = Array.isArray(config.keywords) ? config.keywords : [config.keyword];
    return keywords.filter(Boolean).some((keyword) => haystack.includes(String(keyword).toLowerCase()));
  }
  if (rule.match_type === 'event') return String(config.eventType || config.event || '') === String(event.eventType || '');
  if (rule.match_type === 'status') return String(config.status || '') === String(event.status || '');
  if (rule.match_type === 'label') return normaliseLabels(event.labels).includes(String(config.label || '').toLowerCase());
  return false;
}

export async function applyInboxRules(tenantUid, event, user) {
  const rules = await listInboxRules(tenantUid, { active: true });
  const matched = [];
  for (const rule of rules) {
    if (!ruleMatches(rule, event)) continue;
    const action = parseJson(rule.action_config);
    matched.push({ ruleId: rule.id, action });
    if (event.conversationId) {
      if (action.label) {
        const current = await pool.query('SELECT labels FROM social_inbox_conversations WHERE tenant_uid=$1 AND id=$2', [tenantUid, event.conversationId]);
        const labels = [...new Set([...normaliseLabels(parseJson(current.rows[0]?.labels, [])), String(action.label).toLowerCase()])];
        await setConversationLabels(tenantUid, event.conversationId, labels);
      }
      if (action.assignTo !== undefined) await assignConversation(tenantUid, event.conversationId, action.assignTo, user);
      if (action.close === true) await setConversationStatus(tenantUid, event.conversationId, 'closed');
      if (action.pause === true) await takeoverConversation(tenantUid, event.conversationId, `Inbox rule: ${rule.name}`, user);
    }
    if (action.flowId) {
      await runFlow(tenantUid, action.flowId, { ...event, conversationId: event.conversationId || null, trigger: { type: 'inbox_rule', ruleId: rule.id } }, { dryRun: false, user });
    } else if (event.eventType !== 'message' && event.triggerKey) {
      await dispatchTrigger(tenantUid, { triggerType: event.eventType, channel: event.channel, triggerKey: event.triggerKey, conversationId: event.conversationId, payload: event }, user);
    }
  }
  return matched;
}

export function normalizeInboundEvent(payload = {}) {
  const object = String(payload.object || '').toLowerCase();
  const channel = object === 'instagram' ? 'instagram' : 'facebook';
  const events = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const field = String(change.field || '').toLowerCase();
      const value = change.value || {};
      let eventType = null;
      if (field.includes('comment')) eventType = 'comment_to_dm';
      else if (field.includes('mention') || field.includes('story')) eventType = 'story_mention';
      else if (field.includes('follow')) eventType = 'follow';
      else if (field.includes('ref') || value.ref) eventType = 'ref_url';
      if (eventType) events.push({ eventType, channel, triggerKey: String(value.trigger_key || value.keyword || value.comment_id || value.media_id || value.ref || entry.id || ''), externalUserId: value.from?.id || value.sender?.id || null, text: value.text || value.message || '', payload: value, accountId: entry.id || null });
    }
    for (const message of entry.messaging || []) {
      const externalUserId = message.sender?.id || null;
      if (externalUserId && message.message?.text) events.push({ eventType: 'message', channel, triggerKey: message.message.text.trim().toLowerCase(), externalUserId, text: message.message.text, payload: message, accountId: entry.id || null });
    }
  }
  return events;
}

/** Resolve a webhook account to a tenant only when an operator explicitly
 * registered the account in a trigger/identity row. Unknown accounts are
 * ignored rather than guessed, which prevents cross-tenant fan-out. */
export async function resolveSocialAccountTenant(channel, accountId) {
  if (!accountId) return null;
  try {
    const { rows } = await pool.query(`
      SELECT tenant_uid FROM crm_social_triggers
       WHERE channel=$1 AND active=TRUE AND config->>'accountId'=$2
       ORDER BY updated_at DESC LIMIT 1
    `, [channel, String(accountId)]);
    return rows[0]?.tenant_uid || null;
  } catch (error) {
    // The adoption migration is intentionally deployable after the existing
    // webhook route. Before it runs, retain legacy inbox behavior instead of
    // dropping inbound messages because the new trigger table is unavailable.
    if (error?.code === '42P01') return null;
    throw error;
  }
}

export async function processNormalizedWebhook(payload) {
  const events = normalizeInboundEvent(payload);
  const results = [];
  for (const event of events) {
    const tenantUid = await resolveSocialAccountTenant(event.channel, event.accountId);
    if (!tenantUid) {
      results.push({ event, matched: false, reason: 'unregistered social account' });
      continue;
    }
    if (event.eventType === 'message' && event.externalUserId) {
      const conversation = await pool.query(`
        SELECT id FROM social_inbox_conversations
         WHERE tenant_uid=$1 AND channel=$2 AND external_user_id=$3
         ORDER BY updated_at DESC LIMIT 1
      `, [tenantUid, event.channel, event.externalUserId]);
      event.conversationId = conversation.rows[0]?.id || null;
    }
    if (event.eventType === 'message') {
      const rules = await applyInboxRules(tenantUid, event, { id: 0, crmRole: 'system', isAdmin: true });
      results.push({ event, tenantUid, matched: rules.length > 0, rules });
      continue;
    }
    const trigger = await dispatchTrigger(tenantUid, {
      triggerType: event.eventType,
      channel: event.channel,
      triggerKey: event.triggerKey,
      payload: event,
    }, { id: 0, crmRole: 'system', isAdmin: true });
    const rules = await applyInboxRules(tenantUid, event, { id: 0, crmRole: 'system', isAdmin: true });
    results.push({ event, tenantUid, trigger, rules });
  }
  return results;
}

export async function listWhatsAppTemplates(tenantUid, { status } = {}) {
  const { rows } = await pool.query('SELECT * FROM crm_whatsapp_templates WHERE tenant_uid=$1 AND ($2::text IS NULL OR status=$2) ORDER BY updated_at DESC', [tenantUid, status || null]);
  return rows;
}

export async function createWhatsAppTemplate(tenantUid, input, user) {
  const name = String(input.name || '').trim(); const category = String(input.category || '').trim(); const language = String(input.language || 'en_US').trim();
  if (!name || name.length > 160 || !TEMPLATE_CATEGORIES.has(category)) throw Object.assign(new Error('name and valid category are required'), { statusCode: 400 });
  if (!Array.isArray(input.components) || input.components.length > 20) throw Object.assign(new Error('components must be an array with at most 20 items'), { statusCode: 400 });
  const { rows } = await pool.query(`INSERT INTO crm_whatsapp_templates (tenant_uid,name,language,category,components,created_by,updated_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6) ON CONFLICT (tenant_uid,name,language) DO UPDATE SET category=EXCLUDED.category,components=EXCLUDED.components,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`, [tenantUid, name, language, category, JSON.stringify(input.components), actorId(user)]);
  return rows[0];
}

export async function transitionWhatsAppTemplate(tenantUid, id, nextStatus, user, rejectionReason = null) {
  const status = String(nextStatus || '').trim();
  const { rows: current } = await pool.query('SELECT * FROM crm_whatsapp_templates WHERE tenant_uid=$1 AND id=$2', [tenantUid, id]);
  if (!current[0]) return null;
  if (!TEMPLATE_TRANSITIONS[current[0].status]?.has(status)) throw Object.assign(new Error(`Invalid template transition ${current[0].status} -> ${status}`), { statusCode: 409 });
  if (status === 'rejected' && !String(rejectionReason || '').trim()) throw Object.assign(new Error('rejectionReason is required'), { statusCode: 400 });
  const { rows } = await pool.query(`UPDATE crm_whatsapp_templates SET status=$3,rejection_reason=$4,submitted_at=CASE WHEN $3='submitted' THEN NOW() ELSE submitted_at END,approved_at=CASE WHEN $3='approved' THEN NOW() ELSE approved_at END,updated_by=$5,updated_at=NOW() WHERE tenant_uid=$1 AND id=$2 RETURNING *`, [tenantUid, id, status, rejectionReason || null, actorId(user)]);
  return rows[0];
}

export async function requestSocialErasure(tenantUid, input, user) {
  const channel = requireChannel(input.channel); const externalUserId = String(input.externalUserId || '').trim();
  if (!externalUserId) throw Object.assign(new Error('externalUserId is required'), { statusCode: 400 });
  const identity = await pool.query('SELECT id FROM crm_social_identities WHERE tenant_uid=$1 AND channel=$2 AND external_user_id=$3', [tenantUid, channel, externalUserId]);
  const { rows } = await pool.query(`INSERT INTO crm_social_erasure_requests (tenant_uid,identity_id,channel,external_user_id,reason,requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [tenantUid, identity.rows[0]?.id || null, channel, externalUserId, String(input.reason || '').slice(0, 500) || null, actorId(user)]);
  return rows[0];
}

export async function listSocialErasureRequests(tenantUid, { status } = {}) {
  const { rows } = await pool.query('SELECT * FROM crm_social_erasure_requests WHERE tenant_uid=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC', [tenantUid, status || null]);
  return rows;
}

export async function processSocialErasure(tenantUid, id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`UPDATE crm_social_erasure_requests SET status='processing',updated_at=NOW() WHERE tenant_uid=$1 AND id=$2 AND status='pending' RETURNING *`, [tenantUid, id]);
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    const request = rows[0];
    const erasedId = `erased:${request.entity_uid}`;
    await client.query(`UPDATE crm_social_identities SET external_user_id=$3,contact_id=NULL,lead_id=NULL,profile='{}'::jsonb,consent_status='opted_out',updated_at=NOW() WHERE tenant_uid=$1 AND channel=$2 AND external_user_id=$4`, [tenantUid, request.channel, erasedId, request.external_user_id]);
    await client.query(`UPDATE social_inbox_conversations SET external_user_id=$3,contact_name=NULL,contact_avatar_url=NULL,metadata='{}'::jsonb,labels='[]'::jsonb,updated_at=NOW() WHERE tenant_uid=$1 AND channel=$2 AND external_user_id=$4`, [tenantUid, request.channel, erasedId, request.external_user_id]);
    await client.query(`UPDATE social_inbox_messages m SET body='[content erased]',attachments=NULL WHERE m.conversation_id IN (SELECT id FROM social_inbox_conversations WHERE tenant_uid=$1 AND channel=$2 AND external_user_id=$3)`, [tenantUid, request.channel, erasedId]);
    const { rows: completed } = await client.query(`UPDATE crm_social_erasure_requests SET status='completed',processed_by=$3,processed_at=NOW(),updated_at=NOW(),error=NULL WHERE tenant_uid=$1 AND id=$2 RETURNING *`, [tenantUid, id, actorId(user)]);
    await client.query('COMMIT');
    return completed[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await pool.query(`UPDATE crm_social_erasure_requests SET status='failed',error=$3,updated_at=NOW() WHERE tenant_uid=$1 AND id=$2`, [tenantUid, id, String(error.message).slice(0, 1000)]).catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function listInboxReminders(tenantUid, { status } = {}) {
  const { rows } = await pool.query('SELECT * FROM crm_social_inbox_reminders WHERE tenant_uid=$1 AND ($2::text IS NULL OR status=$2) ORDER BY remind_at', [tenantUid, status || null]);
  return rows;
}

export async function createInboxReminder(tenantUid, input, user) {
  const conversationId = Number.parseInt(input.conversationId, 10); const note = String(input.note || '').trim(); const remindAt = new Date(input.remindAt);
  if (!Number.isInteger(conversationId) || !note || Number.isNaN(remindAt.valueOf())) throw Object.assign(new Error('conversationId, note and valid remindAt are required'), { statusCode: 400 });
  const exists = await pool.query('SELECT id FROM social_inbox_conversations WHERE tenant_uid=$1 AND id=$2', [tenantUid, conversationId]); if (!exists.rows[0]) return null;
  const { rows } = await pool.query('INSERT INTO crm_social_inbox_reminders (tenant_uid,conversation_id,remind_at,note,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [tenantUid, conversationId, remindAt, note, actorId(user)]);
  return rows[0];
}

export async function cancelInboxReminder(tenantUid, id) {
  const { rows } = await pool.query(`UPDATE crm_social_inbox_reminders SET status='cancelled',updated_at=NOW() WHERE tenant_uid=$1 AND id=$2 AND status='scheduled' RETURNING *`, [tenantUid, id]);
  return rows[0] || null;
}

export async function processDueInboxReminders({ tenantUid = null, limit = 25, now = new Date() } = {}) {
  const max = boundedLimit(limit, 25, 100); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const params = tenantUid ? [tenantUid, now, max] : [now, max];
    const scope = tenantUid ? 'tenant_uid=$1 AND' : '';
    const nowParam = tenantUid ? '$2' : '$1'; const limitParam = tenantUid ? '$3' : '$2';
    const { rows } = await client.query(`SELECT * FROM crm_social_inbox_reminders WHERE ${scope} status='scheduled' AND remind_at <= ${nowParam} ORDER BY remind_at LIMIT ${limitParam} FOR UPDATE SKIP LOCKED`, params);
    const result = [];
    for (const row of rows) {
      await client.query(`UPDATE crm_social_inbox_reminders SET status='sent',sent_at=NOW(),updated_at=NOW(),error=NULL WHERE id=$1`, [row.id]);
      result.push({ id: row.id, status: 'sent', conversationId: row.conversation_id, note: row.note });
    }
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

