/**
 * Data Export & Erasure Routes (DPDPA compliance)
 * POST /api/users/data-export              → request export
 * GET  /api/users/data-export/:requestId   → check status
 * GET  /api/users/data-export/:requestId/download → get signed download URL
 * POST /api/users/data-erasure             → request erasure
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  requestDataExport,
  getExportDownloadUrl,
  executeErasure,
} from '../services/data-export.service.js';
import { getPool as pgPool } from '../db/postgres.js';

const router = express.Router();

// Request data export (portability)
router.post('/export', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId  = req.user.organization_id;
    const result = await requestDataExport(userId, 'portability', orgId);
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Check export request status
router.get('/export/:requestId', authUser, async (req, res) => {
  try {
    const pool = pgPool();
    const { rows } = await pool.query(
      `SELECT id, request_type, status, deadline_at, completed_at
       FROM data_deletion_requests
       WHERE id = $1 AND user_id = $2`,
      [req.params.requestId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get signed download URL for completed export
router.get('/export/:requestId/download', authUser, async (req, res) => {
  try {
    const result = await getExportDownloadUrl(req.params.requestId, req.user.id);
    if (!result.url) {
      return res.status(202).json({ success: true, status: result.status, message: 'Export not ready yet' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Request data erasure (DPDPA §14)
router.post('/erasure', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId  = req.user.organization_id;
    const { rows } = await pgPool().query(
      `INSERT INTO data_deletion_requests (user_id, organization_id, request_type)
       VALUES ($1, $2, 'erasure') RETURNING id, deadline_at`,
      [userId, orgId]
    );
    const requestId = rows[0].id;

    // For erasure, execute immediately (DPDPA requires within 30 days; we do it now)
    await executeErasure(userId, requestId);

    res.json({ success: true, data: { requestId, status: 'completed', message: 'Your data has been erased' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
