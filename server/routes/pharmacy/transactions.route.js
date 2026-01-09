/**
 * Pharmacy Point of Sales - Transaction Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/transactions
 * Create new point of sales transaction
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      customerId,
      items, // [{medicineId, quantity, price}]
      totalAmount,
      paymentMethod,
      notes
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items are required'
      });
    }

    // Insert transaction
    const query = `
      INSERT INTO pharmacy_transactions 
      (pharmacy_id, customer_id, total_amount, payment_method, notes, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [pharmacyId, customerId, totalAmount, paymentMethod, notes]);
    const transaction = result.rows[0];

    // Insert transaction items
    for (const item of items) {
      const itemQuery = `
        INSERT INTO pharmacy_transaction_items 
        (transaction_id, medicine_id, quantity, price, subtotal)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      await db.query(itemQuery, [transaction.id, item.medicineId, item.quantity, item.price, item.quantity * item.price]);

      // Update stock
      const stockQuery = `
        UPDATE pharmacy_stock 
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE medicine_id = $2 AND pharmacy_id = $3;
      `;
      await db.query(stockQuery, [item.quantity, item.medicineId, pharmacyId]);
    }

    res.json({
      success: true,
      message: 'Transaction created successfully',
      transaction
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
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
    const { pharmacyId, limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT t.*, c.name as customer_name
      FROM pharmacy_transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
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
