/**
 * Client Telemetry Ingestion
 * ==========================
 * Receives batched client-side events (page load times, API errors,
 * conversion funnel steps) and persists them for analytics.
 *
 * Designed to be non-blocking: all failures are silent.
 * Route: POST /api/telemetry/client
 */

import express from 'express';
import pool from '../db/pgPool.js';

const router = express.Router();

// ── Lightweight validation ────────────────────────────────────────────────────
const VALID_TYPES = new Set(['page_load', 'api_error', 'api_timeout', 'funnel', 'ui_action']);
const MAX_EVENTS_PER_BATCH = 100;

router.post('/client', async (req, res) => {
  // Always respond 200 — client must never wait for telemetry
  res.status(200).json({ ok: true });

  try {
    const { events } = req.body ?? {};
    if (!Array.isArray(events) || events.length === 0) return;

    const valid = events
      .slice(0, MAX_EVENTS_PER_BATCH)
      .filter(e =>
        e && typeof e.type === 'string' && VALID_TYPES.has(e.type) &&
        typeof e.name === 'string' && e.name.length <= 200 &&
        typeof e.sessionId === 'string' &&
        typeof e.ts === 'number'
      );

    if (valid.length === 0) return;

    // Bulk insert — one query for the whole batch
    const values = valid.map((e, i) => {
      const base = i * 7;
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7})`;
    }).join(', ');

    const params = valid.flatMap(e => [
      e.type,
      e.name.slice(0, 200),
      e.durationMs ?? null,
      JSON.stringify(e.meta ?? {}),
      e.sessionId.slice(0, 64),
      e.path?.slice(0, 500) ?? null,
      new Date(e.ts).toISOString()
    ]);

    await pool.query(`
      INSERT INTO client_telemetry (event_type, event_name, duration_ms, meta, session_id, page_path, client_ts)
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `, params);

  } catch (err) {
    // Silent — telemetry failure must never surface to the user
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Telemetry] Ingestion error:', err.message);
    }
  }
});

/**
 * GET /api/telemetry/summary  — admin-only performance summary
 */
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        event_type,
        event_name,
        COUNT(*)::int                               AS count,
        ROUND(AVG(duration_ms)::numeric, 0)::int    AS avg_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 0)::int AS p95_ms,
        MAX(duration_ms)::int                       AS max_ms,
        MAX(client_ts)                              AS last_seen
      FROM client_telemetry
      WHERE client_ts > NOW() - INTERVAL '24 hours'
      GROUP BY event_type, event_name
      ORDER BY count DESC
      LIMIT 100
    `);
    res.json({ success: true, period: '24h', events: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
