/**
 * Pharmacy Batch Management Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/batches
 * Add new batch
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      medicineId,
      batchNumber,
      quantity,
      expiryDate,
      costPrice,
      supplier,
      manufacturingDate
    } = req.body;

    if (!batchNumber || !medicineId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Batch number, medicine, and quantity are required'
      });
    }

    const query = `
      INSERT INTO pharmacy_batches 
      (pharmacy_id, medicine_id, batch_number, quantity, expiry_date, cost_price, supplier, manufacturing_date, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [
      pharmacyId,
      medicineId,
      batchNumber,
      quantity,
      expiryDate,
      costPrice,
      supplier,
      manufacturingDate
    ]);

    res.json({
      success: true,
      message: 'Batch added successfully',
      batch: result.rows[0]
    });
  } catch (error) {
    console.error('Add batch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add batch',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/batches
 * List all batches
 */
router.get('/', async (req, res) => {
  try {
    const { pharmacyId, limit = 100, offset = 0 } = req.query;

    const query = `
      SELECT b.*, m.name as medicine_name
      FROM pharmacy_batches b
      JOIN pharmacy_medicines m ON b.medicine_id = m.id
      WHERE b.pharmacy_id = $1
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      batches: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch batches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batches',
      error: error.message
    });
  }
});

export default router;
