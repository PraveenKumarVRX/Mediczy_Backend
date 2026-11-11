/**
 * CRM Growth Engine — Phase 3: automation engine v1.
 *
 * Deliberately a rule-based engine, not a visual canvas (per the plan's own
 * descoping) — one trigger, an optional delay, one action per automation.
 * Runs on a periodic sweep (crm-automation-cron.service.js) rather than
 * wiring precise event hooks at every write site: each tick finds leads
 * matching a published automation's trigger that don't already have an
 * execution row (enforced by a UNIQUE(automation_id, lead_id) constraint —
 * that's what makes this idempotent and safe to re-run on every tick; a
 * lead can never be double-fired for the same automation), then runs the
 * action for any execution whose scheduled_at has arrived.
 */
import sharedPool from '../db/pgPool.js';
import { dispatchToChannel, findOrCreateConversation } from './hospital-crm-communication-hub.service.js';
import { resolveV2LeadByLegacyId } from './crm-v2-sync.service.js';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
const TRIGGER_TYPES = new Set([
  'lead_created', 'segment_entered', 'lifecycle_stage_changed',
  'lead_score_above', 'source_equals', 'no_activity_days',
]);
const ACTION_TYPES = new Set(['send_message', 'add_tag', 'assign_owner']);

const SCHEMA_TABLES = ['crm_automations', 'crm_automation_executions'];

// Owned by the migration and only verified here: creating these on demand
// would let a skipped migration look healthy on tables without its indexes
// and constraints, and would let a request hold an ACCESS EXCLUSIVE lock.
const ensureCrmAutomationsSchema = schemaVerifier({
  sequelize: sharedPool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the platform-edge governance migrations before using this service',
});


const guardedSharedPool = guardedQuery(sharedPool, 'Apply the platform-edge governance migrations before using this service');

// Reported at startup so an unmigrated environment shows in the log, not
// only when the first request fails. Boot is not blocked.

function positiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createAutomation({ tenantId, name, description, triggerType, triggerConfig, delayMinutes, actionType, actionConfig, createdBy }) {
  if (!TRIGGER_TYPES.has(triggerType)) throw Object.assign(new Error(`Invalid trigger type. Use one of: ${[...TRIGGER_TYPES].join(', ')}`), { statusCode: 400 });
  if (!ACTION_TYPES.has(actionType)) throw Object.assign(new Error(`Invalid action type. Use one of: ${[...ACTION_TYPES].join(', ')}`), { statusCode: 400 });
  const { rows } = await guardedSharedPool(
    `INSERT INTO crm_automations (tenant_id, name, description, trigger_type, trigger_config, delay_minutes, action_type, action_config, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, name, description || null, triggerType, JSON.stringify(triggerConfig || {}), Math.max(0, Number(delayMinutes) || 0), actionType, JSON.stringify(actionConfig || {}), createdBy || null]
  );
  return rows[0];
}

export async function updateAutomationStatus(tenantId, automationId, status) {
  if (!['draft', 'published', 'paused'].includes(status)) throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  const { rows } = await guardedSharedPool(
    `UPDATE crm_automations SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *`,
    [status, tenantId, positiveInt(automationId)]
  );
  if (!rows[0]) throw Object.assign(new Error('Automation not found'), { statusCode: 404 });
  return rows[0];
}

export async function getAutomation(tenantId, automationId) {
  const { rows } = await guardedSharedPool(`SELECT * FROM crm_automations WHERE tenant_id = $1 AND id = $2`, [tenantId, positiveInt(automationId)]);
  if (!rows[0]) throw Object.assign(new Error('Automation not found'), { statusCode: 404 });
  return rows[0];
}

export async function updateAutomation(tenantId, automationId, { name, description, triggerType, triggerConfig, delayMinutes, actionType, actionConfig }) {
  if (triggerType && !TRIGGER_TYPES.has(triggerType)) throw Object.assign(new Error(`Invalid trigger type. Use one of: ${[...TRIGGER_TYPES].join(', ')}`), { statusCode: 400 });
  if (actionType && !ACTION_TYPES.has(actionType)) throw Object.assign(new Error(`Invalid action type. Use one of: ${[...ACTION_TYPES].join(', ')}`), { statusCode: 400 });
  const { rows } = await guardedSharedPool(
    `UPDATE crm_automations SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       trigger_type = COALESCE($3, trigger_type), trigger_config = COALESCE($4, trigger_config),
       delay_minutes = COALESCE($5, delay_minutes), action_type = COALESCE($6, action_type),
       action_config = COALESCE($7, action_config), updated_at = NOW()
     WHERE tenant_id = $8 AND id = $9 RETURNING *`,
    [
      name || null, description ?? null, triggerType || null, triggerConfig ? JSON.stringify(triggerConfig) : null,
      delayMinutes == null ? null : Math.max(0, Number(delayMinutes) || 0), actionType || null,
      actionConfig ? JSON.stringify(actionConfig) : null, tenantId, positiveInt(automationId),
    ]
  );
  if (!rows[0]) throw Object.assign(new Error('Automation not found'), { statusCode: 404 });
  return rows[0];
}

/** List users who could be assigned as a lead owner — anyone with a CRM role set. Not tenant-scoped: CRM roles live on the shared users table, not per-tenant. */
export async function listAssignableUsers() {
  const { rows } = await guardedSharedPool(
    `SELECT id, email, metadata->>'crmRole' AS crm_role FROM users WHERE metadata->>'crmRole' IS NOT NULL ORDER BY email`
  );
  return rows;
}

export async function listAutomations(tenantId) {
  const { rows } = await guardedSharedPool(`SELECT * FROM crm_automations WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]);
  return rows;
}

