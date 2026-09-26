/**
 * HyperGrid Edge Gateway Management API
 *
 * Manages the fleet of on-premise edge gateways deployed at hospitals/clinics.
 * Each gateway runs the HyperGrid Edge Agent (Node.js), polls this API for
 * config, forwards device data to the MQTT broker and events bus,
 * and survives transient connectivity gaps via local store-and-forward.
 *
 * POST   /api/hypergrid/edge/gateways                Register gateway
 * GET    /api/hypergrid/edge/gateways                List all gateways
 * GET    /api/hypergrid/edge/gateways/:id            Get gateway details
 * PATCH  /api/hypergrid/edge/gateways/:id            Update gateway metadata
 * DELETE /api/hypergrid/edge/gateways/:id            Decommission gateway
 * POST   /api/hypergrid/edge/gateways/:id/heartbeat  Gateway heartbeat (device→cloud)
 * GET    /api/hypergrid/edge/gateways/:id/config     Pull config (gateway polls this)
 * PUT    /api/hypergrid/edge/gateways/:id/config     Push new config to gateway
 * POST   /api/hypergrid/edge/gateways/:id/sync       Bulk offline sync (device→cloud)
 * GET    /api/hypergrid/edge/fleet/status            Fleet-wide health summary
 */

import express from 'express';
import crypto  from 'crypto';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }       from '../db/postgres.js';
import { publishEvent }          from '../services/hypergrid-event-bus.service.js';
import { requireHgTenant } from '../utils/hypergrid-tenant.js';

const router          = express.Router();
const HEARTBEAT_GRACE = parseInt(process.env.EDGE_HEARTBEAT_GRACE || '300', 10); // 5 min

// ── Register gateway ──────────────────────────────────────────────────────────
router.post('/gateways', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const { name, location, facilityId, model, firmwareVersion, capabilities } = req.body;
    if (!name || !facilityId)
      return res.status(400).json({ success: false, message: 'name and facilityId required' });

    const gatewayKey    = crypto.randomBytes(20).toString('hex');
    const gatewaySecret = crypto.randomBytes(32).toString('hex');
    const pool          = await connectPostgres();

    const r = await pool.query(
      `INSERT INTO hg_edge_gateways
         (name, location, facility_id, model, firmware_version,
          capabilities, gateway_key, secret_hash, tenant_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'offline',NOW())
       RETURNING id, name, location, facility_id, model, firmware_version, status, created_at`,
      [name, location || null, facilityId, model || null, firmwareVersion || null,
       JSON.stringify(capabilities || {}), gatewayKey,
       crypto.createHash('sha256').update(gatewaySecret).digest('hex'),
       req.hgTenantId]
    );

    res.status(201).json({
      success:        true,
      gateway:        r.rows[0],
      credentials: {
        gatewayKey,
        gatewaySecret,
        mqttBrokerUrl:   process.env.MQTT_BROKER_URL || `mqtt://${process.env.HOST || 'localhost'}:1883`,
        syncEndpoint:    `/api/hypergrid/edge/gateways/${r.rows[0].id}/sync`,
        configEndpoint:  `/api/hypergrid/edge/gateways/${r.rows[0].id}/config`,
        heartbeatEvery:  60,
      },
      note: 'Store gatewaySecret securely — it will not be shown again.',
    });
  } catch (err) {
    console.error('[Edge] Register error:', err);
    res.status(500).json({ success: false, message: 'Failed to register gateway' });
  }
});

