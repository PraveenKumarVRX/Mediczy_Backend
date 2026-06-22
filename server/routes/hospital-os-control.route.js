/** GAP-HOS-001 — Hospital OS control plane */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';

const router = express.Router();

router.get('/devices', authUser, async (req, res) => {
  const orgId = req.user.organization_id || req.user.tenant_id;
  const { rows } = await pool.query(
    `SELECT id, device_token, zone, location_label, screen_type, last_seen_at, active
     FROM display_devices WHERE organization_id = $1 ORDER BY zone, location_label`,
    [orgId],
  ).catch(() => ({ rows: [] }));
  res.json({ success: true, data: rows });
});

router.post('/devices', authUser, async (req, res) => {
  const orgId = req.user.organization_id || req.user.tenant_id;
  const { zone, locationLabel, screenType, deviceToken } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO display_devices (organization_id, zone, location_label, screen_type, device_token, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW()) RETURNING *`,
    [orgId, zone, locationLabel, screenType || 'display', deviceToken],
  ).catch(() => ({ rows: [] }));
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/cms/signage', authUser, async (req, res) => {
  const orgId = req.user.organization_id || req.user.tenant_id;
  const { rows } = await pool.query(
    `SELECT id, title, body, zone, active, updated_at FROM display_signage WHERE organization_id = $1 ORDER BY updated_at DESC`,
    [orgId],
  ).catch(() => ({ rows: [] }));
  res.json({ success: true, data: rows });
});

router.post('/cms/signage', authUser, async (req, res) => {
  const orgId = req.user.organization_id || req.user.tenant_id;
  const { title, body, zone } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO display_signage (organization_id, title, body, zone, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW(), NOW()) RETURNING *`,
    [orgId, title, body || '', zone || 'lobby'],
  ).catch(() => ({ rows: [{ id: Date.now(), title, body, zone }] }));
  res.status(201).json({ success: true, data: rows[0] });
});

export default router;
