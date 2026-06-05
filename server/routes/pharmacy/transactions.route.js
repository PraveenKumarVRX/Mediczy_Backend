/**
 * Pharmacy Point of Sales - Transaction Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

/**
 * POST /api/pharmacy/transactions
 * Create new point of sales transaction
 */
router.post('/', async (req, res) => {
  const pool = await db.getClient();
  const client = await pool.connect();

  try {
    const {
      customerId,
      items, // [{medicineId, quantity, price}]
      paymentMethod,
      notes
    } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items are required'
      });
    }

    for (const item of items) {
      if (!item.medicineId || Number(item.quantity) <= 0 || Number(item.price) < 0) {
        return res.status(400).json({
          success: false,
          message: 'Each item requires medicineId, positive quantity, and valid price'
        });
      }
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.price),
      0
    );

    await client.query('BEGIN');

    const transactionResult = await client.query(
      `
        INSERT INTO pharmacy_transactions
        (pharmacy_id, customer_id, total_amount, payment_method, notes, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
        RETURNING *;
      `,
      [pharmacyId, customerId || null, totalAmount, paymentMethod, notes || null]
    );
    const transaction = transactionResult.rows[0];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const price = Number(item.price);

      const stockResult = await client.query(
        `
          UPDATE pharmacy_stock
          SET quantity = quantity - $1, updated_at = NOW()
          WHERE medicine_id = $2 AND pharmacy_id = $3 AND quantity >= $1
          RETURNING id, quantity;
        `,
        [quantity, item.medicineId, pharmacyId]
      );

      if (stockResult.rows.length === 0) {
        throw Object.assign(new Error('Insufficient stock for medicine ' + item.medicineId), { statusCode: 409 });
      }

      await client.query(
        `
          INSERT INTO pharmacy_transaction_items
          (transaction_id, medicine_id, quantity, price, subtotal)
          VALUES ($1, $2, $3, $4, $5);
        `,
        [transaction.id, item.medicineId, quantity, price, quantity * price]
      );
    }

    await client.query('COMMIT');

    await logPharmacyAudit({
      pharmacyId,
      actorId: req.pharmacyToken?.id,
      action: 'transaction.create',
      resourceType: 'transaction',
      resourceId: transaction.id,
      details: { totalAmount, itemCount: items.length, paymentMethod },
      req
    });

    res.json({
      success: true,
      message: 'Transaction created successfully',
      transaction
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create transaction error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 409 ? error.message : 'Failed to create transaction',
      error: error.message
    });
  } finally {
    client.release();
  }
});
/**
 * GET /api/pharmacy/transactions/:transactionId
 * Get transaction details for the authenticated pharmacy
 */
router.get('/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const pharmacyId = req.pharmacyId;

    const transactionQuery = `
      SELECT t.*, c.name as customer_name
      FROM pharmacy_transactions t
      LEFT JOIN pharmacy_customers c ON t.customer_id = c.id
      WHERE t.id = $1 AND t.pharmacy_id = $2;
    `;
    const transactionResult = await db.query(transactionQuery, [transactionId, pharmacyId]);

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const itemsQuery = `
      SELECT ti.*, pm.name as medicine_name
      FROM pharmacy_transaction_items ti
      LEFT JOIN pharmacy_medicines pm ON ti.medicine_id = pm.id
      WHERE ti.transaction_id = $1;
    `;
    const itemsResult = await db.query(itemsQuery, [transactionId]);

    res.json({
      success: true,
      transaction: {
        ...transactionResult.rows[0],
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Fetch transaction detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/transactions
 * List all transactions
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const pharmacyId = req.pharmacyId;

    const query = `
      SELECT t.*, c.name as customer_name
      FROM pharmacy_transactions t
      LEFT JOIN pharmacy_customers c ON t.customer_id = c.id
      WHERE t.pharmacy_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      transactions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

export default router;
