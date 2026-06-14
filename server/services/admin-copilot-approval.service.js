/**
 * Admin Copilot — human-in-the-loop approval for high-risk tool writes.
 */

import { randomUUID } from 'crypto';
import pool from '../db/pgPool.js';
import { ADMIN_COPILOT } from '../config/admin-copilot.config.js';

let _tableReady = false;

async function ensureTable() {
  if (_tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_copilot_pending_actions (
      id SERIAL PRIMARY KEY,
      action_id UUID NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      tenant_id TEXT,
      agent_id VARCHAR(32) NOT NULL,
      tool_name VARCHAR(64) NOT NULL,
      tool_params JSONB NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL,
      status VARCHAR(16) DEFAULT 'pending',
      result JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by INTEGER
    )
  `);
  _tableReady = true;
}

export function isWriteToolPendingApproval(toolName) {
  return ['reload_prompts'].includes(toolName) && !ADMIN_COPILOT.writeActions;
}

export async function createPendingAction({ userId, tenantId, agentId, toolName, toolParams, summary }) {
  await ensureTable();
  const actionId = randomUUID();
  await pool.query(
    `INSERT INTO ai_copilot_pending_actions
       (action_id, user_id, tenant_id, agent_id, tool_name, tool_params, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actionId, userId, tenantId || null, agentId, toolName, JSON.stringify(toolParams || {}), summary]
  );
  return { actionId, summary };
}

export async function resolvePendingAction({ actionId, userId, approve }) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM ai_copilot_pending_actions WHERE action_id = $1 AND status = 'pending'`,
    [actionId]
  );
  if (!rows[0]) {
    const err = new Error('Pending action not found or already resolved');
    err.status = 404;
    throw err;
  }

  const row = rows[0];
  if (row.user_id !== userId) {
    const err = new Error('Not authorized to resolve this action');
    err.status = 403;
    throw err;
  }

  if (!approve) {
    await pool.query(
      `UPDATE ai_copilot_pending_actions SET status = 'rejected', resolved_at = NOW(), resolved_by = $2 WHERE action_id = $1`,
      [actionId, userId]
    );
    return { actionId, status: 'rejected' };
  }

  const { execute: executeTool } = await import('./ai-brain/tools/loader.js');
  const result = await executeTool(row.tool_name, row.tool_params, {
    userId: row.user_id,
    userType: 'platform_admin',
    agentId: row.agent_id,
    skipApproval: true,
  });

  await pool.query(
    `UPDATE ai_copilot_pending_actions
        SET status = 'approved', resolved_at = NOW(), resolved_by = $2, result = $3
      WHERE action_id = $1`,
    [actionId, userId, JSON.stringify(result)]
  );

  return { actionId, status: 'approved', result };
}

export async function listPendingActions(userId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT action_id, tool_name, summary, created_at
       FROM ai_copilot_pending_actions
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 20`,
    [userId]
  );
  return rows;
}
