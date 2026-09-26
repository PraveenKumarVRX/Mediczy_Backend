/**
 * HyperGrid Canonical Event Bus — REST API
 *
 * POST   /api/hypergrid/events                   Publish a canonical event
 * GET    /api/hypergrid/events                   Query persisted events
 * GET    /api/hypergrid/events/types             List known event types
 * GET    /api/hypergrid/events/bus/status        Event bus health
 * POST   /api/hypergrid/events/replay            Replay events from a time range
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';
import { publishEvent, getEventBusStatus } from '../services/hypergrid-event-bus.service.js';
import { requireHgTenant } from '../utils/hypergrid-tenant.js';

const router = express.Router();

// ── Publish event ─────────────────────────────────────────────────────────────
router.post('/', authUser, requireHgTenant, async (req, res) => {
  try {
    const { type, source, patientId, payload } = req.body;
    if (!type) return res.status(400).json({ success: false, message: 'type is required' });

    const event = await publishEvent({
      type,
      source:    source || 'api',
      tenantId:  req.hgTenantId,
      patientId: patientId || null,
      payload:   payload  || {},
    });

    // Persist to event store
    const pool = await connectPostgres();
    await pool.query(
      `INSERT INTO hg_event_store
         (event_id, event_type, source, tenant_id, patient_id, payload, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [event.id, event.type, event.source, event.tenantId,
       event.patientId || null, JSON.stringify(event.payload)]
    );

    res.status(201).json({ success: true, event });
  } catch (err) {
    console.error('[Events API] Publish error:', err);
    res.status(500).json({ success: false, message: 'Failed to publish event' });
  }
});

// ── Query events ──────────────────────────────────────────────────────────────
router.get('/', authUser, requireHgTenant, async (req, res) => {
  try {
    const { type, patientId, from, to, limit = 100, page = 1 } = req.query;
    const tenantId = req.hgTenantId;
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const pool     = await connectPostgres();
    const r = await pool.query(
      `SELECT * FROM hg_event_store
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR event_type = $2)
         AND ($3::bigint IS NULL OR patient_id = $3::bigint)
         AND ($4::timestamptz IS NULL OR created_at >= $4)
         AND ($5::timestamptz IS NULL OR created_at <= $5)
       ORDER BY created_at DESC
       LIMIT $6 OFFSET $7`,
      [tenantId, type || null, patientId || null,
       from || null, to || null, parseInt(limit), offset]
    );
    res.json({ success: true, events: r.rows, page: parseInt(page) });
  } catch (err) {
    console.error('[Events API] Query error:', err);
    res.status(500).json({ success: false, message: 'Failed to query events' });
  }
});

// ── Event type catalogue ──────────────────────────────────────────────────────
router.get('/types', authUser, requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT event_type, COUNT(*) AS count
       FROM hg_event_store
       WHERE tenant_id = $1
       GROUP BY event_type ORDER BY count DESC`,
      [req.hgTenantId]
    );
    res.json({ success: true, types: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list event types' });
  }
});

// ── Bus health ────────────────────────────────────────────────────────────────
router.get('/bus/status', authUser, requireRole(['admin']), (req, res) => {
  res.json({ success: true, status: getEventBusStatus() });
});

// ── Replay events ─────────────────────────────────────────────────────────────
router.post('/replay', authUser, requireRole(['admin']), requireHgTenant, async (req, res) => {
  try {
    const { from, to, type, limit = 500 } = req.body;
    if (!from) return res.status(400).json({ success: false, message: 'from is required' });
    const pool     = await connectPostgres();
    const tenantId = req.hgTenantId;
    const r = await pool.query(
      `SELECT * FROM hg_event_store
       WHERE tenant_id = $1
         AND created_at >= $2
         AND ($3::timestamptz IS NULL OR created_at <= $3)
         AND ($4::text IS NULL OR event_type = $4)
       ORDER BY created_at ASC
       LIMIT $5`,
      [tenantId, from, to || null, type || null, parseInt(limit)]
    );

    let replayed = 0;
    for (const row of r.rows) {
      await publishEvent({ ...JSON.parse(JSON.stringify(row.payload || {})),
        id: undefined, type: row.event_type, source: 'replay',
        tenantId, _replayOf: row.event_id });
      replayed++;
    }
    res.json({ success: true, replayed });
  } catch (err) {
    console.error('[Events API] Replay error:', err);
    res.status(500).json({ success: false, message: 'Failed to replay events' });
  }
});

export default router;
