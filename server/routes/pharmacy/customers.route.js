/**
 * Pharmacy Customers Routes
 */

import express from 'express';
import { db } from '../../db/index.js';

const router = express.Router();

/**
 * POST /api/pharmacy/customers
 * Add new customer
 */
router.post('/', async (req, res) => {
  try {
    const {
      pharmacyId,
      name,
      phone,
      email,
      address,
      city,
      loyaltyPoints = 0
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone are required'
      });
    }

    const query = `
      INSERT INTO pharmacy_customers 
      (pharmacy_id, name, phone, email, address, city, loyalty_points, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [
      pharmacyId,
      name,
      phone,
      email,
      address,
      city,
      loyaltyPoints
    ]);

    res.json({
      success: true,
      message: 'Customer added successfully',
      customer: result.rows[0]
    });
  } catch (error) {
    console.error('Add customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add customer',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/customers
 * List all customers
 */
router.get('/', async (req, res) => {
  try {
    const { pharmacyId, limit = 100, offset = 0 } = req.query;

    const query = `
      SELECT * FROM pharmacy_customers
      WHERE pharmacy_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      customers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
});

export default router;
