/**
 * CRM agent runner — WS-A AgenticCRM operator.
 *
 * Runs a bounded tool-calling loop: the LLM (via mediqzy's mandated gateway, ai-brain/llm-provider.js)
 * decides which tenant-scoped CRM tool to call; the runner executes it with the caller's RBAC scope,
 * audits every call to crm_audit_log, feeds the result back, and loops until the model answers or a
 * guardrail trips.
 *
 * Guardrails (ported in spirit from AgenticCRM's MIT patterns, re-implemented): bounded iterations,
 * a tool-failure circuit breaker, and skipCache for the agentic path. The agent can never exceed the
 * human's permissions (every tool checks hasCRMCapability against the caller's role) and is fenced
 * out of clinical actions (only administrative CRM tools are registered — see tool-registry.js).
 */
import pool from '../../db/pgPool.js';
import llmProvider from '../ai-brain/llm-provider.js';
import { hasCRMCapability } from '../../config/crm-roles.config.js';
import { TOOLS, toolDefinitions } from './tool-registry.js';
import { MAX_ITERATIONS, MAX_TOOL_FAILURES, PROPOSAL_TTL_MS, proposalMatches, isProposalExpired } from './guardrails.js';
const MAX_TOOL_RESULT_CHARS = 8000;
// CRM's primary LLM: Sarvam (Indic/multilingual), preferred-first with full cascade fallback.
// Overridable via CRM_LLM_PROVIDER (e.g. 'sib' to revert to the platform default).
const CRM_LLM_PROVIDER = process.env.CRM_LLM_PROVIDER || 'sarvam';

const SYSTEM_PROMPT = `You are the Mediqzy CRM assistant operating a healthcare provider's CRM.
You can read tenant-scoped lead, contact, deal, task and conversation data, and PROPOSE changes, by calling the provided tools. Rules:
- Use tools to look up real data; never invent leads, contacts, numbers or statuses.
- Read tools return data directly. Write tools only PREPARE a change — they do
  not apply it. Tell the user exactly what you have prepared and that they must confirm it; never
  claim a change was made. Each proposal has an expiry and must be confirmed by its proposalId.
- Memory is for non-sensitive workflow preferences only; never store patient identifiers, credentials or clinical data.
- You operate the administrative CRM only. Never give clinical, diagnostic, triage or treatment advice.
- Be concise. When you have enough from the tools, answer directly and stop calling tools.`;

const toInt = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : null; };

async function persistProposal(ctx, { toolName, args, preview }) {
  const actor = toInt(ctx.crmUser?.id);
  if (actor === null) return { error: 'actor_id_required' };
  const { rows } = await pool.query(
    `INSERT INTO crm_agent_proposals (tenant_uid, corporate_uid, actor_user_id, tool_name, args, preview, expires_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW() + INTERVAL '15 minutes')
     RETURNING id, expires_at`,
    [ctx.tenantUid, ctx.corporateUid || null, actor, toolName, JSON.stringify(args || {}), JSON.stringify(preview || {})]);
  return rows[0];
}

async function audit({ pool: auditPool = pool, tenantId, tenantUid, corporateUid, crmUser }, { action, toolName, args, ok, resultSummary }) {
  const reasons = {
    read: 'agentic CRM operator — read',
    preview: 'agentic CRM operator — proposed change (not applied)',
    apply: 'agentic CRM operator — change applied after confirmation',
  };
  // crm_audit_log.tenant_id/entity_id/actor_user_id are bigint — only numeric ids go there. The
  // unambiguous tenant_uid is recorded too (text column); the tool name lives in event_type + metadata.
  const tid = toInt(tenantId);
  if (tid === null) {
    const error = new Error('CRM audit requires a numeric tenant id');
    error.code = 'CRM_AUDIT_WRITE_FAILED';
    throw error;
  }
  const entityId = toInt(args?.leadId ?? args?.dealId ?? args?.taskId ?? args?.conversationId ?? args?.id);
  const entityType = args?.dealId != null ? 'crm_deal' : (args?.taskId != null ? 'crm_task' : (args?.conversationId != null ? 'crm_conversation' : (entityId !== null ? 'crm_lead' : 'crm_agent')));
  try {
    await auditPool.query(
      `INSERT INTO crm_audit_log (tenant_id, tenant_uid, corporate_uid, entity_type, entity_id, event_type, actor_user_id, actor_role, new_value, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb)`,
      [tid, tenantUid || null, corporateUid || null, entityType, entityId, `agent.${action}.${toolName}`,
        toInt(crmUser.id), crmUser.role || null, JSON.stringify(args || {}),
        reasons[action] || 'agentic CRM operator', JSON.stringify({ tool: toolName, ok, resultSummary })]);
  } catch (err) {
    // Audit is part of the operation's transaction. If it cannot be written, propagate the error
    // so reads fail closed and confirmed writes roll back instead of becoming unaudited changes.
    const error = new Error(`CRM audit write failed for ${toolName}: ${err.message}`);
    error.code = 'CRM_AUDIT_WRITE_FAILED';
    error.cause = err;
    throw error;
  }
}

