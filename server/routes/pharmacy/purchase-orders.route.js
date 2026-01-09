/**
 * Pharmacy Purchase Orders Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/purchase-orders
 * Create new purchase order
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      supplier,
      items, // [{medicineId, quantity, unitPrice}]
      expectedDeliveryDate,
      notes
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items are required'
      });
    }

    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += item.quantity * item.unitPrice;
    });

    // Insert purchase order
    const query = `
      INSERT INTO pharmacy_purchase_orders 
      (pharmacy_id, supplier, total_amount, expected_delivery_date, status, notes, created_at)
      VALUES ($1, $2, $3, $4, 'pending', $5, NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [
      pharmacyId,
      supplier,
      totalAmount,
      expectedDeliveryDate,
      notes
    ]);
    const order = result.rows[0];

    // Insert order items
    for (const item of items) {
      const itemQuery = `
        INSERT INTO pharmacy_purchase_order_items 
        (order_id, medicine_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      await db.query(itemQuery, [
        order.id,
        item.medicineId,
        item.quantity,
        item.unitPrice,
        item.quantity * item.unitPrice
      ]);
    }

    res.json({
      success: true,
      message: 'Purchase order created successfully',
      order
    });
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase order',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/purchase-orders
 * List all purchase orders
 */
router.get('/', async (req, res) => {
  try {
    const { pharmacyId, limit = 100, offset = 0 } = req.query;

    const query = `
      SELECT * FROM pharmacy_purchase_orders
      WHERE pharmacy_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      orders: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch purchase orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase orders',
      error: error.message
    });
  }
});

export default router;
