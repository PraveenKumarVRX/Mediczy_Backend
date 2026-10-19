/**
 * Pharmacy Supplier Returns Routes
 *
 * For sending expired/damaged stock back to a supplier — the mirror image of
 * returns.route.js (customer returns), decrementing stock/batches instead of
 * restocking it.
 */

import express from 'express';
import sharedPool from '../../db/pgPool.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

const toPositiveInt = (value) => Math.max(0, Number.parseInt(value, 10) || 0);
const toPositiveAmount = (value) => Math.max(0, Number(value) || 0);

/**
 * POST /api/pharmacy/supplier-returns
 * body: { supplierId?, supplierName?, reason, items: [{ medicineId, batchId?, quantity, costPrice }] }
 */
router.post('/', async (req, res) => {
  const client = await sharedPool.connect();
  try {
    const { supplierId, supplierName, reason, items } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one return item is required' });
    }

    await client.query('BEGIN');

    let totalAmount = 0;
    const normalizedItems = [];

    for (const item of items) {
      const medicineId = toPositiveInt(item.medicineId);
      const batchId = item.batchId ? toPositiveInt(item.batchId) : null;
      const quantity = toPositiveInt(item.quantity);
      const costPrice = toPositiveAmount(item.costPrice);

      if (!medicineId || !quantity) {
        throw Object.assign(new Error('Each item requires medicineId and positive quantity'), { status: 400 });
      }

      if (batchId) {
        const batch = await client.query(
          `SELECT id, quantity FROM pharmacy_batches WHERE id = $1 AND pharmacy_id = $2 AND medicine_id = $3 FOR UPDATE`,
          [batchId, pharmacyId, medicineId]
        );
        if (!batch.rows.length) {
          throw Object.assign(new Error(`Batch ${batchId} not found for this pharmacy/medicine`), { status: 404 });
        }
        if (Number(batch.rows[0].quantity) < quantity) {
          throw Object.assign(new Error(`Return quantity exceeds remaining batch quantity for medicine ${medicineId}`), { status: 409 });
        }
        await client.query(`UPDATE pharmacy_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [quantity, batchId]);
      }

      const stock = await client.query(
        `UPDATE pharmacy_stock SET quantity = quantity - $1, updated_at = NOW()
         WHERE pharmacy_id = $2 AND medicine_id = $3 AND quantity >= $1 RETURNING id`,
        [quantity, pharmacyId, medicineId]
      );
      if (!stock.rows.length) {
        throw Object.assign(new Error(`Insufficient stock to return for medicine ${medicineId}`), { status: 409 });
      }

      const subtotal = quantity * costPrice;
      totalAmount += subtotal;
      normalizedItems.push({ medicineId, batchId, quantity, costPrice, subtotal });
    }

    const returnResult = await client.query(
      `INSERT INTO pharmacy_supplier_returns (pharmacy_id, supplier_id, supplier_name, reason, total_amount, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'completed', $6) RETURNING *`,
      [pharmacyId, supplierId || null, supplierName || null, reason || null, totalAmount, req.pharmacyToken?.id || null]
    );
    const supplierReturn = returnResult.rows[0];

    for (const item of normalizedItems) {
      await client.query(
        `INSERT INTO pharmacy_supplier_return_items (supplier_return_id, medicine_id, batch_id, quantity, cost_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [supplierReturn.id, item.medicineId, item.batchId, item.quantity, item.costPrice, item.subtotal]
      );
    }

    await client.query('COMMIT');

    await logPharmacyAudit({
      pharmacyId, actorId: req.pharmacyToken?.id, action: 'supplier_return.create',
      resourceType: 'supplier_return', resourceId: supplierReturn.id,
      details: { supplierId, totalAmount, itemCount: normalizedItems.length }, req,
    });

    res.json({ success: true, message: 'Supplier return recorded', supplierReturn });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create supplier return error:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Failed to record supplier return', error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/pharmacy/supplier-returns
 */
router.get('/', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

    const result = await sharedPool.query(
      `SELECT sr.*, s.name AS supplier_master_name
       FROM pharmacy_supplier_returns sr
       LEFT JOIN pharmacy_suppliers s ON sr.supplier_id = s.id
       WHERE sr.pharmacy_id = $1 ORDER BY sr.created_at DESC LIMIT $2 OFFSET $3`,
      [pharmacyId, limit, offset]
    );

    res.json({ success: true, supplierReturns: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Fetch supplier returns error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier returns', error: error.message });
  }
});

export default router;
