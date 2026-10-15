/**
 * CRM agent runner — WS-A Phase A1.
 *
 * Runs a bounded tool-calling loop: the LLM (via mediqzy's mandated gateway, ai-brain/llm-provider.js)
 * decides which read-only CRM tool to call; the runner executes it with the caller's RBAC scope,
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

const MAX_ITERATIONS = 5;
const MAX_TOOL_FAILURES = 3;
const MAX_TOOL_RESULT_CHARS = 8000;

const SYSTEM_PROMPT = `You are the Mediqzy CRM assistant operating a healthcare provider's CRM.
You can read lead and contact data, and PROPOSE changes, by calling the provided tools. Rules:
- Use tools to look up real data; never invent leads, contacts, numbers or statuses.
- Read tools return data directly. Write tools (assign/status/stage) only PREPARE a change — they do
  not apply it. Tell the user exactly what you have prepared and that they must confirm it; never
  claim a change was made.
- You operate the administrative CRM only. Never give clinical, diagnostic, triage or treatment advice.
- Be concise. When you have enough from the tools, answer directly and stop calling tools.`;

const toInt = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : null; };

async function audit({ tenantId, tenantUid, crmUser }, { action, toolName, args, ok, resultSummary }) {
  const reasons = {
    read: 'agentic CRM operator — read',
    preview: 'agentic CRM operator — proposed change (not applied)',
    apply: 'agentic CRM operator — change applied after confirmation',
  };
  // crm_audit_log.tenant_id/entity_id/actor_user_id are bigint — only numeric ids go there. The
  // unambiguous tenant_uid is recorded too (text column); the tool name lives in event_type + metadata.
  const tid = toInt(tenantId);
  if (tid === null) { console.error('[crm-agent] audit skipped — non-numeric tenantId'); return; }
  const entityId = toInt(args?.leadId ?? args?.id);
  try {
    await pool.query(
      `INSERT INTO crm_audit_log (tenant_id, tenant_uid, entity_type, entity_id, event_type, actor_user_id, actor_role, new_value, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb)`,
      [tid, tenantUid || null, entityId !== null ? 'crm_lead' : 'crm_agent', entityId, `agent.${action}.${toolName}`,
        toInt(crmUser.id), crmUser.role || null, JSON.stringify(args || {}),
        reasons[action] || 'agentic CRM operator', JSON.stringify({ tool: toolName, ok, resultSummary })]);
  } catch (err) {
    // Audit must never break the agent turn; a failed audit is logged to stderr only.
    console.error(`[crm-agent] audit write failed for tool ${toolName}: ${err.message}`);
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
  const ctx = { pool, tenantUid: crmUser.tenantUid, tenantId: crmUser.tenantId, crmUser };
  const tools = toolDefinitions();

  const convo = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
  const toolTrace = [];
  const pendingActions = [];   // staged write proposals awaiting human confirmation (never applied here)
  let failures = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await llmProvider.chat({
      messages: convo, tools, toolChoice: 'auto', skipCache: true, maxTokens: 1024,
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
            pendingActions.push({ tool: name, args, preview: p });
            result = { staged: true, ...p, note: 'PREPARED, NOT APPLIED. The user must confirm this change before it takes effect.' };
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
          toolTrace, pendingActions, iterations: i + 1, stopReason: 'circuit_breaker', provider: res.provider };
      }
    }
  }

  // Ran out of tool-calling iterations — force a final, tool-free answer from what we gathered.
  const final = await llmProvider.chat({ messages: convo, toolChoice: 'none', skipCache: true, maxTokens: 1024 });
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
export async function applyCrmAgentAction({ crmUser, toolName, args }) {
  if (!crmUser?.tenantUid) throw new Error('crmUser.tenantUid is required');
  const tool = TOOLS[toolName];
  if (!tool || !tool.write) return { error: 'not_a_write_tool', tool: toolName };
  if (!hasCRMCapability(crmUser, tool.capability)) return { error: 'permission_denied', capability: tool.capability };

  const ctx = { pool, tenantUid: crmUser.tenantUid, tenantId: crmUser.tenantId, crmUser };
  let result;
  try {
    result = await tool.apply(args || {}, ctx);
  } catch (err) {
    result = { error: 'tool_failed', message: err.message };
  }
  const ok = !result?.error;
  await audit(ctx, { action: 'apply', toolName, args, ok, resultSummary: ok ? Object.keys(result) : result.error });
  return result;
}
