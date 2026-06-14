/**
 * Migration: Admin Copilot pending actions table
 * Safe to run multiple times.
 */

import pool from '../db/pgPool.js';

export async function up() {
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
  console.log('✅ ai_copilot_pending_actions table ready');
}

export default { up };
