/**
 * Migration: Unified Feedback Signals
 * =====================================
 * Creates two tables that bridge all three existing feedback silos
 * (patient_feedback, ai_cdss_feedback, tickets) into a single
 * normalised view the AI self-learning pipeline can consume.
 *
 *   unified_feedback_signals     — one row per ingested feedback event
 *   ai_component_quality_scores  — cached per-component score (refreshed hourly)
 *
 * Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING throughout).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────────────────
    // 1. unified_feedback_signals
    //    One normalised row for every piece of feedback ingested from any source.
    // ─────────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS unified_feedback_signals (
        id                    SERIAL PRIMARY KEY,

        -- Origin
        source                VARCHAR(30) NOT NULL
                                CHECK (source IN ('patient_feedback', 'cdss_feedback', 'ticket')),
        source_id             TEXT NOT NULL,   -- PK value from the originating table
        user_id               INTEGER,         -- nullable — not all sources have a linked user

        -- AI attribution
        ai_component          VARCHAR(100),    -- NULL means feedback is not AI-related
        feedback_type         VARCHAR(60),     -- wrong_answer | low_rating | rejection |
                                               -- complaint | modification | accepted | other

        -- Signal value
        quality_delta         FLOAT NOT NULL   -- -1.0 (very bad) … +1.0 (very good)
                                CHECK (quality_delta BETWEEN -1 AND 1),
        weight                FLOAT NOT NULL DEFAULT 1.0,  -- source-level weighting

        -- Human-readable, PHI-free summary
        raw_summary           TEXT,

        -- Closed-loop tracking (Phase 2)
        resolved_at           TIMESTAMPTZ,
        notified_at           TIMESTAMPTZ,
        post_resolution_rating SMALLINT,
        resolution_delta      FLOAT,
        change_proposal_id    INTEGER,         -- FK to ai_model_change_log.id (Phase 2)

        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ufs_source
        ON unified_feedback_signals (source, source_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ufs_component
        ON unified_feedback_signals (ai_component)
        WHERE ai_component IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ufs_created
        ON unified_feedback_signals (created_at DESC)
    `);
    // Deduplication: one row per (source, source_id)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ufs_dedup
        ON unified_feedback_signals (source, source_id)
    `);
    console.log('✅ unified_feedback_signals: created');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. ai_component_quality_scores
    //    Aggregated score per AI component, refreshed on each aggregator run.
    //    score_7d / score_30d are on a 0–10 scale (5 = neutral).
    // ─────────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_component_quality_scores (
        ai_component          VARCHAR(100) PRIMARY KEY,
        score_7d              FLOAT,       -- exponentially weighted, 0–10
        score_30d             FLOAT,
        signal_count_7d       INTEGER DEFAULT 0,
        signal_count_30d      INTEGER DEFAULT 0,
        trend                 VARCHAR(20) DEFAULT 'stable'
                                CHECK (trend IN ('improving', 'stable', 'degrading')),
        last_proposal_at      TIMESTAMPTZ,
        computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ ai_component_quality_scores: created');

    await client.query('COMMIT');
    console.log('✅ unified-feedback-signals migration: complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ unified-feedback-signals migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS ai_component_quality_scores');
    await client.query('DROP TABLE IF EXISTS unified_feedback_signals');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
