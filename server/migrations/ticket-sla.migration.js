/**
 * Migration: ticket_sla
 * Creates the SLA tracking table for the Feedback Intelligence system.
 *
 * SLA tiers:
 *   S0 Safety-Critical  → response 15 min  / resolution 2 h
 *   S1 Clinical Quality → response 1 h     / resolution 8 h
 *   S2 Functional Bug   → response 4 h     / resolution 24 h
 *   S3 UX Friction      → response 24 h    / resolution 72 h
 */

import pool from '../db/pgPool.js';

export async function runTicketSlaMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_sla (
        ticket_id           TEXT        PRIMARY KEY,
        severity            TEXT        NOT NULL CHECK (severity IN ('S0','S1','S2','S3')),
        confidence          FLOAT,
        ai_component        TEXT,
        feedback_type       TEXT,
        evidence_quote      TEXT,
        recommended_action  TEXT,
        response_due_at     TIMESTAMPTZ NOT NULL,
        resolution_due_at   TIMESTAMPTZ NOT NULL,
        response_met_at     TIMESTAMPTZ,
        resolution_met_at   TIMESTAMPTZ,
        breached            BOOLEAN     NOT NULL DEFAULT FALSE,
        breach_type         TEXT,        -- 'response' | 'resolution' | null
        notified_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tsla_severity
        ON ticket_sla (severity)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tsla_open_breaches
        ON ticket_sla (breached, response_due_at, resolution_due_at)
        WHERE breached = FALSE
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tsla_created
        ON ticket_sla (created_at DESC)
    `);

    await client.query('COMMIT');
    console.log('✅ ticket_sla migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ticket_sla migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
