/**
 * Migration: ai_prompt_versions + ai_shadow_run_results
 * ======================================================
 * Adds the staged-rollout layer for the Prompt Optimization Executor.
 *
 *  ai_prompt_versions  — candidate prompts under shadow-test / canary rollout
 *  ai_shadow_run_results — per-input quality comparison baseline vs candidate
 */

import pool from '../db/pgPool.js';

export async function runAiPromptVersionsMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Candidate version table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_prompt_versions (
        id                  SERIAL        PRIMARY KEY,
        prompt_name         TEXT          NOT NULL,
        candidate_template  TEXT          NOT NULL,
        change_log_id       INTEGER,
        status              TEXT          NOT NULL DEFAULT 'shadow'
                              CHECK (status IN ('shadow','canary','active','rolled_back')),
        canary_pct          INTEGER       NOT NULL DEFAULT 0
                              CHECK (canary_pct BETWEEN 0 AND 100),
        shadow_pass_rate    FLOAT,
        quality_baseline    FLOAT,
        quality_canary      FLOAT,
        promoted_at         TIMESTAMPTZ,
        rolled_back_at      TIMESTAMPTZ,
        rollback_reason     TEXT,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_apv_prompt_status
        ON ai_prompt_versions (prompt_name, status, created_at DESC)
    `);

    // Shadow test results table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_shadow_run_results (
        id                  SERIAL        PRIMARY KEY,
        version_id          INTEGER       NOT NULL
                              REFERENCES ai_prompt_versions(id) ON DELETE CASCADE,
        test_input          TEXT          NOT NULL,
        baseline_output     TEXT,
        candidate_output    TEXT,
        quality_score       FLOAT
                              CHECK (quality_score BETWEEN 0 AND 1),
        evaluator_notes     TEXT,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shadow_version
        ON ai_shadow_run_results (version_id)
    `);

    await client.query('COMMIT');
    console.log('✅ ai_prompt_versions migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ai_prompt_versions migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