export async function deleteAutomation(tenantId, automationId) {
  const { rowCount } = await guardedSharedPool(`DELETE FROM crm_automations WHERE tenant_id = $1 AND id = $2`, [tenantId, positiveInt(automationId)]);
  if (!rowCount) throw Object.assign(new Error('Automation not found'), { statusCode: 404 });
}

export async function listExecutions(tenantId, automationId, { limit = 50 } = {}) {
  const cappedLimit = Math.min(Math.max(positiveInt(limit) || 50, 1), 200);
  const { rows } = await guardedSharedPool(
    `SELECT e.*, ct.name AS lead_name, ct.email AS lead_email
     FROM crm_automation_executions e
     JOIN crm_leads_v2 lv ON lv.id = e.lead_id
     JOIN crm_contacts_v2 ct ON ct.id = lv.contact_id
     WHERE e.tenant_id = $1 AND e.automation_id = $2
     ORDER BY e.created_at DESC LIMIT $3`,
    [tenantId, positiveInt(automationId), cappedLimit]
  );
  return rows;
}

/** Find leads matching a trigger that don't have an execution row yet, and schedule them. */
async function _scheduleNewMatches(automation) {
  const { id: automationId, tenant_id: tenantId, trigger_type: triggerType, trigger_config: triggerConfig, delay_minutes: delayMinutes } = automation;
  let matchQuery;
  let params;

  if (triggerType === 'lead_created') {
    matchQuery = `SELECT lv.id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1`;
    params = [tenantId];
  } else if (triggerType === 'segment_entered') {
    const segmentId = positiveInt(triggerConfig?.segmentId);
    if (!segmentId) return 0;
    matchQuery = `SELECT lead_id AS id FROM crm_segment_members WHERE tenant_id = $1 AND segment_id = $2`;
    params = [tenantId, segmentId];
  } else if (triggerType === 'lifecycle_stage_changed') {
    const toStage = String(triggerConfig?.toStage || '');
    if (!toStage) return 0;
    matchQuery = `SELECT lv.id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.lifecycle_stage = $2`;
    params = [tenantId, toStage];
  } else if (triggerType === 'lead_score_above') {
    const threshold = Number(triggerConfig?.score);
    if (!Number.isFinite(threshold)) return 0;
    matchQuery = `SELECT lv.id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.score > $2`;
    params = [tenantId, threshold];
  } else if (triggerType === 'source_equals') {
    const source = String(triggerConfig?.source || '').trim();
    if (!source) return 0;
    matchQuery = `SELECT lv.id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.source_detail = $2`;
    params = [tenantId, source];
  } else if (triggerType === 'no_activity_days') {
    const days = Number(triggerConfig?.days);
    if (!Number.isFinite(days) || days < 0) return 0;
    matchQuery = `SELECT lv.id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.status = 'open' AND lv.updated_at <= NOW() - ($2 || ' days')::interval`;
    params = [tenantId, days];
  } else {
    return 0;
  }

  const { rows: candidates } = await guardedSharedPool(matchQuery, params);
  if (!candidates.length) return 0;

  // delay_minutes comes only from this automation's own row (never user input at call time), safe to interpolate as a validated integer.
  const safeDelayMinutes = Math.max(0, Math.trunc(Number(delayMinutes) || 0));
  const scheduledAt = `NOW() + interval '${safeDelayMinutes} minutes'`;
  const result = await guardedSharedPool(
    `INSERT INTO crm_automation_executions (tenant_id, automation_id, lead_id, scheduled_at)
     VALUES ${candidates.map((_, i) => `($1, $2, $${i + 3}, ${scheduledAt})`).join(',')}
     ON CONFLICT (automation_id, lead_id) DO NOTHING`,
    [tenantId, automationId, ...candidates.map((c) => c.id)]
  );
  return result.rowCount;
}