/**
 * @param {object} opts
 * @param {object} opts.crmUser  - req.crmUser ({ id, role, tenantId, ... })
 * @param {Array}  opts.messages - [{ role:'user'|'assistant', content }]
 * @returns {Promise<{ reply, toolTrace, iterations, stopReason, provider }>}
 */
export async function runCrmAgent({ crmUser, messages }) {
  if (!crmUser?.tenantUid) throw new Error('crmUser.tenantUid is required (CRM data is scoped by the unambiguous entity uid)');
  const ctx = { pool, tenantUid: crmUser.tenantUid, tenantId: crmUser.tenantId, corporateUid: crmUser.corporateUid || null, crmUser };
  const tools = toolDefinitions();

  const convo = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
  const toolTrace = [];
  const pendingActions = [];   // staged write proposals awaiting human confirmation (never applied here)
  let failures = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await llmProvider.chat({
      messages: convo, tools, toolChoice: 'auto', skipCache: true, maxTokens: 1024,
      preferProvider: CRM_LLM_PROVIDER,   // Sarvam-first for CRM, cascade fallback
    });
    const calls = res.toolCalls || [];

    if (!calls.length) {
      return { reply: res.content || '', toolTrace, pendingActions, iterations: i, stopReason: 'answered', provider: res.provider };
    }

    // Keep the assistant turn (with its tool_calls) in history before appending tool results.
    convo.push({ role: 'assistant', content: res.content || null, tool_calls: calls });

    for (const tc of calls) {
      const name = tc.function?.name;
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }

      let result;
      let action = 'read';
      const tool = TOOLS[name];
      if (!tool) {
        result = { error: 'unknown_tool', tool: name };
      } else if (!hasCRMCapability(crmUser, tool.capability)) {
        result = { error: 'permission_denied', capability: tool.capability };
      } else if (tool.write) {
        // A write is NEVER applied inside the agent loop — only previewed/staged. The human confirms
        // it out-of-band via applyCrmAgentAction(). This is the "confirm step" from the upgrade plan.
        action = 'preview';
        try {
          const p = await tool.preview(args, ctx);
          if (p?.ok) {
            const proposal = await persistProposal(ctx, { toolName: name, args, preview: p });
            if (proposal?.error) result = proposal;
            else {
              pendingActions.push({ proposalId: proposal.id, tool: name, args, preview: p, expiresAt: proposal.expires_at });
              result = { staged: true, proposalId: proposal.id, expiresAt: proposal.expires_at, ...p, note: 'PREPARED, NOT APPLIED. Confirm this proposal before it takes effect.' };
            }
          } else {
            result = p || { error: 'preview_failed' };
          }
        } catch (err) {
          result = { error: 'tool_failed', message: err.message };
        }
      } else {
        try {
          result = await tool.handler(args, ctx);
        } catch (err) {
          result = { error: 'tool_failed', message: err.message };
        }
      }

      const ok = !result?.error;
      if (!ok) failures += 1;
      toolTrace.push({ tool: name, args, ok, staged: action === 'preview' && ok, error: result?.error || null });
      await audit(ctx, { action, toolName: name || 'unknown', args, ok, resultSummary: ok ? Object.keys(result) : result.error });

      convo.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
      });

      if (failures >= MAX_TOOL_FAILURES) {
        return { reply: 'I hit repeated tool errors and stopped. Please try again or narrow the request.',
          toolTrace, pendingActions, iterations: i + 1, stopReason: 'circuit_breaker',
          escalation: { required: true, reason: 'tool_failure_threshold_reached' }, provider: res.provider };
      }
    }
  }

  // Ran out of tool-calling iterations — force a final, tool-free answer from what we gathered.
  const final = await llmProvider.chat({ messages: convo, toolChoice: 'none', skipCache: true, maxTokens: 1024, preferProvider: CRM_LLM_PROVIDER });
  return { reply: final.content || '', toolTrace, pendingActions, iterations: MAX_ITERATIONS, stopReason: 'max_iterations', provider: final.provider };
}

