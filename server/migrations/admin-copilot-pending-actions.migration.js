/**
 * Admin Copilot — pending write-action approvals (Phase 5)
 * Run: node server/migrations/admin-copilot-pending-actions.migration.js
 */
import pool from '../db/pgPool.js';

async function migrate() {
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
  console.log('✅ ai_copilot_pending_actions ready');
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
