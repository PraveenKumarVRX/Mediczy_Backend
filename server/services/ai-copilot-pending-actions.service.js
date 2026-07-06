import { randomUUID } from 'crypto';
import pool from '../db/pgPool.js';
import { execute as executeTool, getToolMeta } from './ai-brain/tools/index.js';

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_copilot_pending_actions (
      id SERIAL PRIMARY KEY,
      action_id UUID NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      tenant_id VARCHAR(64),
      agent_id VARCHAR(32) NOT NULL,
      tool_name VARCHAR(64) NOT NULL,
      tool_params JSONB NOT NULL DEFAULT '{}'::jsonb,
      summary TEXT NOT NULL,
      status VARCHAR(16) DEFAULT 'pending',
      result JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by INTEGER
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_copilot_pending_user
      ON ai_copilot_pending_actions(user_id, status, created_at DESC)
  `);
  tableReady = true;
}

export async function createPendingAction({
  userId,
  tenantId,
  agentId,
  toolName,
  toolParams,
  summary,
}) {
  await ensureTable();
  const actionId = randomUUID();
  await pool.query(
    `INSERT INTO ai_copilot_pending_actions
       (action_id, user_id, tenant_id, agent_id, tool_name, tool_params, summary, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending')`,
    [actionId, userId, tenantId || null, agentId, toolName, JSON.stringify(toolParams || {}), summary]
  );
  return { actionId, summary, toolName };
}

export async function getPendingAction(actionId, userId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM ai_copilot_pending_actions WHERE action_id = $1 AND user_id = $2 LIMIT 1`,
    [actionId, userId]
  );
  return rows[0] || null;
}

export async function approvePendingAction(actionId, userId, { reject = false } = {}) {
  await ensureTable();
  const row = await getPendingAction(actionId, userId);
  if (!row) {
    const err = new Error('Pending action not found');
    err.status = 404;
    throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error(`Action already ${row.status}`);
    err.status = 409;
    throw err;
  }

  if (reject) {
    await pool.query(
      `UPDATE ai_copilot_pending_actions
          SET status = 'rejected', resolved_at = NOW(), resolved_by = $2
        WHERE action_id = $1`,
      [actionId, userId]
    );
    return { success: true, status: 'rejected', actionId };
  }

  const meta = getToolMeta(row.tool_name);
  if (!meta?.isWrite) {
    const err = new Error('Only write actions require approval');
    err.status = 400;
    throw err;
  }

  const result = await executeTool(row.tool_name, row.tool_params || {}, {
    userId,
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    skipApprovalCheck: true,
    skipWriteExecution: false,
    approvedActionIds: [actionId],
    currentActionId: actionId,
    copilotContext: true,
  });

  await pool.query(
    `UPDATE ai_copilot_pending_actions
        SET status = 'approved', resolved_at = NOW(), resolved_by = $2, result = $3::jsonb
      WHERE action_id = $1`,
    [actionId, userId, JSON.stringify(result)]
  );

  return { success: true, status: 'approved', actionId, result };
}

export default {
  createPendingAction,
  getPendingAction,
  approvePendingAction,
};
