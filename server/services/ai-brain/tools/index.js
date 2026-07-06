/**
 * AI Brain Tool Registry
 * ======================
 * Central registry for all brain tools.
 * Each tool has a name, description, parameters (JSON Schema), category, and execute function.
 * Tools are registered at import time and available to the orchestrator.
 */

import pool from '../../../db/pgPool.js';

// ─── Registry ───────────────────────────────────────────────

const _tools = new Map();

/**
 * Register a tool.
 * @param {Object} tool
 * @param {string} tool.name
 * @param {string} tool.description
 * @param {string} tool.category
 * @param {Object} tool.parameters  - JSON Schema for parameters
 * @param {Function} tool.execute   - async (params, context) => result
 * @param {boolean} [tool.isWrite]  - true for dangerous/write tools
 */
function register(tool) {
  if (_tools.has(tool.name)) {
    console.warn(`[ToolRegistry] Overwriting tool: ${tool.name}`);
  }
  _tools.set(tool.name, tool);
}

function getToolMeta(name) {
  const tool = _tools.get(name);
  if (!tool) return null;
  return {
    name: tool.name,
    category: tool.category,
    isWrite: !!tool.isWrite,
    isSystem: !!tool.isSystem,
  };
}

/**
 * Get all registered tools as OpenAI function-calling format.
 */
function getToolDefinitions() {
  return Array.from(_tools.values()).map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
    _meta: {
      isWrite: !!t.isWrite,
      isSystem: !!t.isSystem,
      category: t.category,
    },
  }));
}

/**
 * Get tool metadata list (for API response).
 */
function listTools() {
  return Array.from(_tools.values()).map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    isWrite: !!t.isWrite,
    isSystem: !!t.isSystem,
    parameterCount: Object.keys(t.parameters?.properties || {}).length,
  }));
}

/**
 * Execute a tool by name.
 * @param {string} name - Tool name
 * @param {Object} params - Tool parameters
 * @param {Object} context - { userId, userType, conversationId }
 * @returns {Object} Tool result
 */
async function execute(name, params, context = {}) {
  const tool = _tools.get(name);
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }

  if (tool.isWrite && context.copilotContext) {
    const writeEnabled = process.env.ADMIN_COPILOT_WRITE_ACTIONS === 'true';
    const approved = context.approvedActionIds?.includes(context.currentActionId);
    if (!writeEnabled && !approved && !context.skipApprovalCheck) {
      const { createPendingAction } = await import('../../ai-copilot-pending-actions.service.js');
      const pending = await createPendingAction({
        userId: context.userId,
        tenantId: context.tenantId,
        agentId: context.agentId || 'admin',
        toolName: name,
        toolParams: params,
        summary: `Execute ${name}${params?.reason ? `: ${params.reason}` : ''}`,
      });
      return {
        pendingApproval: true,
        actionId: pending.actionId,
        summary: pending.summary,
        message: 'This action requires human approval in Admin Copilot before it can run.',
      };
    }
  }

  const start = Date.now();
  let result, status = 'success', errorMessage = null;

  try {
    result = await tool.execute(params, context);
  } catch (err) {
    status = 'error';
    errorMessage = err.message;
    result = { error: err.message };
  }

  const latencyMs = Date.now() - start;

  // Log execution
  try {
    const db = pool;
    await db.query(
      `INSERT INTO ai_tool_executions
        (conversation_id, user_id, tool_name, tool_category, input_params, output_data, status, error_message, latency_ms, is_write)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        context.conversationId || null,
        context.userId || 0,
        name,
        tool.category,
        JSON.stringify(params),
        JSON.stringify(result),
        status,
        errorMessage,
        latencyMs,
        tool.isWrite || false
      ]
    );
  } catch (logErr) {
    console.error(`[ToolRegistry] Failed to log execution of ${name}:`, logErr.message);
  }

  return result;
}

export { register, getToolDefinitions, listTools, execute, getToolMeta };
