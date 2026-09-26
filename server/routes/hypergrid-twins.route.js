/**
 * HyperGrid Digital Twins API
 *
 * POST   /api/hypergrid/twins                          Create / upsert twin
 * GET    /api/hypergrid/twins                          List twins (tenant)
 * GET    /api/hypergrid/twins/:type/:externalId        Get twin
 * PATCH  /api/hypergrid/twins/:type/:externalId        Update twin attributes
 * DELETE /api/hypergrid/twins/:type/:externalId        Delete twin
 * POST   /api/hypergrid/twins/:type/:externalId/observations  Push observation
 * GET    /api/hypergrid/twins/:type/:externalId/timeline      Observation timeline
 * GET    /api/hypergrid/twins/:type/:externalId/risk           Risk score
 * GET    /api/hypergrid/twins/summary                  Network-wide twin summary
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';
import {
  upsertTwin,
  getTwin,
  listTwins,
  pushObservation,
  computeRisk,
  getTwinTimeline,
} from '../services/hypergrid-twins.service.js';
import { requireHgTenant } from '../utils/hypergrid-tenant.js';

const router = express.Router();

const TWIN_TYPES = ['device', 'patient', 'asset', 'hospital', 'claim', 'ambulance'];

// ── Create / upsert twin ──────────────────────────────────────────────────────
router.post('/', authUser, requireHgTenant, async (req, res) => {
  try {
    const { twinType, externalId, attributes, location } = req.body;
    if (!twinType || !externalId)
      return res.status(400).json({ success: false, message: 'twinType and externalId required' });
    if (!TWIN_TYPES.includes(twinType))
      return res.status(400).json({ success: false, message: `twinType must be one of: ${TWIN_TYPES.join(', ')}` });

    const twin = await upsertTwin({
      twinType,
      externalId,
      tenantId:   req.hgTenantId,
      attributes: attributes || {},
      location:   location   || null,
    });
    res.status(201).json({ success: true, twin });
  } catch (err) {
    console.error('[Twins API] Create error:', err);
    res.status(500).json({ success: false, message: 'Failed to upsert twin' });
  }
});

// ── List twins ────────────────────────────────────────────────────────────────
router.get('/', authUser, requireHgTenant, async (req, res) => {
  try {
    const { type, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const twins  = await listTwins({
      twinType:  type     || null,
      tenantId:  req.hgTenantId,
      limit:     parseInt(limit),
      offset,
    });
    res.json({ success: true, twins, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list twins' });
  }
});

// ── Network summary (admin) ───────────────────────────────────────────────────
router.get('/summary', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT twin_type, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE (attributes->>'riskLevel') = 'high')     AS high_risk,
              COUNT(*) FILTER (WHERE (attributes->>'riskLevel') = 'critical') AS critical
       FROM hg_digital_twins
       GROUP BY twin_type`
    );
    res.json({ success: true, summary: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get summary' });
  }
});

// ── Get twin ──────────────────────────────────────────────────────────────────
router.get('/:type/:externalId', authUser, requireHgTenant, async (req, res) => {
  try {
    const twin = await getTwin(
      req.params.type,
      req.params.externalId,
      req.hgTenantId
    );
    if (!twin) return res.status(404).json({ success: false, message: 'Twin not found' });
    res.json({ success: true, twin });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get twin' });
  }
});

// ── Update twin attributes ────────────────────────────────────────────────────
router.patch('/:type/:externalId', authUser, requireHgTenant, async (req, res) => {
  try {
    const { attributes, location } = req.body;
    const twin = await upsertTwin({
      twinType:   req.params.type,
      externalId: req.params.externalId,
      tenantId:   req.hgTenantId,
      attributes: attributes || {},
      location:   location   || null,
    });
    res.json({ success: true, twin });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update twin' });
  }
});

// ── Delete twin ───────────────────────────────────────────────────────────────
router.delete('/:type/:externalId', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `DELETE FROM hg_digital_twins
       WHERE twin_type = $1 AND external_id = $2 AND tenant_id = $3`,
      [req.params.type, req.params.externalId, req.hgTenantId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete twin' });
  }
});

// ── Push observation ──────────────────────────────────────────────────────────
router.post('/:type/:externalId/observations', authUser, requireHgTenant, async (req, res) => {
  try {
    const { observationType, value, unit, metadata } = req.body;
    if (!observationType || value === undefined)
      return res.status(400).json({ success: false, message: 'observationType and value required' });

    await pushObservation({
      twinType:        req.params.type,
      externalId:      req.params.externalId,
      tenantId:        req.hgTenantId,
      observationType,
      value,
      unit:            unit     || null,
      metadata:        metadata || {},
    });
    res.status(201).json({ success: true, message: 'Observation recorded' });
  } catch (err) {
    console.error('[Twins API] Observation error:', err);
    res.status(500).json({ success: false, message: 'Failed to push observation' });
  }
});

// ── Timeline ──────────────────────────────────────────────────────────────────
router.get('/:type/:externalId/timeline', authUser, requireHgTenant, async (req, res) => {
  try {
    const { from, to, limit = 100 } = req.query;
    const rows = await getTwinTimeline({
      twinType:   req.params.type,
      externalId: req.params.externalId,
      tenantId:   req.hgTenantId,
      from:       from  || null,
      to:         to    || null,
      limit:      parseInt(limit),
    });
    res.json({ success: true, observations: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch timeline' });
  }
});

// ── Risk score ────────────────────────────────────────────────────────────────
router.get('/:type/:externalId/risk', authUser, requireHgTenant, async (req, res) => {
  try {
    const risk = await computeRisk(
      req.params.type,
      req.params.externalId,
      req.hgTenantId
    );
    res.json({ success: true, risk });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to compute risk' });
  }
});

export default router;