async function _runAction(automation, execution) {
  const { action_type: actionType, action_config: actionConfig, tenant_id: tenantId } = automation;
  const { rows } = await guardedSharedPool(
    `SELECT lv.id AS lead_id, ct.id AS contact_id, ct.name, ct.email, ct.phone_e164 AS phone
     FROM crm_leads_v2 lv JOIN crm_contacts_v2 ct ON ct.id = lv.contact_id
     WHERE lv.id = $1`,
    [execution.lead_id]
  );
  const lead = rows[0];
  if (!lead) throw new Error('Lead no longer exists');

  if (actionType === 'send_message') {
    const channel = actionConfig.channel;
    const to = channel === 'email' ? lead.email : lead.phone;
    if (!to) throw new Error(`Lead has no ${channel === 'email' ? 'email' : 'phone number'} on file`);
    const result = await dispatchToChannel({ channel, to, subject: actionConfig.subject, message: actionConfig.message });
    if (!result.success) throw new Error(result.error || 'Send failed');
    const conversationId = await findOrCreateConversation({ tenantId, leadId: lead.lead_id, channel }).catch(() => null);
    await guardedSharedPool(
      `INSERT INTO crm_communication_events (tenant_id, lead_id, contact_id, conversation_id, channel, direction, message_type, subject, body_preview, provider, provider_message_id, status, sent_at, metadata)
       VALUES ($1,$2,$3,$4,$5,'outbound','automation',$6,$7,$8,$9,'sent',NOW(),$10)`,
      [tenantId, lead.lead_id, lead.contact_id, conversationId, channel, actionConfig.subject || null, String(actionConfig.message || '').slice(0, 2000), result.provider, result.providerMessageId || null, JSON.stringify({ automation_id: automation.id })]
    );
    return;
  }

  if (actionType === 'add_tag') {
    const tag = String(actionConfig.tag || '').trim();
    if (!tag) throw new Error('No tag configured on this automation');
    await guardedSharedPool(
      `UPDATE crm_contacts_v2 SET tags = (SELECT jsonb_agg(DISTINCT t) FROM jsonb_array_elements_text(tags || $1::jsonb) t) WHERE id = $2`,
      [JSON.stringify([tag]), lead.contact_id]
    );
    return;
  }

  if (actionType === 'assign_owner') {
    const ownerUserId = positiveInt(actionConfig.ownerUserId);
    if (!ownerUserId) throw new Error('No owner configured on this automation');
    await guardedSharedPool(`UPDATE crm_leads_v2 SET owner_user_id = $1, assigned_at = NOW(), updated_at = NOW() WHERE id = $2`, [ownerUserId, lead.lead_id]);
    return;
  }

  throw new Error(`Unknown action type: ${actionType}`);
}

