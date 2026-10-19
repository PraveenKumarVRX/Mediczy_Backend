/**
 * Pharmacy Supplier Master Routes
 */

import express from 'express';
import sharedPool from '../../db/pgPool.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';

const router = express.Router();

router.use(requirePharmacyAuth);

/**
 * GET /api/pharmacy/suppliers
 */
router.get('/', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const { search, limit = 100, offset = 0 } = req.query;

    const conditions = ['pharmacy_id = $1'];
    const params = [pharmacyId];
    if (search) {
      conditions.push(`(name ILIKE $${params.length + 1} OR contact_person ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const result = await sharedPool.query(
      `SELECT * FROM pharmacy_suppliers WHERE ${conditions.join(' AND ')}
       ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ success: true, suppliers: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Fetch suppliers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch suppliers', error: error.message });
  }
});

/**
 * POST /api/pharmacy/suppliers
 */
router.post('/', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const { name, contactPerson, phone, email, gstin, paymentTerms, notes } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Supplier name is required' });

    const result = await sharedPool.query(
      `INSERT INTO pharmacy_suppliers (pharmacy_id, name, contact_person, phone, email, gstin, payment_terms, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [pharmacyId, name, contactPerson || null, phone || null, email || null, gstin || null, paymentTerms || null, notes || null]
    );

    res.status(201).json({ success: true, message: 'Supplier added', supplier: result.rows[0] });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ success: false, message: 'Failed to add supplier', error: error.message });
  }
});

/**
 * PUT /api/pharmacy/suppliers/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const id = parseInt(req.params.id, 10);
    const { name, contactPerson, phone, email, gstin, paymentTerms, outstandingPayable, notes } = req.body;

    const result = await sharedPool.query(
      `UPDATE pharmacy_suppliers SET
         name = COALESCE($1, name), contact_person = COALESCE($2, contact_person),
         phone = COALESCE($3, phone), email = COALESCE($4, email), gstin = COALESCE($5, gstin),
         payment_terms = COALESCE($6, payment_terms),
         outstanding_payable = COALESCE($7, outstanding_payable),
         notes = COALESCE($8, notes), updated_at = NOW()
       WHERE id = $9 AND pharmacy_id = $10 RETURNING *`,
      [name || null, contactPerson || null, phone || null, email || null, gstin || null,
       paymentTerms || null, outstandingPayable !== undefined ? outstandingPayable : null, notes || null, id, pharmacyId]
    );

    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.json({ success: true, message: 'Supplier updated', supplier: result.rows[0] });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ success: false, message: 'Failed to update supplier', error: error.message });
  }
});

export default router;
