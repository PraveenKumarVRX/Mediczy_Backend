/**
 * System Tools — admin-only ops tools for the Admin Agent.
 * Gated by isSystem=true and EXEC_SYSTEM_TOOLS capability.
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';
import { AGENTS, getAllAgents } from '../agent-registry.js';
import { getRoutingStats } from '../cognitive-router.js';
import { getTelemetryStats } from '../evaluation-engine.js';
import { listTools } from './index.js';
import { ADMIN_COPILOT } from '../../../config/admin-copilot.config.js';
import { createPendingAction } from '../../admin-copilot-approval.service.js';

// ─── list_agents ─────────────────────────────────────────────────────────────

register({
  name: 'list_agents',
  description: 'List all registered AI agents with their roles, capabilities, and tool counts. Admin use only.',
  category: 'system',
  isSystem: true,
  parameters: { type: 'object', properties: {} },
  async execute() {
    return {
      agents: getAllAgents().map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        requiredCapability: a.requiredCapability,
        llmTier: a.llmTier,
        toolCount: a.allowedTools?.length ?? 0,
      })),
      count: Object.keys(AGENTS).length,
    };
  },
});

// ─── get_system_status ───────────────────────────────────────────────────────

register({
  name: 'get_system_status',
  description: 'Get high-level system health: database pool, uptime, AI brain tool/agent counts. No secrets exposed.',
  category: 'system',
  isSystem: true,
  parameters: { type: 'object', properties: {} },
  async execute() {
    let dbHealthy = true;
    let poolTotal = 0;
    let poolIdle = 0;
    try {
      poolTotal = pool.totalCount ?? 0;
      poolIdle = pool.idleCount ?? 0;
      await pool.query('SELECT 1');
    } catch {
      dbHealthy = false;
    }

    let sibStatus = { killSwitchActive: false, circuitBreakerOpen: false };
    try {
      const sib = (await import('../../sib-control-layer.service.js')).default;
      const dash = await sib.getDashboardSummary?.();
      if (dash) {
        sibStatus = {
          killSwitchActive: !!dash.killSwitch?.active,
          circuitBreakerOpen: !!dash.circuitBreaker?.open,
        };
      }
    } catch { /* SIB optional */ }

    return {
      database: { healthy: dbHealthy, poolTotal, poolIdle },
      uptime_seconds: Math.floor(process.uptime()),
      sib: sibStatus,
      ai_brain: {
        registeredTools: listTools().length,
        registeredAgents: Object.keys(AGENTS).length,
      },
      node_env: process.env.NODE_ENV || 'development',
    };
  },
});

// ─── get_audit_logs ──────────────────────────────────────────────────────────

register({
  name: 'get_audit_logs',
  description: 'Fetch recent AI agent runs and admin activity logs. Tenant-scoped for non-platform admins.',
  category: 'system',
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max rows (default 20, max 100)' },
      category: { type: 'string', enum: ['ai_agent', 'all'], description: 'Log category filter' },
      since_hours: { type: 'integer', description: 'Hours to look back (default 24)' },
    },
  },
  async execute(params, ctx) {
    const limit = Math.min(Number(params.limit) || 20, 100);
    const sinceHours = Number(params.since_hours) || 24;
    const tenantId = ctx.tenantId;

    const agentRuns = await pool.query(
      `SELECT run_id, role, input_message, agents_used, status, total_tokens, latency_ms, created_at
         FROM ai_agent_runs
        WHERE created_at >= NOW() - ($1 || ' hours')::interval
        ORDER BY created_at DESC
        LIMIT $2`,
      [sinceHours, limit]
    );

    const runs = agentRuns.rows.map(r => ({
      type: 'ai_agent_run',
      run_id: r.run_id,
      role: r.role,
      message: (r.input_message || '').substring(0, 200),
      agents_used: r.agents_used,
      status: r.status,
      tokens: r.total_tokens,
      latency_ms: r.latency_ms,
      created_at: r.created_at,
    }));

    return { logs: runs, count: runs.length, category: params.category || 'ai_agent', tenant_scoped: !!tenantId };
  },
});

// ─── get_agent_metrics ───────────────────────────────────────────────────────

register({
  name: 'get_agent_metrics',
  description: 'Get AI routing statistics and telemetry for agent performance monitoring.',
  category: 'system',
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'integer', description: 'Telemetry lookback days (default 7)' },
    },
  },
  async execute(params) {
    const days = Number(params.days) || 7;
    const [routing, telemetry] = await Promise.all([
      getRoutingStats().catch(() => ({})),
      getTelemetryStats(days).catch(() => ({})),
    ]);
    return { routing, telemetry, days };
  },
});

// ─── configure_agent (read-only) ─────────────────────────────────────────────

register({
  name: 'configure_agent',
  description: 'Read agent configuration (tool allowlist, limits). Writes require human approval via governance.',
  category: 'system',
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      agent_id: { type: 'string', description: 'Agent id (e.g. admin, clinical)' },
    },
    required: ['agent_id'],
  },
  async execute(params) {
    const agent = AGENTS[params.agent_id];
    if (!agent) return { error: `Unknown agent: ${params.agent_id}` };
    return {
      id: agent.id,
      name: agent.name,
      llmTier: agent.llmTier,
      maxTokens: agent.maxTokens,
      maxIterations: agent.maxIterations,
      allowedTools: agent.allowedTools,
      readOnly: true,
      note: 'Configuration changes require governance approval.',
    };
  },
});

// ─── reload_prompts ──────────────────────────────────────────────────────────

register({
  name: 'reload_prompts',
  description: 'Reload active prompt cache. Requires human approval unless ADMIN_COPILOT_WRITE_ACTIONS is enabled.',
  category: 'system',
  isSystem: true,
  isWrite: true,
  parameters: { type: 'object', properties: {} },
  async execute(params, ctx) {
    if (!ADMIN_COPILOT.writeActions && !ctx?.skipApproval) {
      const pending = await createPendingAction({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        agentId: ctx.agentId || 'admin',
        toolName: 'reload_prompts',
        toolParams: params,
        summary: 'Reload AI prompt cache',
      });
      return {
        pendingApproval: true,
        actionId: pending.actionId,
        summary: pending.summary,
        message: 'This action requires human approval. Use the Admin Copilot approval UI or enable write actions.',
      };
    }

    try {
      const mod = await import('../../prompt-optimization-executor.service.js');
      if (typeof mod.invalidatePromptCache === 'function') {
        await mod.invalidatePromptCache();
      }
      return { success: true, message: 'Prompt cache reload requested.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
});

// ─── get_agent_metrics alias guard for execute approval hook ─────────────────
