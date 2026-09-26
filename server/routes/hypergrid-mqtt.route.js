/**
 * HyperGrid MQTT Device Fabric — REST Management API
 *
 * POST   /api/hypergrid/mqtt/devices              Register a device
 * GET    /api/hypergrid/mqtt/devices              List devices (tenant)
 * GET    /api/hypergrid/mqtt/devices/:id          Get device detail
 * PUT    /api/hypergrid/mqtt/devices/:id          Update device
 * DELETE /api/hypergrid/mqtt/devices/:id          Deactivate device
 * POST   /api/hypergrid/mqtt/devices/:id/rotate-key  Rotate API key
 * GET    /api/hypergrid/mqtt/broker/stats         Live broker stats
 * GET    /api/hypergrid/mqtt/readings             Recent device readings
 */

import express from 'express';
import crypto  from 'crypto';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { connectPostgres }        from '../db/postgres.js';
import { getMqttStats }           from '../services/hypergrid-mqtt.service.js';
import { requireHgTenant } from '../utils/hypergrid-tenant.js';

const router = express.Router();

// ── Register a new device ────────────────────────────────────────────────────
router.post('/devices', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const { name, deviceType, serialNumber, manufacturer, model, location, gatewayId } = req.body;
    if (!name || !deviceType) return res.status(400).json({ success: false, message: 'name and deviceType required' });

    const deviceKey  = `dev_${crypto.randomBytes(12).toString('hex')}`;
    const apiSecret  = crypto.randomBytes(24).toString('hex');
    const secretHash = crypto.createHash('sha256').update(apiSecret).digest('hex');

    const pool = await connectPostgres();
    const r = await pool.query(
      `INSERT INTO hg_devices
         (name, device_type, serial_number, manufacturer, model, location,
          gateway_id, device_key, api_secret, tenant_id, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW())
       RETURNING id, name, device_type, device_key, active, created_at`,
      [name, deviceType, serialNumber || null, manufacturer || null,
       model || null, location || null, gatewayId || null,
       deviceKey, apiSecret, req.hgTenantId]
    );

    res.status(201).json({
      success: true,
      device:  r.rows[0],
      mqttCredentials: {
        username: deviceKey,
        password: apiSecret,
        note:     'Store these securely — the secret will not be shown again.',
      },
    });
  } catch (err) {
    console.error('[MQTT API] Register device error:', err);
    res.status(500).json({ success: false, message: 'Failed to register device' });
  }
});

// ── List devices ─────────────────────────────────────────────────────────────
router.get('/devices', authUser, requireHgTenant, async (req, res) => {
  try {
    const { type, gatewayId, page = 1, limit = 50 } = req.query;
    const tenantId = req.hgTenantId;
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const pool     = await connectPostgres();
    const r = await pool.query(
      `SELECT id, name, device_type, serial_number, manufacturer, model,
              location, gateway_id, gateway_key AS device_key,
              (status = 'online') AS active, status, created_at, last_seen
       FROM hg_devices
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR device_type = $2)
         AND ($3::bigint IS NULL OR gateway_id  = $3::bigint)
         AND COALESCE(status, 'offline') <> 'inactive'
       ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
      [tenantId, type || null, gatewayId || null, parseInt(limit), offset]
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM hg_devices WHERE tenant_id=$1 AND COALESCE(status, 'offline') <> 'inactive'`, [tenantId]
    );
    res.json({ success: true, devices: r.rows, total: parseInt(count.rows[0].count), page: parseInt(page) });
  } catch (err) {
    console.error('[MQTT API] List devices error:', err);
    res.status(500).json({ success: false, message: 'Failed to list devices' });
  }
});

// ── Get device ───────────────────────────────────────────────────────────────
router.get('/devices/:id', authUser, requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT id, name, device_type, serial_number, manufacturer, model,
              location, gateway_id, device_key, active, created_at, last_seen
       FROM hg_devices WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Device not found' });
    res.json({ success: true, device: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get device' });
  }
});

// ── Update device ─────────────────────────────────────────────────────────────
router.put('/devices/:id', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const { name, location, model, manufacturer, gatewayId } = req.body;
    const pool = await connectPostgres();
    const r = await pool.query(
      `UPDATE hg_devices
       SET name = COALESCE($3, name),
           location = COALESCE($4, location),
           model = COALESCE($5, model),
           manufacturer = COALESCE($6, manufacturer),
           gateway_id = COALESCE($7, gateway_id),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, device_type, location, model, gateway_id, active`,
      [req.params.id, req.hgTenantId,
       name || null, location || null, model || null, manufacturer || null, gatewayId || null]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Device not found' });
    res.json({ success: true, device: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update device' });
  }
});

// ── Deactivate device ─────────────────────────────────────────────────────────
router.delete('/devices/:id', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_devices SET active = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId]
    );
    res.json({ success: true, message: 'Device deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to deactivate device' });
  }
});

// ── Rotate API key ────────────────────────────────────────────────────────────
router.post('/devices/:id/rotate-key', authUser, requireRole(['admin', 'hospital']), requireHgTenant, async (req, res) => {
  try {
    const newSecret = crypto.randomBytes(24).toString('hex');
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE hg_devices SET api_secret = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.hgTenantId, newSecret]
    );
    res.json({ success: true, newSecret, note: 'Update the device firmware with this new secret.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to rotate key' });
  }
});

// ── Broker live stats ─────────────────────────────────────────────────────────
router.get('/broker/stats', authUser, requireRole(['admin']), (req, res) => {
  const stats = getMqttStats();
  res.json({ success: true, broker: stats || { status: 'not_started' } });
});

// ── Recent readings ───────────────────────────────────────────────────────────
router.get('/readings', authUser, requireHgTenant, async (req, res) => {
  try {
    const { deviceId, eventType, limit = 50 } = req.query;
    const pool     = await connectPostgres();
    const tenantId = req.hgTenantId;
    const r = await pool.query(
      `SELECT r.* FROM hg_device_readings r
       JOIN hg_devices d ON d.device_key = r.gateway_id OR d.id::text = r.device_id
       WHERE d.tenant_id = $1
         AND ($2::text IS NULL OR r.device_id = $2)
         AND ($3::text IS NULL OR r.event_type = $3)
       ORDER BY r.received_at DESC
       LIMIT $4`,
      [tenantId, deviceId || null, eventType || null, parseInt(limit)]
    );
    res.json({ success: true, readings: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch readings' });
  }
});

export default router;
