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

/**
 * Request data erasure (DPDPA §14).
 *
 * This executes immediately and cannot be undone, so it takes two guards that
 * it did not have when it was unreachable from any client:
 *
 *  1. An explicit `confirm: 'ERASE'` body. A single unconfirmed POST used to be
 *     enough to destroy an account's data; the mobile app's "Delete account"
 *     flow is the first caller and sends this after a typed confirmation.
 *  2. A refusal for service accounts flagged `metadata.doNotDelete`. The
 *     app-store reviewer login is a patient account like any other, so without
 *     this a reviewer tapping Delete account would erase the credentials every
 *     future store review depends on.
 */
router.post('/erasure', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId  = req.user.organization_id;

    if (req.body?.confirm !== 'ERASE') {
      return res.status(400).json({
        success: false,
        code: 'erasure_not_confirmed',
        message: 'Send confirm: "ERASE" to erase this account. This cannot be undone.',
      });
    }

    const { rows: guard } = await pgPool().query(
      `SELECT metadata FROM users WHERE id = $1`,
      [userId]
    );
    const metadata = guard[0]?.metadata || {};
    if (metadata.doNotDelete === true || metadata.purpose === 'app-store-review') {
      return res.status(403).json({
        success: false,
        code: 'account_protected',
        message: 'This is a managed account and cannot be deleted from the app. Contact your organisation administrator.',
      });
    }

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