// ── List gateways ─────────────────────────────────────────────────────────────
router.get('/gateways', authUser, requireHgTenant, async (req, res) => {
  try {
    const { status, facilityId } = req.query;
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT id, name, location, facility_id, model, firmware_version,
              status, last_seen, created_at
       FROM hg_edge_gateways
       WHERE tenant_id = $1
         AND ($2::text  IS NULL OR status      = $2)
         AND ($3::text  IS NULL OR facility_id = $3)
       ORDER BY created_at DESC`,
      [req.hgTenantId, status || null, facilityId || null]
    );
    res.json({ success: true, gateways: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to list gateways' });
  }
});

// ── Get gateway detail ────────────────────────────────────────────────────────
router.get('/gateways/:id', authUser, requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT id, name, location, facility_id, model, firmware_version,
              capabilities, status, last_seen, config, created_at
       FROM hg_edge_gateways WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Gateway not found' });
    res.json({ success: true, gateway: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get gateway' });
  }
});

// ── Update gateway metadata ───────────────────────────────────────────────────
router.patch('/gateways/:id', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const { name, location, model, firmwareVersion } = req.body;
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_edge_gateways
       SET name             = COALESCE($3, name),
           location         = COALESCE($4, location),
           model            = COALESCE($5, model),
           firmware_version = COALESCE($6, firmware_version),
           updated_at       = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId, name || null, location || null,
       model || null, firmwareVersion || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update gateway' });
  }
});

// ── Decommission gateway ──────────────────────────────────────────────────────
router.delete('/gateways/:id', authUser, requireRole(['admin']), requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_edge_gateways SET status = 'decommissioned', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to decommission gateway' });
  }
});

// ── Heartbeat (gateway → cloud) ───────────────────────────────────────────────
// No user auth — authenticated by gateway_key header
router.post('/gateways/:id/heartbeat', async (req, res) => {
  try {
    const { metrics, deviceCount, pendingSyncCount } = req.body;
    const gatewayKey = req.headers['x-gateway-key'];
    if (!gatewayKey)
      return res.status(401).json({ success: false, message: 'x-gateway-key header required' });

    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT id, status FROM hg_edge_gateways WHERE id = $1 AND gateway_key = $2`,
      [req.params.id, gatewayKey]
    );
    if (!r.rows[0]) return res.status(403).json({ success: false, message: 'Unauthorized' });

    await pool.query(
      `UPDATE hg_edge_gateways
       SET status           = 'online',
           last_seen        = NOW(),
           metrics          = $2,
           device_count     = COALESCE($3, device_count),
           pending_sync     = COALESCE($4, 0),
           updated_at       = NOW()
       WHERE id = $1`,
      [req.params.id, JSON.stringify(metrics || {}), deviceCount || null, pendingSyncCount || 0]
    );

    await publishEvent({
      eventType:  'EdgeGatewayHeartbeat',
      resourceId: req.params.id,
      source:     'edge-gateway',
      payload:    { gatewayId: req.params.id, deviceCount, metrics },
    });

    res.json({ success: true, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error('[Edge] Heartbeat error:', err);
    res.status(500).json({ success: false, message: 'Heartbeat failed' });
  }
});

// ── Pull config (gateway polls) ───────────────────────────────────────────────
router.get('/gateways/:id/config', async (req, res) => {
  try {
    const gatewayKey = req.headers['x-gateway-key'];
    if (!gatewayKey)
      return res.status(401).json({ success: false, message: 'x-gateway-key header required' });

    const pool = await connectPostgres();
    const r    = await pool.query(
      `SELECT config, firmware_version FROM hg_edge_gateways WHERE id = $1 AND gateway_key = $2`,
      [req.params.id, gatewayKey]
    );
    if (!r.rows[0]) return res.status(403).json({ success: false, message: 'Unauthorized' });

    const config = r.rows[0].config || {};
    res.json({
      success: true,
      config:  {
        mqttBrokerUrl:      process.env.MQTT_BROKER_URL || `mqtt://localhost:1883`,
        heartbeatIntervalS: 60,
        syncIntervalS:      30,
        logLevel:           'info',
        ...config,
      },
      firmwareVersion: r.rows[0].firmware_version,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get config' });
  }
});

// ── Push config ───────────────────────────────────────────────────────────────
router.put('/gateways/:id/config', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object')
      return res.status(400).json({ success: false, message: 'config object required' });

    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_edge_gateways SET config = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
      [req.params.id, JSON.stringify(config), req.hgTenantId]
    );
    res.json({ success: true, message: 'Config will be delivered on next gateway poll.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to push config' });
  }
});

// ── Offline sync (gateway → cloud bulk upload) ────────────────────────────────
router.post('/gateways/:id/sync', async (req, res) => {
  try {
    const gatewayKey = req.headers['x-gateway-key'];
    if (!gatewayKey)
      return res.status(401).json({ success: false, message: 'x-gateway-key header required' });

    const pool = await connectPostgres();
    const gwR  = await pool.query(
      `SELECT id, tenant_id FROM hg_edge_gateways WHERE id = $1 AND gateway_key = $2`,
      [req.params.id, gatewayKey]
    );
    if (!gwR.rows[0]) return res.status(403).json({ success: false, message: 'Unauthorized' });

    const { readings = [], events = [] } = req.body;
    let readingsStored = 0;
    let eventsStored   = 0;

    for (const r of readings) {
      if (!r.deviceId || !r.readingType) continue;
      await pool.query(
        `INSERT INTO hg_device_readings
           (device_id, gateway_id, reading_type, value, unit, quality, raw_payload, recorded_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, NOW()),NOW())
         ON CONFLICT DO NOTHING`,
        [r.deviceId, req.params.id, r.readingType, r.value ?? null, r.unit ?? null,
         r.quality ?? null, JSON.stringify(r.raw || {}), r.timestamp || null]
      );
      readingsStored++;
    }

    for (const e of events) {
      try { await publishEvent({ ...e, source: `edge:${req.params.id}` }); eventsStored++; }
      catch { /* continue best-effort */ }
    }

    res.json({ success: true, readingsStored, eventsStored });
  } catch (err) {
    console.error('[Edge] Sync error:', err);
    res.status(500).json({ success: false, message: 'Sync failed' });
  }
});

// ── Fleet health summary ──────────────────────────────────────────────────────
router.get('/fleet/status', authUser, requireRole(['admin']), async (req, res) => {
  try {
    const pool      = await connectPostgres();
    const cutoff    = new Date(Date.now() - HEARTBEAT_GRACE * 1000);
    const r         = await pool.query(
      `SELECT
         COUNT(*)                                                      AS total,
         COUNT(*) FILTER (WHERE status = 'online'
                            AND last_seen > $1)                       AS online,
         COUNT(*) FILTER (WHERE status = 'offline'
                            OR last_seen <= $1)                       AS offline,
         COUNT(*) FILTER (WHERE status = 'decommissioned')            AS decommissioned,
         COALESCE(SUM(device_count), 0)                               AS total_devices,
         COALESCE(SUM(pending_sync), 0)                               AS total_pending_sync
       FROM hg_edge_gateways`,
      [cutoff]
    );
    const gateways = await pool.query(
      `SELECT id, name, facility_id, status, last_seen, device_count, pending_sync, metrics
       FROM hg_edge_gateways ORDER BY last_seen DESC NULLS LAST LIMIT 50`
    );
    res.json({ success: true, summary: r.rows[0], gateways: gateways.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get fleet status' });
  }
});

export default router;
