/**
 * Pharmacy Returns Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

const toPositiveInt = (value) => Math.max(0, Number.parseInt(value, 10) || 0);
const toPositiveAmount = (value) => Math.max(0, Number(value) || 0);

router.post('/', async (req, res) => {
  const pool = await db.getClient();
  const client = await pool.connect();

  try {
    const { transactionId, items, reason } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!transactionId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'transactionId and return items are required'
      });
    }

    await client.query('BEGIN');

    const transactionResult = await client.query(
      'SELECT id FROM pharmacy_transactions WHERE id = $1 AND pharmacy_id = $2',
      [transactionId, pharmacyId]
    );

    if (transactionResult.rows.length === 0) {
      throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
    }

    let totalAmount = 0;
    const normalizedItems = [];

    for (const item of items) {
      const medicineId = toPositiveInt(item.medicineId);
      const quantity = toPositiveInt(item.quantity);
      const price = toPositiveAmount(item.price);

      if (!medicineId || !quantity) {
        throw Object.assign(new Error('Each return item requires medicineId and positive quantity'), { statusCode: 400 });
      }

      const soldResult = await client.query(
        `
          SELECT COALESCE(SUM(quantity), 0)::int as sold_quantity
          FROM pharmacy_transaction_items
          WHERE transaction_id = $1 AND medicine_id = $2;
        `,
        [transactionId, medicineId]
      );

      const returnedResult = await client.query(
        `
          SELECT COALESCE(SUM(ri.quantity), 0)::int as returned_quantity
          FROM pharmacy_return_items ri
          INNER JOIN pharmacy_returns r ON ri.return_id = r.id
          WHERE r.transaction_id = $1 AND ri.medicine_id = $2 AND r.status = 'completed';
        `,
        [transactionId, medicineId]
      );

      const availableToReturn = Number(soldResult.rows[0].sold_quantity) - Number(returnedResult.rows[0].returned_quantity);
      if (quantity > availableToReturn) {
        throw Object.assign(new Error(`Return quantity exceeds sold quantity for medicine ${medicineId}`), { statusCode: 409 });
      }

      const subtotal = quantity * price;
      totalAmount += subtotal;
      normalizedItems.push({ medicineId, quantity, price, subtotal });
    }

    const returnResult = await client.query(
      `
        INSERT INTO pharmacy_returns
        (pharmacy_id, transaction_id, reason, total_amount, status, created_by)
        VALUES ($1, $2, $3, $4, 'completed', $5)
        RETURNING *;
      `,
      [pharmacyId, transactionId, reason || null, totalAmount, req.pharmacyToken?.id || null]
    );
    const returnRecord = returnResult.rows[0];

    for (const item of normalizedItems) {
      await client.query(
        `
          INSERT INTO pharmacy_return_items
          (return_id, medicine_id, quantity, price, subtotal)
          VALUES ($1, $2, $3, $4, $5);
        `,
        [returnRecord.id, item.medicineId, item.quantity, item.price, item.subtotal]
      );

      const stockResult = await client.query(
        `
          UPDATE pharmacy_stock
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE pharmacy_id = $2 AND medicine_id = $3
          RETURNING id;
        `,
        [item.quantity, pharmacyId, item.medicineId]
      );

      if (stockResult.rows.length === 0) {
        await client.query(
          `
            INSERT INTO pharmacy_stock (pharmacy_id, medicine_id, quantity, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW());
          `,
          [pharmacyId, item.medicineId, item.quantity]
        );
      }
    }

    await client.query('COMMIT');

    await logPharmacyAudit({
      pharmacyId,
      actorId: req.pharmacyToken?.id,
      action: 'return.create',
      resourceType: 'return',
      resourceId: returnRecord.id,
      details: { transactionId, totalAmount, itemCount: normalizedItems.length },
      req
    });

    res.json({
      success: true,
      message: 'Return recorded successfully',
      return: returnRecord
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create pharmacy return error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to record return',
      error: error.message
    });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

    const result = await db.query(
      `
        SELECT r.*, t.payment_method, c.name as customer_name
        FROM pharmacy_returns r
        LEFT JOIN pharmacy_transactions t ON r.transaction_id = t.id
        LEFT JOIN pharmacy_customers c ON t.customer_id = c.id
        WHERE r.pharmacy_id = $1
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3;
      `,
      [pharmacyId, limit, offset]
    );

    res.json({ success: true, returns: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Fetch pharmacy returns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch returns',
      error: error.message
    });
  }
});

export default router;
