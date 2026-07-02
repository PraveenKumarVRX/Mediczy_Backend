/**
 * Lab Portal — incoming EMR lab orders
 * GET  /api/lab/orders
 * GET  /api/lab/orders/:id
 * PATCH /api/lab/orders/:id/status
 */

import express from 'express';
import pool from '../../db/pgPool.js';
import { authLab } from '../../middleware/authLab.middleware.js';
import emrOrderRouter from '../../services/emr-order-router.service.js';

const router = express.Router();
router.use(authLab);

const ALLOWED_STATUSES = new Set([
  'ordered', 'pending', 'sample_collected', 'processing', 'in_progress', 'completed', 'cancelled'
]);

router.get('/', async (req, res) => {
  try {
    const labId = req.lab.id;
    const { status, limit = 50, offset = 0 } = req.query;
    const params = [labId];
    let statusClause = '';

    if (status) {
      params.push(String(status).toLowerCase());
      statusClause = `AND LOWER(lo.status) = LOWER($${params.length})`;
    }

    params.push(Math.min(200, Math.max(1, parseInt(limit, 10) || 50)));
    params.push(Math.max(0, parseInt(offset, 10) || 0));

    const { rows } = await pool.query(
      `SELECT lo.id, lo.order_number, lo.patient_id, lo.hospital_id, lo.organization_id,
              lo.test_type, lo.test_category, lo.tests, lo.priority, lo.status, lo.notes,
              lo.total_amount, lo.sample_collected_at, lo.created_at, lo.updated_at,
              TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))) AS patient_name,
              u."phoneNumber" AS patient_phone,
              hbc.amount AS billing_amount, hbc.status AS billing_status
       FROM lab_orders lo
       LEFT JOIN users u ON u.id = lo.patient_id
       LEFT JOIN hospital_billing_charges hbc ON hbc.id = lo.billing_charge_id
       WHERE lo.lab_id = $1 ${statusClause}
       ORDER BY lo.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, orders: rows, total: rows.length });
  } catch (error) {
    console.error('[lab/orders] list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lab orders', error: error.message });
  }
});

router.get('/:orderId', async (req, res) => {
  try {
    const labId = req.lab.id;
    const { orderId } = req.params;

    const { rows } = await pool.query(
      `SELECT lo.*,
              TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))) AS patient_name
       FROM lab_orders lo
       LEFT JOIN users u ON u.id = lo.patient_id
       WHERE lo.id = $1 AND lo.lab_id = $2`,
      [orderId, labId]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, order: rows[0] });
  } catch (error) {
    console.error('[lab/orders] detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
});

router.patch('/:orderId/status', async (req, res) => {
  try {
    const labId = req.lab.id;
    const { orderId } = req.params;
    const nextStatus = String(req.body.status || '').trim().toLowerCase();
    const results = req.body.results || null;

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Unsupported status value' });
    }

    const current = await pool.query(
      `SELECT * FROM lab_orders WHERE id = $1 AND lab_id = $2`,
      [orderId, labId]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const update = await pool.query(
      `UPDATE lab_orders
       SET status = $1,
           results = COALESCE($2, results),
           sample_collected_at = CASE WHEN $1 = 'sample_collected' THEN COALESCE(sample_collected_at, NOW()) ELSE sample_collected_at END,
           updated_at = NOW()
       WHERE id = $3 AND lab_id = $4
       RETURNING *`,
      [nextStatus, results ? JSON.stringify(results) : null, orderId, labId]
    );

    let billing = null;
    if (nextStatus === 'completed') {
      billing = await emrOrderRouter.finalizeLabOrderBilling(Number(orderId), {
        amount: req.body.amount
      });
    }

    res.json({
      success: true,
      message: 'Order status updated',
      order: update.rows[0],
      billing
    });
  } catch (error) {
    console.error('[lab/orders] status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status', error: error.message });
  }
});

export default router;