/**
 * Apply ONE staged write after explicit human confirmation. Called by the /agent/confirm endpoint,
 * never by the agent loop. Re-checks RBAC and re-validates inside the tool's own apply(); audited as
 * an applied change.
 * @param {object} opts
 * @param {object} opts.crmUser   - req.crmUser
 * @param {string} opts.toolName  - a write tool name
 * @param {object} opts.args      - the same args that were previewed
 */
export async function applyCrmAgentAction({ crmUser, proposalId, toolName, args }) {
  if (!crmUser?.tenantUid) throw new Error('crmUser.tenantUid is required');
  if (!proposalId) return { error: 'proposal_id_required' };
  const tool = TOOLS[toolName];
  if (!tool || !tool.write) return { error: 'not_a_write_tool', tool: toolName };
  if (!hasCRMCapability(crmUser, tool.capability)) return { error: 'permission_denied', capability: tool.capability };

  const client = await pool.connect();
  const ctx = { pool: client, tenantUid: crmUser.tenantUid, tenantId: crmUser.tenantId, corporateUid: crmUser.corporateUid || null, crmUser };
  const actor = toInt(crmUser.id);
  try {
    await client.query('BEGIN');
    if (actor === null) { await client.query('ROLLBACK'); return { error: 'actor_id_required' }; }
    const { rows: proposalRows } = await client.query(
      `UPDATE crm_agent_proposals
          SET status='confirmed', confirmed_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND tenant_uid=$2 AND corporate_uid IS NOT DISTINCT FROM $3 AND actor_user_id=$4 AND tool_name=$5 AND args=$6::jsonb AND status='pending' AND expires_at>NOW()
        RETURNING id, tenant_uid, actor_user_id, tool_name, args, preview, status, expires_at`,
      [proposalId, ctx.tenantUid, ctx.corporateUid || null, actor, toolName, JSON.stringify(args || {})]);
    const proposal = proposalRows[0];
    if (!proposal) {
      const { rows: existing } = await client.query(`SELECT status, expires_at, tool_name, args, corporate_uid FROM crm_agent_proposals WHERE id=$1 AND tenant_uid=$2 AND corporate_uid IS NOT DISTINCT FROM $3 AND actor_user_id=$4 FOR UPDATE`, [proposalId, ctx.tenantUid, ctx.corporateUid || null, actor]);
      if (!existing[0]) { await client.query('ROLLBACK'); return { error: 'proposal_not_found' }; }
      if (existing[0].status === 'pending' && isProposalExpired(existing[0])) {
        await client.query(`UPDATE crm_agent_proposals SET status='expired', updated_at=NOW() WHERE id=$1`, [proposalId]);
        await client.query('COMMIT');
        return { error: 'proposal_expired' };
      }
      await client.query('ROLLBACK');
      if (existing[0].status === 'pending' && (existing[0].tool_name !== toolName || !proposalMatches(existing[0], { tenantUid: ctx.tenantUid, corporateUid: ctx.corporateUid, actorUserId: actor, toolName, args }))) return { error: 'proposal_mismatch' };
      return { error: 'proposal_not_pending', status: existing[0].status };
    }
    if (proposal.tool_name !== toolName || !proposalMatches(proposal, { tenantUid: ctx.tenantUid, corporateUid: ctx.corporateUid, actorUserId: actor, toolName, args })) {
      await client.query('ROLLBACK');
      return { error: 'proposal_mismatch' };
    }
    let result;
    try {
      result = await tool.apply(args || {}, ctx);
    } catch (err) {
      result = { error: 'tool_failed', message: err.message };
    }
    const ok = !result?.error;
    await audit(ctx, { action: 'apply', toolName, args, ok, resultSummary: ok ? Object.keys(result) : result.error });
    await client.query(`UPDATE crm_agent_proposals SET status=$2, applied_at=CASE WHEN $2='applied' THEN NOW() ELSE applied_at END, updated_at=NOW() WHERE id=$1`, [proposalId, ok ? 'applied' : 'confirmed']);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
