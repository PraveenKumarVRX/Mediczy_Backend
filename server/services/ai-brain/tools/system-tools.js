/**
 * System Tools — Admin Agent only (EXEC_SYSTEM_TOOLS capability required)
 *
 * Tools:
 *   list_agents          — return agent registry with access metadata
 *   get_system_status    — pool stats, SIB status, PM2-style uptime
 *   get_audit_logs       — recent api_audit_logs entries (tenant-scoped)
 *   get_agent_metrics    — aggregated ai_agent_runs stats
 *   get_governance_queue — pending model changes from ai_model_change_log
 *
 * All read-only. Write/configure tools are Phase 5 and require a pending-
 * actions table + human approval modal in the UI.
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';
import { getAllAgents } from '../agent-registry.js';
import sibControlLayer from '../../sib-control-layer.service.js';

// ── list_agents ───────────────────────────────────────────────────────────────
register({
  name:        'list_agents',
  description: 'List all registered AI agents, their capabilities, allowed tools, and whether the requesting admin can invoke them.',
  category:    'system',
  isSystem:    true,
  parameters: {
    type: 'object',
    properties: {
      include_tools: {
        type: 'boolean',
        description: 'If true, include the full allowed-tool list for each agent (verbose). Default false.',
      },
    },
    required: [],
  },
  async execute({ include_tools = false } = {}, context = {}) {
    const agents = getAllAgents();

    const summary = agents.map(a => ({
      id:               a.id,
      name:             a.name,
      description:      a.description,
      llmTier:          a.llmTier,
      maxTokens:        a.maxTokens,
      maxIterations:    a.maxIterations,
      requiredCapability: a.requiredCapability,
      accessible:       context.capabilities?.includes(a.requiredCapability) ?? null,
      ...(include_tools ? { allowedTools: a.allowedTools } : {}),
    }));

    return {
      total: summary.length,
      agents: summary,
      requestingRole: context.role ?? 'unknown',
    };
  },
});

// ── get_system_status ─────────────────────────────────────────────────────────
register({
  name:        'get_system_status',
  description: 'Return system health: DB pool stats, SIB AI Guard status (kill switch, circuit breakers, rate limits), and server uptime.',
  category:    'system',
  isSystem:    true,
  parameters: {
    type:       'object',
    properties: {},
    required:   [],
  },
  async execute(_params = {}, _context = {}) {
    // DB pool stats
    let poolStats = null;
    try {
      const { rows } = await pool.query(`
        SELECT count(*) AS total,
               sum(CASE WHEN state = 'active' THEN 1 ELSE 0 END)  AS active,
               sum(CASE WHEN state = 'idle'   THEN 1 ELSE 0 END)  AS idle,
               sum(CASE WHEN wait_event IS NOT NULL THEN 1 ELSE 0 END) AS waiting
        FROM pg_stat_activity
        WHERE application_name ILIKE '%node%' OR application_name ILIKE '%mediczy%'
      `);
      poolStats = rows[0];
    } catch (e) {
      poolStats = { error: e.message };
    }

    // SIB status
    let sibStatus = null;
    try {
      sibStatus = {
        killSwitchActive: sibControlLayer.killSwitchActive ?? false,
        circuitBreakers:  Object.fromEntries(sibControlLayer.circuitBreakers ?? new Map()),
      };
    } catch {
      sibStatus = { error: 'SIB control layer unavailable' };
    }

    return {
      timestamp:    new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMB:     {
        heapUsed:  Math.round(process.memoryUsage().heapUsed  / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss:       Math.round(process.memoryUsage().rss       / 1024 / 1024),
      },
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? 'unknown',
      database:    poolStats,
      sib:         sibStatus,
    };
  },
});

// ── get_audit_logs ────────────────────────────────────────────────────────────
register({
  name:        'get_audit_logs',
  description: 'Retrieve recent audit log entries for this tenant. Returns actor, action, resource, and timestamp. Scoped to the requesting user\'s tenant.',
  category:    'system',
  isSystem:    true,
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type:        'integer',
        description: 'Number of entries to return (default 20, max 100).',
        default:     20,
      },
      action_filter: {
        type:        'string',
        description: 'Optional: filter by action keyword (e.g. "appointment", "login", "risk_score").',
      },
      actor_type_filter: {
        type:        'string',
        enum:        ['user', 'system', 'admin', 'cron'],
        description: 'Optional: filter by actor type.',
      },
    },
    required: [],
  },
  async execute({ limit = 20, action_filter, actor_type_filter } = {}, context = {}) {
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const tenantId  = context.tenantId ? parseInt(context.tenantId) : null;

    if (!tenantId) {
      return { error: 'Tenant context required for audit log access' };
    }

    const conditions = ['tenant_id = $1'];
    const params     = [tenantId];
    let   i          = 2;

    if (action_filter) {
      conditions.push(`action ILIKE $${i++}`);
      params.push(`%${action_filter}%`);
    }
    if (actor_type_filter) {
      conditions.push(`actor_type = $${i++}`);
      params.push(actor_type_filter);
    }

    const { rows } = await pool.query(
      `SELECT log_id, actor_id, actor_type, action, resource_type, resource_id,
              created_at, ip_address
       FROM api_audit_logs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${i}`,
      [...params, safeLimit]
    );

    return {
      tenantId,
      count:  rows.length,
      entries: rows.map(r => ({
        id:           r.log_id,
        actor:        r.actor_id,
        actorType:    r.actor_type,
        action:       r.action,
        resourceType: r.resource_type,
        resourceId:   r.resource_id,
        timestamp:    r.created_at,
        ip:           r.ip_address,
      })),
    };
  },
});

// ── get_agent_metrics ─────────────────────────────────────────────────────────
register({
  name:        'get_agent_metrics',
  description: 'Return aggregated AI agent run statistics: total runs, success rate, average latency, and tool usage breakdown for each agent over the past 24 hours.',
  category:    'system',
  isSystem:    true,
  parameters: {
    type: 'object',
    properties: {
      hours: {
        type:        'integer',
        description: 'Lookback window in hours (default 24, max 168).',
        default:     24,
      },
    },
    required: [],
  },
  async execute({ hours = 24 } = {}, _context = {}) {
    const safeHours = Math.min(Math.max(1, parseInt(hours) || 24), 168);

    try {
      const { rows } = await pool.query(`
        SELECT
          agent_id,
          COUNT(*)                                        AS total_runs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS successes,
          SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS failures,
          ROUND(AVG(latency_ms))                          AS avg_latency_ms,
          SUM(total_tokens)                               AS total_tokens,
          MAX(created_at)                                 AS last_run
        FROM ai_agent_runs
        WHERE created_at >= NOW() - INTERVAL '${safeHours} hours'
        GROUP BY agent_id
        ORDER BY total_runs DESC
      `);

      const global = {
        totalRuns:    rows.reduce((s, r) => s + parseInt(r.total_runs),  0),
        successes:    rows.reduce((s, r) => s + parseInt(r.successes),    0),
        failures:     rows.reduce((s, r) => s + parseInt(r.failures),     0),
        totalTokens:  rows.reduce((s, r) => s + parseInt(r.total_tokens || 0), 0),
      };
      global.successRate = global.totalRuns
        ? `${Math.round((global.successes / global.totalRuns) * 100)}%`
        : 'N/A';

      return {
        windowHours: safeHours,
        global,
        byAgent: rows.map(r => ({
          agentId:      r.agent_id,
          totalRuns:    parseInt(r.total_runs),
          successes:    parseInt(r.successes),
          failures:     parseInt(r.failures),
          successRate:  parseInt(r.total_runs)
            ? `${Math.round((parseInt(r.successes) / parseInt(r.total_runs)) * 100)}%`
            : 'N/A',
          avgLatencyMs: parseInt(r.avg_latency_ms) || 0,
          totalTokens:  parseInt(r.total_tokens) || 0,
          lastRun:      r.last_run,
        })),
      };
    } catch (err) {
      return { error: `Could not query agent metrics: ${err.message}` };
    }
  },
});

// ── get_governance_queue ──────────────────────────────────────────────────────
register({
  name:        'get_governance_queue',
  description: 'List pending AI model change proposals awaiting medical director review (PCCP governance queue).',
  category:    'system',
  isSystem:    true,
  parameters: {
    type: 'object',
    properties: {
      status: {
        type:        'string',
        enum:        ['pending', 'approved', 'rejected', 'all'],
        description: 'Filter by change status (default: pending).',
        default:     'pending',
      },
    },
    required: [],
  },
  async execute({ status = 'pending' } = {}, _context = {}) {
    try {
      const where = status === 'all' ? '' : `WHERE status = '${status}'`;
      const { rows } = await pool.query(`
        SELECT id, model_component, change_type, description, status,
               proposed_by, proposed_at, reviewed_by, reviewed_at
        FROM ai_model_change_log
        ${where}
        ORDER BY proposed_at DESC
        LIMIT 50
      `);

      return {
        status,
        count: rows.length,
        changes: rows,
        note: rows.length > 0
          ? `Use /api/ai-governance/changes/:id/approve to approve a change`
          : 'No changes matching the filter',
      };
    } catch (err) {
      return { error: `Could not query governance queue: ${err.message}` };
    }
  },
});
