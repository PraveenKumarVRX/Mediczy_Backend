/**
 * Pharmacy Invoices Routes
 */

import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';

const router = express.Router();

router.use(requirePharmacyAuth);

/**
 * POST /api/pharmacy/invoices
 * Create new invoice
 */
router.post('/', async (req, res) => {
  try {
    const {
      transactionId,
      customerId,
      items, // [{medicineId, quantity, price}]
      totalAmount,
      discountAmount = 0,
      paymentMethod,
      notes
    } = req.body;
    const pharmacyId = req.pharmacyId;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items are required'
      });
    }

    // GST split: look up each line's HSN/rate from the catalog (snapshot it onto the
    // invoice item so a later catalog-rate change doesn't rewrite history), default
    // intra-state CGST+SGST split (the common case for a local walk-in sale).
    const medicineIds = items.map((item) => item.medicineId);
    const gstRows = await db.query(
      `SELECT id, hsn_code, COALESCE(gst_rate, 12.00) AS gst_rate FROM pharmacy_medicines WHERE id = ANY($1::int[])`,
      [medicineIds]
    );
    const gstByMedicine = new Map(gstRows.rows.map((r) => [r.id, r]));

    let cgstAmount = 0;
    let sgstAmount = 0;
    const lineItems = items.map((item) => {
      const gstInfo = gstByMedicine.get(item.medicineId) || { hsn_code: null, gst_rate: 12.00 };
      const subtotal = item.quantity * item.price;
      const lineTax = subtotal * (Number(gstInfo.gst_rate) / 100);
      cgstAmount += lineTax / 2;
      sgstAmount += lineTax / 2;
      return { ...item, subtotal, hsnCode: gstInfo.hsn_code, gstRate: gstInfo.gst_rate };
    });
    cgstAmount = Math.round(cgstAmount * 100) / 100;
    sgstAmount = Math.round(sgstAmount * 100) / 100;
    const taxAmount = cgstAmount + sgstAmount;

    const query = `
      INSERT INTO pharmacy_invoices
      (pharmacy_id, transaction_id, customer_id, total_amount, tax_amount, cgst_amount, sgst_amount, igst_amount, discount_amount, payment_method, notes, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 'issued', NOW())
      RETURNING *;
    `;

    const result = await db.query(query, [
      pharmacyId,
      transactionId,
      customerId,
      totalAmount,
      taxAmount,
      cgstAmount,
      sgstAmount,
      discountAmount,
      paymentMethod,
      notes
    ]);
    const invoice = result.rows[0];

    // Insert invoice items (with their GST snapshot)
    for (const item of lineItems) {
      const itemQuery = `
        INSERT INTO pharmacy_invoice_items
        (invoice_id, medicine_id, quantity, price, subtotal, hsn_code, gst_rate)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      await db.query(itemQuery, [
        invoice.id,
        item.medicineId,
        item.quantity,
        item.price,
        item.subtotal,
        item.hsnCode,
        item.gstRate
      ]);
    }

    res.json({
      success: true,
      message: 'Invoice created successfully',
      invoice
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/invoices/:invoiceId
 * Get invoice details
 */
router.get('/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const pharmacyId = req.pharmacyId;

    const invoiceQuery = `
      SELECT * FROM pharmacy_invoices WHERE id = $1 AND pharmacy_id = $2;
    `;

    const invoiceResult = await db.query(invoiceQuery, [invoiceId, pharmacyId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsQuery = `
      SELECT ii.*, m.name as medicine_name
      FROM pharmacy_invoice_items ii
      JOIN pharmacy_medicines m ON ii.medicine_id = m.id
      WHERE ii.invoice_id = $1;
    `;

    const itemsResult = await db.query(itemsQuery, [invoiceId]);

    res.json({
      success: true,
      invoice: {
        ...invoice,
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Fetch invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/invoices
 * List all invoices
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const pharmacyId = req.pharmacyId;

    const query = `
      SELECT i.*, c.name as customer_name
      FROM pharmacy_invoices i
      LEFT JOIN pharmacy_customers c ON i.customer_id = c.id
      WHERE i.pharmacy_id = $1
      ORDER BY i.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await db.query(query, [pharmacyId, limit, offset]);

    res.json({
      success: true,
      invoices: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Fetch invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

export default router;
