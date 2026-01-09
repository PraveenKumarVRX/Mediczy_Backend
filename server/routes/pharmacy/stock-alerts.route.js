/**
 * Pharmacy Stock Alerts Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/stock-alerts
 * Create stock alert/reorder
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      medicineId,
      quantity,
      supplier,
      priority = 'normal',
      notes
    } = req.body;

    if (!medicineId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Medicine and quantity are required'
      });
    }

    const query = `
      INSERT INTO pharmacy_stock_alerts 
      (pharmacy_id, medicine_id, quantity, supplier, priority, status, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [
      pharmacyId,
      medicineId,
      quantity,
      supplier,
      priority,
      notes
    ]);

    res.json({
      success: true,
      message: 'Stock alert created successfully',
      alert: result.rows[0]
    });
  } catch (error) {
    console.error('Create stock alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create stock alert',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/stock-alerts
 * List all stock alerts
 */
router.get('/', async (req, res) => {
  try {
    const { pharmacyId, limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT a.*, m.name as medicine_name
      FROM pharmacy_stock_alerts a
      JOIN pharmacy_medicines m ON a.medicine_id = m.id
      WHERE a.pharmacy_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      alerts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch stock alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock alerts',
      error: error.message
    });
  }
});

export default router;
