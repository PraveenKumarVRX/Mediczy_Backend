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
  'ordered', 'pending', 'confirmed', 'sample_collected', 'processing', 'in_progress', 'completed', 'cancelled'
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
  let client;
  try {
    const labId = req.lab.id;
    const { orderId } = req.params;
    const nextStatus = String(req.body.status || '').trim().toLowerCase();
    const results = req.body.results || null;

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Unsupported status value' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM lab_orders WHERE id = $1 AND lab_id = $2 FOR UPDATE`,
      [orderId, labId]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // A patient result may not be released on a QC material that has not been
    // released itself. The analytical run behind the number is only trustworthy
    // if its quality control passed, so completing against a locked material is
    // refused and the transaction rolled back rather than letting an
    // unvalidated result reach a clinician.
    const qcMaterialId = req.body.qcMaterialId ?? null;
    const qcRunId = req.body.qcRunId ?? null;
    let qcReleased = false;
    if (nextStatus === 'completed' && qcMaterialId) {
      const qcMaterial = await client.query(
        `SELECT id, release_status FROM lab_qc_materials WHERE id = $1 AND lab_id = $2`,
        [qcMaterialId, labId]
      );
      const releaseStatus = qcMaterial.rows[0]?.release_status;
      if (releaseStatus !== 'released') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          code: 'qc_not_released',
          message: qcMaterial.rows[0]
            ? `Quality control for this run is ${releaseStatus}. Release the QC material before completing the order.`
            : 'The quality-control material for this run was not found.',
        });
      }
      qcReleased = true;
      if (qcRunId) {
        await client.query(
          `SELECT id FROM lab_qc_runs WHERE id = $1 AND lab_id = $2 AND material_id = $3`,
          [qcRunId, labId, qcMaterialId]
        );
      }
    }

    // Releasing on validated QC cuts a new result version, so an amended result
    // is distinguishable from the one already reported.
    const update = await client.query(
      `UPDATE lab_orders
       SET status = $1,
           results = COALESCE($2, results),
           sample_collected_at = CASE WHEN $1 = 'sample_collected' THEN COALESCE(sample_collected_at, NOW()) ELSE sample_collected_at END,
           release_status = CASE WHEN $5 THEN 'released' ELSE release_status END,
           result_version = CASE WHEN $5 THEN COALESCE(result_version, 0) + 1 ELSE result_version END,
           qc_material_id = COALESCE($6, qc_material_id),
           qc_run_id = COALESCE($7, qc_run_id),
           updated_at = NOW()
       WHERE id = $3 AND lab_id = $4
       RETURNING *`,
      [nextStatus, results ? JSON.stringify(results) : null, orderId, labId, qcReleased, qcMaterialId, qcRunId]
    );

    let billing = null;
    const labOrder = update.rows[0];
    if (labOrder.source_type === 'patient_lab_checkout' && labOrder.source_id) {
      const patientStatus = nextStatus === 'cancelled' ? 'cancelled'
        : nextStatus === 'completed' && labOrder.release_status === 'released' ? 'completed'
        : ['confirmed', 'sample_collected', 'processing', 'in_progress', 'completed'].includes(nextStatus) ? 'booked' : 'pending_confirmation';
      await client.query(`UPDATE lab_tests SET status = $1, "confirmationStatus" = CASE WHEN $1 IN ('booked', 'completed') THEN 'confirmed' ELSE "confirmationStatus" END,
        "resultStatus" = CASE WHEN $1 = 'completed' THEN 'ready' ELSE "resultStatus" END,
        "confirmationDeadline" = CASE WHEN $1 <> 'pending_confirmation' THEN NULL ELSE "confirmationDeadline" END,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('labWorkflowStatus', $2::text), "updatedAt" = NOW()
        WHERE id = $3 AND "userId" = $4 AND metadata->>'labId' = $5`,
      [patientStatus, nextStatus, labOrder.source_id, labOrder.patient_id, String(labId)]);
    }
    await client.query('COMMIT');
    if (nextStatus === 'completed' && labOrder.source_type !== 'patient_lab_checkout') {
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
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[lab/orders] status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status', error: error.message });
  } finally {
    client?.release();
  }
});

export default router;
