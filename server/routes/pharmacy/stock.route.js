/**
 * Pharmacy Medicine Stock Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';

const router = express.Router();

router.use(requirePharmacyAuth);

/**
 * POST /api/pharmacy/stock
 * Add new medicine to stock
 */
router.post('/', async (req, res) => {
  try {
    const {
      medicineName,
      quantity,
      unitPrice,
      expiryDate,
      batchNumber,
      supplier,
      reorderLevel = quantity / 2
    } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!medicineName || !quantity || !unitPrice) {
      return res.status(400).json({
        success: false,
        message: 'Medicine name, quantity, and price are required'
      });
    }

    // Insert medicine
    const medicineQuery = `
      INSERT INTO pharmacy_medicines 
      (name, unit_price, reorder_level, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;

    const medicineResult = await db.query(medicineQuery, [medicineName, unitPrice, reorderLevel]);
    const medicine = medicineResult.rows[0];

    // Insert stock
    const stockQuery = `
      INSERT INTO pharmacy_stock 
      (pharmacy_id, medicine_id, quantity, expiry_date, batch_number, supplier, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;

    const stockResult = await db.query(stockQuery, [
      pharmacyId,
      medicine.id,
      quantity,
      expiryDate,
      batchNumber,
      supplier
    ]);

    res.json({
      success: true,
      message: 'Medicine added to stock successfully',
      stock: stockResult.rows[0]
    });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add medicine to stock',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/stock
 * List all medicines in stock
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const pharmacyId = req.pharmacyId;

    const query = `
      SELECT s.*, m.name, m.unit_price, m.reorder_level
      FROM pharmacy_stock s
      JOIN pharmacy_medicines m ON s.medicine_id = m.id
      WHERE s.pharmacy_id = $1
      ORDER BY m.name ASC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      stock: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock',
      error: error.message
    });
  }
});

/**
 * PUT /api/pharmacy/stock/:stockId
 * Update stock quantity
 */
router.put('/:stockId', async (req, res) => {
  try {
    const { stockId } = req.params;
    const { quantity } = req.body;
    const pharmacyId = req.pharmacyId;

    const query = `
      UPDATE pharmacy_stock 
      SET quantity = $1, updated_at = NOW()
      WHERE id = $2 AND pharmacy_id = $3
      RETURNING *;
    `;

    const result = await db.query(query, [quantity, stockId, pharmacyId]);

    res.json({
      success: true,
      message: 'Stock updated successfully',
      stock: result.rows[0]
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock',
      error: error.message
    });
  }
});

export default router;
