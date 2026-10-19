/**
 * Pharmacy Purchase Orders Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

router.post('/', async (req, res) => {
  try {
    const { supplier, supplierId, items, expectedDeliveryDate, notes } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items are required' });
    }

    for (const item of items) {
      if (!item.medicineId || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0) {
        return res.status(400).json({ success: false, message: 'Each item requires medicineId, positive quantity, and valid unitPrice' });
      }
    }

    let supplierName = supplier || null;
    if (supplierId && !supplierName) {
      const supplierRow = await db.query('SELECT name FROM pharmacy_suppliers WHERE id = $1 AND pharmacy_id = $2', [supplierId, pharmacyId]);
      supplierName = supplierRow.rows[0]?.name || null;
    }

    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

    const result = await db.query([
      'INSERT INTO pharmacy_purchase_orders',
      '(pharmacy_id, supplier, supplier_id, total_amount, expected_delivery_date, status, notes, created_at)',
      "VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())",
      'RETURNING *;'
    ].join(' '), [pharmacyId, supplierName, supplierId || null, totalAmount, expectedDeliveryDate || null, notes || null]);
    const order = result.rows[0];

    for (const item of items) {
      await db.query([
        'INSERT INTO pharmacy_purchase_order_items',
        '(order_id, medicine_id, quantity, unit_price, subtotal)',
        'VALUES ($1, $2, $3, $4, $5)',
        'RETURNING *;'
      ].join(' '), [
        order.id,
        item.medicineId,
        Number(item.quantity),
        Number(item.unitPrice),
        Number(item.quantity) * Number(item.unitPrice)
      ]);
    }

    await logPharmacyAudit({
      pharmacyId,
      actorId: req.pharmacyToken?.id,
      action: 'purchase_order.create',
      resourceType: 'purchase_order',
      resourceId: order.id,
      details: { supplier, totalAmount, itemCount: items.length },
      req
    });

    res.json({ success: true, message: 'Purchase order created successfully', order });
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create purchase order', error: error.message });
  }
});

router.post('/:orderId/receive', async (req, res) => {
  const pool = await db.getClient();
  const client = await pool.connect();

  try {
    const pharmacyId = req.pharmacyId;
    const { orderId } = req.params;
    const { batches } = req.body || {}; // optional: [{ medicineId, batchNumber, expiryDate, costPrice }]
    const batchByMedicine = new Map((Array.isArray(batches) ? batches : []).map((b) => [b.medicineId, b]));

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM pharmacy_purchase_orders WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE',
      [orderId, pharmacyId]
    );

    if (orderResult.rows.length === 0) {
      throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 });
    }

    const order = orderResult.rows[0];
    if (String(order.status).toLowerCase() === 'received') {
      throw Object.assign(new Error('Purchase order is already received'), { statusCode: 409 });
    }

    const itemsResult = await client.query('SELECT * FROM pharmacy_purchase_order_items WHERE order_id = $1', [orderId]);

    if (itemsResult.rows.length === 0) {
      throw Object.assign(new Error('Purchase order has no items'), { statusCode: 400 });
    }

    for (const item of itemsResult.rows) {
      const stockResult = await client.query([
        'UPDATE pharmacy_stock',
        'SET quantity = quantity + $1, supplier = COALESCE($2, supplier), updated_at = NOW()',
        'WHERE pharmacy_id = $3 AND medicine_id = $4',
        'RETURNING id;'
      ].join(' '), [item.quantity, order.supplier || null, pharmacyId, item.medicine_id]);

      if (stockResult.rows.length === 0) {
        await client.query([
          'INSERT INTO pharmacy_stock (pharmacy_id, medicine_id, quantity, supplier, created_at, updated_at)',
          'VALUES ($1, $2, $3, $4, NOW(), NOW());'
        ].join(' '), [pharmacyId, item.medicine_id, item.quantity, order.supplier || null]);
      }

      // Capture the real batch/expiry if supplied at receipt time (the manufacturer's
      // actual batch is only known once goods physically arrive, not at PO creation).
      const batchInfo = batchByMedicine.get(item.medicine_id);
      if (batchInfo?.batchNumber) {
        await client.query([
          'INSERT INTO pharmacy_batches (pharmacy_id, medicine_id, batch_number, quantity, expiry_date, cost_price, supplier, created_at, updated_at)',
          'VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
          'ON CONFLICT (batch_number) DO UPDATE SET quantity = pharmacy_batches.quantity + EXCLUDED.quantity, updated_at = NOW();'
        ].join(' '), [pharmacyId, item.medicine_id, batchInfo.batchNumber, item.quantity, batchInfo.expiryDate || null, batchInfo.costPrice || item.unit_price, order.supplier || null]);
      }
    }

    const updateResult = await client.query([
      'UPDATE pharmacy_purchase_orders',
      "SET status = 'received', received_at = NOW(), received_by = $1, updated_at = NOW()",
      'WHERE id = $2 AND pharmacy_id = $3',
      'RETURNING *;'
    ].join(' '), [req.pharmacyToken?.id || null, orderId, pharmacyId]);

    await client.query('COMMIT');

    await logPharmacyAudit({
      pharmacyId,
      actorId: req.pharmacyToken?.id,
      action: 'purchase_order.receive',
      resourceType: 'purchase_order',
      resourceId: orderId,
      details: { itemCount: itemsResult.rows.length, supplier: order.supplier },
      req
    });

    res.json({ success: true, message: 'Purchase order received successfully', order: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Receive purchase order error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to receive purchase order',
      error: error.message
    });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const pharmacyId = req.pharmacyId;

    const result = await db.query([
      'SELECT * FROM pharmacy_purchase_orders',
      'WHERE pharmacy_id = $1',
      'ORDER BY created_at DESC',
      'LIMIT $2 OFFSET $3;'
    ].join(' '), [pharmacyId, limit, offset]);

    res.json({ success: true, orders: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Fetch purchase orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch purchase orders', error: error.message });
  }
});

export default router;
