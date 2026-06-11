/**
 * Migration: ai_experiments + ai_experiment_assignments
 * =======================================================
 * Stores A/B experiment definitions and per-user arm assignments.
 *
 *   ai_experiments           — one row per active/completed experiment
 *   ai_experiment_assignments — one row per (experiment × user) showing which arm they received
 */

import pool from '../db/pgPool.js';

export async function runAbExperimentsMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_experiments (
        id                  SERIAL        PRIMARY KEY,
        name                TEXT          NOT NULL UNIQUE,
        description         TEXT,
        component           TEXT          NOT NULL,
        control_prompt_id   INTEGER,      -- references ai_prompt_versions(id); NULL = current active
        variant_prompt_id   INTEGER       NOT NULL REFERENCES ai_prompt_versions(id),
        rollout_pct         INTEGER       NOT NULL DEFAULT 10
                              CHECK (rollout_pct BETWEEN 0 AND 100),
        status              TEXT          NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running','paused','concluded','rolled_back')),
        min_samples         INTEGER       NOT NULL DEFAULT 200,
        significance_target FLOAT         NOT NULL DEFAULT 0.05,
        concluded_arm       TEXT,         -- 'variant'|'control' — winner on conclusion
        started_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        concluded_at        TIMESTAMPTZ,
        created_by          TEXT          NOT NULL DEFAULT 'system'
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exp_status
        ON ai_experiments (status, component)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_experiment_assignments (
        id              SERIAL        PRIMARY KEY,
        experiment_id   INTEGER       NOT NULL REFERENCES ai_experiments(id) ON DELETE CASCADE,
        user_id         TEXT          NOT NULL,
        arm             TEXT          NOT NULL CHECK (arm IN ('control','variant')),
        outcome         FLOAT,        -- quality signal recorded post-interaction
        outcome_type    TEXT,         -- 'rating'|'cdss_action'|'sla_breach'
        assigned_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        outcome_at      TIMESTAMPTZ,
        UNIQUE (experiment_id, user_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exp_assign_exp
        ON ai_experiment_assignments (experiment_id, arm)
    `);

    await client.query('COMMIT');
    console.log('✅ ai_experiments migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ai_experiments migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
