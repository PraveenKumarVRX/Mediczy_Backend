/**
 * Pharmacy Customers Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';

const router = express.Router();

router.use(requirePharmacyAuth);

/**
 * POST /api/pharmacy/customers
 * Add new customer
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      city,
      loyaltyPoints = 0
    } = req.body;
    const pharmacyId = req.pharmacyId;

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
 * GET /api/pharmacy/customers/:customerId
 * Get customer details for the authenticated pharmacy
 */
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const pharmacyId = req.pharmacyId;

    const query = `
      SELECT * FROM pharmacy_customers
      WHERE id = $1 AND pharmacy_id = $2;
    `;

    const result = await db.query(query, [customerId, pharmacyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, customer: result.rows[0] });
  } catch (error) {
    console.error('Fetch customer detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer',
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
    const { limit = 100, offset = 0 } = req.query;
    const pharmacyId = req.pharmacyId;

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
