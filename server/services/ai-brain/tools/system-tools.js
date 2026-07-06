/**
 * System tools for Admin Agent (ops copilot).
 * Read-only by default; write tools require approval when ADMIN_COPILOT_WRITE_ACTIONS !== 'true'.
 */

import { register } from './index.js';
import pool from '../../../db/pgPool.js';
import sharedPool from '../../../db/pgPool.js';
import { getAllAgents } from '../agent-registry.js';
import { listTools } from './index.js';
import { getRoutingStats } from '../cognitive-router.js';
import { getTelemetryStats } from '../evaluation-engine.js';
import sibControlLayer from '../../sib-control-layer.service.js';
import { flushFeedbackCache } from '../../../utils/quality-cache.js';
import { ROLES } from '../agent-permission-engine.js';

function isPlatformAdmin(identity) {
  return identity?.role === ROLES.PLATFORM_ADMIN;
}

register({
  name: 'list_agents',
  description: 'List registered AI agents with id, name, description, and required capability. Does not expose internal prompts.',
  category: 'system',
  isWrite: false,
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute() {
    return {
      agents: getAllAgents().map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        requiredCapability: a.requiredCapability,
        llmTier: a.llmTier,
        toolCount: a.allowedTools?.length || 0,
      })),
      count: getAllAgents().length,
    };
  },
});

register({
  name: 'get_system_status',
  description: 'Return non-sensitive platform health: database pool, uptime, SIB guard status, AI brain tool/agent counts.',
  category: 'system',
  isWrite: false,
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute() {
    const sibStatus = typeof sibControlLayer.getStatus === 'function'
      ? sibControlLayer.getStatus()
      : { killSwitchActive: !!sibControlLayer.killSwitchActive };

    let poolStats = { healthy: false };
    try {
      const { rows } = await sharedPool.query('SELECT 1 AS ok');
      poolStats = {
        healthy: rows[0]?.ok === 1,
        total: sharedPool.totalCount,
        idle: sharedPool.idleCount,
        waiting: sharedPool.waitingCount,
      };
    } catch {
      poolStats = { healthy: false };
    }

    const tools = listTools();
    return {
      database: poolStats,
      uptime_seconds: Math.floor(process.uptime()),
      sib: {
        killSwitchActive: !!sibStatus.killSwitchActive,
        circuitBreakerOpen: !!sibStatus.circuitBreakerOpen,
      },
      ai_brain: {
        registeredTools: tools.length,
        registeredAgents: getAllAgents().length,
        systemTools: tools.filter((t) => t.isSystem).length,
      },
      environment: process.env.NODE_ENV || 'development',
    };
  },
});

register({
  name: 'get_audit_logs',
  description: 'Fetch recent AI agent runs and admin activity. Tenant-scoped for hospital admins.',
  category: 'system',
  isWrite: false,
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max rows (default 20, max 100)' },
      category: { type: 'string', enum: ['ai_agent', 'admin_action', 'governance', 'all'] },
      since_hours: { type: 'integer', description: 'Look back hours (default 24)' },
    },
    required: [],
  },
  async execute(params, ctx) {
    const limit = Math.min(Number(params.limit) || 20, 100);
    const sinceHours = Math.min(Number(params.since_hours) || 24, 168);
    const category = params.category || 'all';
    const identity = ctx.identity || {};
    const orgId = identity.orgId || identity.tenantId;

    const agentRuns = [];
    if (category === 'all' || category === 'ai_agent') {
      const values = [limit, sinceHours];
      let orgClause = '';
      if (!isPlatformAdmin(identity) && orgId) {
        values.push(orgId);
        orgClause = ` AND org_id = $${values.length}`;
      }
      const { rows } = await pool.query(
        `SELECT run_id, user_id, role, LEFT(input_message, 200) AS input_preview,
                agents_used, status, total_tokens, latency_ms, metadata, created_at
           FROM ai_agent_runs
          WHERE created_at >= NOW() - make_interval(hours => $2)
          ${orgClause}
          ORDER BY created_at DESC
          LIMIT $1`,
        values
      );
      agentRuns.push(...rows.map((r) => ({
        type: 'ai_agent_run',
        ...r,
        metadata: r.metadata || {},
      })));
    }

    let adminActions = [];
    if (category === 'all' || category === 'admin_action') {
      try {
        const { rows } = await pool.query(
          `SELECT id, user_id, action, module, details, created_at
             FROM user_activity_logs
            WHERE created_at >= NOW() - make_interval(hours => $1)
            ORDER BY created_at DESC
            LIMIT $2`,
          [sinceHours, Math.min(limit, 50)]
        );
        adminActions = rows.map((r) => ({
          type: 'admin_action',
          id: r.id,
          userId: r.user_id,
          action: r.action,
          module: r.module,
          createdAt: r.created_at,
        }));
      } catch {
        adminActions = [];
      }
    }

    return {
      category,
      sinceHours,
      aiAgentRuns: agentRuns,
      adminActions,
      count: agentRuns.length + adminActions.length,
    };
  },
});

register({
  name: 'get_agent_metrics',
  description: 'Return cognitive routing and agent telemetry summary for the last N days.',
  category: 'system',
  isWrite: false,
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'integer', description: 'Days of history (default 7, max 90)' },
    },
    required: [],
  },
  async execute(params) {
    const days = Math.min(Number(params.days) || 7, 90);
    const [routing, telemetry] = await Promise.all([
      getRoutingStats(days).catch(() => null),
      getTelemetryStats(days).catch(() => null),
    ]);
    return { days, routing, telemetry };
  },
});

register({
  name: 'configure_agent',
  description: 'Read agent configuration (allowlisted tools, tiers, iteration limits). Read-only in v1.',
  category: 'system',
  isWrite: false,
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      agent_id: { type: 'string', description: 'Agent id e.g. admin, clinical, analyst' },
    },
    required: ['agent_id'],
  },
  async execute(params) {
    const agent = getAllAgents().find((a) => a.id === params.agent_id);
    if (!agent) {
      return { error: `Unknown agent: ${params.agent_id}` };
    }
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      llmTier: agent.llmTier,
      maxTokens: agent.maxTokens,
      maxIterations: agent.maxIterations,
      allowedTools: agent.allowedTools,
      requiredCapability: agent.requiredCapability,
      readOnly: true,
    };
  },
});

register({
  name: 'reload_prompts',
  description: 'Invalidate prompt / feedback cache so orchestrator picks up latest prompt versions. Requires human approval.',
  category: 'system',
  isWrite: true,
  isSystem: true,
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Reason for cache reload' },
    },
    required: [],
  },
  async execute(params, ctx) {
    if (ctx?.skipWriteExecution) {
      return { error: 'Write execution skipped — awaiting approval' };
    }
    const keysDeleted = await flushFeedbackCache();
    return {
      success: true,
      message: 'Prompt cache flushed',
      keysDeleted,
      reason: params.reason || 'Admin copilot reload',
    };
  },
});