/**
 * Manually run an automation for one specific lead, regardless of trigger
 * matching or delay — an explicit override of the fire-once rule (replaces
 * any prior execution for this pair), for testing an automation or
 * deliberately re-running it on a lead. Runs synchronously so the caller
 * gets an immediate result instead of waiting for the next sweep.
 */
/** legacyLeadId: the id the rest of the CRM UI deals in (crm_leads.id) — resolved to the v2 mirror internally, same as sendCrmMessage. */
export async function runAutomationForLead(tenantId, automationId, legacyLeadId) {
  const automation = await getAutomation(tenantId, automationId);
  const v2Lead = await resolveV2LeadByLegacyId(positiveInt(legacyLeadId), tenantId);
  if (!v2Lead) throw Object.assign(new Error('Lead not found or not yet synced to the v2 CRM'), { statusCode: 404 });
  const leadId = v2Lead.id;

  await guardedSharedPool(`DELETE FROM crm_automation_executions WHERE automation_id = $1 AND lead_id = $2`, [automationId, leadId]);
  const { rows } = await guardedSharedPool(
    `INSERT INTO crm_automation_executions (tenant_id, automation_id, lead_id, scheduled_at) VALUES ($1,$2,$3,NOW()) RETURNING *`,
    [tenantId, automationId, leadId]
  );
  const execution = rows[0];

  try {
    await _runAction(automation, execution);
    await guardedSharedPool(`UPDATE crm_automation_executions SET status = 'completed', completed_at = NOW() WHERE id = $1`, [execution.id]);
    return { success: true, status: 'completed' };
  } catch (err) {
    await guardedSharedPool(`UPDATE crm_automation_executions SET status = 'failed', completed_at = NOW(), error = $1 WHERE id = $2`, [String(err.message).slice(0, 500), execution.id]);
    throw Object.assign(new Error(err.message || 'Automation run failed'), { statusCode: 502 });
  }
}

/** One tick: schedule new matches for every published automation, then run any executions that are due. */
export async function runAutomationTick() {
  const { rows: automations } = await guardedSharedPool(`SELECT * FROM crm_automations WHERE status = 'published'`);
  let scheduled = 0;
  for (const automation of automations) {
    try {
      scheduled += await _scheduleNewMatches(automation);
    } catch (err) {
      console.warn('[CRM Automations] scheduling failed for automation', automation.id, ':', err.message);
    }
  }

  const { rows: due } = await guardedSharedPool(
    `SELECT e.*, a.action_type, a.action_config, a.tenant_id AS automation_tenant_id, a.id AS automation_id_full
     FROM crm_automation_executions e
     JOIN crm_automations a ON a.id = e.automation_id
     WHERE e.status = 'scheduled' AND e.scheduled_at <= NOW() AND a.status = 'published'
     ORDER BY e.scheduled_at ASC LIMIT 200`
  );

  let completed = 0;
  let failed = 0;
  for (const execution of due) {
    const automation = { id: execution.automation_id, tenant_id: execution.automation_tenant_id, action_type: execution.action_type, action_config: execution.action_config };
    try {
      await _runAction(automation, execution);
      await guardedSharedPool(`UPDATE crm_automation_executions SET status = 'completed', completed_at = NOW() WHERE id = $1`, [execution.id]);
      completed++;
    } catch (err) {
      await guardedSharedPool(`UPDATE crm_automation_executions SET status = 'failed', completed_at = NOW(), error = $1 WHERE id = $2`, [String(err.message).slice(0, 500), execution.id]);
      failed++;
    }
  }

  return { automationsEvaluated: automations.length, scheduled, completed, failed };
}

export default {
  ensureCrmAutomationsSchema, createAutomation, updateAutomationStatus, listAutomations,
  deleteAutomation, listExecutions, runAutomationTick, getAutomation, updateAutomation,
  listAssignableUsers, runAutomationForLead,
};
