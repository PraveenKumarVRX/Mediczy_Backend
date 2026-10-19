/**
 * Pharmacy Customer Credit Routes
 *
 * Credit charges are posted automatically by transactions.route.js when a POS
 * sale's paymentMethod is 'Credit'. These routes cover reading a customer's
 * ledger/outstanding balance and recording a payment against it.
 */

import express from 'express';
import sharedPool from '../../db/pgPool.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';

const router = express.Router();

router.use(requirePharmacyAuth);

/**
 * GET /api/pharmacy/credit/:customerId
 * Outstanding balance + ledger history for one customer.
 */
router.get('/:customerId', async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;
    const customerId = parseInt(req.params.customerId, 10);

    const customer = await sharedPool.query(
      `SELECT id, name, credit_limit, credit_balance FROM pharmacy_customers WHERE id = $1 AND pharmacy_id = $2`,
      [customerId, pharmacyId]
    );
    if (!customer.rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });

    const ledger = await sharedPool.query(
      `SELECT * FROM pharmacy_credit_ledger WHERE customer_id = $1 AND pharmacy_id = $2 ORDER BY created_at DESC LIMIT 100`,
      [customerId, pharmacyId]
    );

    res.json({ success: true, customer: customer.rows[0], ledger: ledger.rows });
  } catch (error) {
    console.error('Fetch credit ledger error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch credit ledger', error: error.message });
  }
});

/**
 * POST /api/pharmacy/credit/:customerId/payment
 * Record a payment against a customer's outstanding credit balance.
 */
router.post('/:customerId/payment', async (req, res) => {
  const client = await sharedPool.connect();
  try {
    const pharmacyId = req.pharmacyId;
    const customerId = parseInt(req.params.customerId, 10);
    const { amount, notes } = req.body;
    const paymentAmount = Number(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'A positive payment amount is required' });
    }

    await client.query('BEGIN');

    const customerResult = await client.query(
      `SELECT * FROM pharmacy_customers WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE`,
      [customerId, pharmacyId]
    );
    if (!customerResult.rows.length) {
      throw Object.assign(new Error('Customer not found'), { status: 404 });
    }

    const customer = customerResult.rows[0];
    const newBalance = Math.max(0, Number(customer.credit_balance || 0) - paymentAmount);

    await client.query(`UPDATE pharmacy_customers SET credit_balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, customerId]);

    const ledgerEntry = await client.query(
      `INSERT INTO pharmacy_credit_ledger (pharmacy_id, customer_id, amount, entry_type, balance_after, notes)
       VALUES ($1, $2, $3, 'payment', $4, $5) RETURNING *`,
      [pharmacyId, customerId, paymentAmount, newBalance, notes || null]
    );

    await client.query('COMMIT');

    await logPharmacyAudit({
      pharmacyId, actorId: req.pharmacyToken?.id, action: 'credit.payment',
      resourceType: 'credit_ledger', resourceId: ledgerEntry.rows[0].id,
      details: { customerId, amount: paymentAmount, newBalance }, req,
    });

    res.json({ success: true, message: 'Payment recorded', ledgerEntry: ledgerEntry.rows[0], newBalance });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Record payment error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Failed to record payment' });
  } finally {
    client.release();
  }
});

export default router;
