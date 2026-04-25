/**
 * Patient Pharmacy Orders Route
 * Allows logged-in patients to place, view, and cancel pharmacy orders.
 *
 * Endpoints:
 *   GET    /api/pharmacy-orders           – list the current user's orders
 *   POST   /api/pharmacy-orders           – place a new order
 *   GET    /api/pharmacy-orders/:orderId  – get one order
 *   POST   /api/pharmacy-orders/:orderId/cancel – cancel a pending order
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

/* ── helpers ─────────────────────────────────────────────────────────────── */

const VALID_DELIVERY_TYPES = ['home_delivery', 'store_pickup'];
const VALID_STATUSES       = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];

function validateOrderBody(body) {
  const { items, delivery_type } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return 'items must be a non-empty array';
  }

  for (const item of items) {
    if (!item.medicine_name || typeof item.medicine_name !== 'string') {
      return 'each item must have a medicine_name string';
    }
    if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
      return 'each item must have a positive numeric quantity';
    }
  }

  if (!delivery_type || !VALID_DELIVERY_TYPES.includes(delivery_type)) {
    return `delivery_type must be one of: ${VALID_DELIVERY_TYPES.join(', ')}`;
  }

  if (delivery_type === 'home_delivery' && !body.delivery_address) {
    return 'delivery_address is required for home_delivery';
  }

  return null;
}

/* ── GET /api/pharmacy-orders ─────────────────────────────────────────────── */

router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    const params    = [userId];
    let paramIndex  = 2;

    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(req.query.status);
      paramIndex++;
    }

    const [rowsResult, countResult] = await Promise.all([
      sharedPool.query(
        `SELECT * FROM patient_pharmacy_orders ${whereClause}
         ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      sharedPool.query(
        `SELECT COUNT(*) FROM patient_pharmacy_orders ${whereClause}`,
        params
      )
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return res.json({
      success: true,
      data: rowsResult.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] GET list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve orders' });
  }
});

/* ── POST /api/pharmacy-orders ────────────────────────────────────────────── */

router.post('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const error  = validateOrderBody(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const {
      items,
      delivery_type,
      delivery_address   = null,
      delivery_date      = null,
      delivery_time_slot = null,
      prescription_note  = null,
      delivery_charge    = 0,
      discount           = 0,
      customer_notes     = null
    } = req.body;

    // ── Enrich each item with MRP from pharmacy_medicines DB ──────────────
    const enrichedItems = await Promise.all(items.map(async (item) => {
      const name = item.medicine_name || item.name || '';
      const result = await sharedPool.query(
        `SELECT id, name, brand_name, generic_name, strength, form, mrp, unit_price, pack_size, manufacturer
         FROM pharmacy_medicines
         WHERE name ILIKE $1 OR brand_name ILIKE $1 OR generic_name ILIKE $1
         ORDER BY
           CASE WHEN LOWER(name) = LOWER($2) THEN 0
                WHEN LOWER(brand_name) = LOWER($2) THEN 1
                ELSE 2 END,
           mrp ASC LIMIT 1`,
        [`%${name}%`, name]
      );
      const dbMed = result.rows[0] || null;
      const unitMrp = dbMed
        ? parseFloat(dbMed.mrp || dbMed.unit_price || 0)
        : parseFloat(item.unit_price || item.mrp || item.price || 0);
      const qty = parseFloat(item.quantity) || 1;
      return {
        medicine_name:  dbMed?.name || name,
        brand_name:     dbMed?.brand_name || item.brand_name || null,
        generic_name:   dbMed?.generic_name || item.generic_name || null,
        strength:       dbMed?.strength || item.strength || null,
        form:           dbMed?.form || item.form || null,
        manufacturer:   dbMed?.manufacturer || item.manufacturer || null,
        pack_size:      dbMed?.pack_size || item.pack_size || null,
        medicine_id:    dbMed?.id || null,
        quantity:       qty,
        unit_price:     unitMrp,
        line_total:     parseFloat((unitMrp * qty).toFixed(2)),
      };
    }));

    // ── Auto-calculate subtotal from enriched items ───────────────────────
    const subtotal = parseFloat(
      enrichedItems.reduce((sum, i) => sum + i.line_total, 0).toFixed(2)
    );
    const deliveryChargeVal = parseFloat(delivery_charge) || 0;
    const discountVal       = parseFloat(discount) || 0;
    const totalAmount       = parseFloat((subtotal + deliveryChargeVal - discountVal).toFixed(2));

    const result = await sharedPool.query(
      `INSERT INTO patient_pharmacy_orders
         (user_id, items, delivery_type, delivery_address, delivery_date,
          delivery_time_slot, prescription_note, subtotal, delivery_charge,
          discount, total_amount, customer_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        userId,
        JSON.stringify(enrichedItems),
        delivery_type,
        delivery_address ? JSON.stringify(delivery_address) : null,
        delivery_date || null,
        delivery_time_slot || null,
        prescription_note || null,
        subtotal,
        deliveryChargeVal,
        discountVal,
        totalAmount,
        customer_notes || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] POST create error:', err);
    return res.status(500).json({ success: false, message: 'Failed to place order' });
  }
});

/* ── GET /api/pharmacy-orders/:orderId ────────────────────────────────────── */

router.get('/:orderId', authUser, async (req, res) => {
  try {
    const userId  = req.user.id;
    const orderId = parseInt(req.params.orderId, 10);

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const result = await sharedPool.query(
      'SELECT * FROM patient_pharmacy_orders WHERE order_id = $1 AND user_id = $2',
      [orderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[patient-pharmacy-orders] GET single error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve order' });
  }
});

/* ── POST /api/pharmacy-orders/:orderId/cancel ────────────────────────────── */

router.post('/:orderId/cancel', authUser, async (req, res) => {
  try {
    const userId  = req.user.id;
    const orderId = parseInt(req.params.orderId, 10);

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    // Fetch first to check ownership and current status
    const fetchResult = await sharedPool.query(
      'SELECT order_id, status FROM patient_pharmacy_orders WHERE order_id = $1 AND user_id = $2',
      [orderId, userId]
    );

    if (fetchResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = fetchResult.rows[0];
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel an order with status '${order.status}'`
      });
    }

    const result = await sharedPool.query(
      `UPDATE patient_pharmacy_orders
          SET status = 'cancelled', cancelled_at = NOW()
        WHERE order_id = $1 AND user_id = $2
        RETURNING *`,
      [orderId, userId]
    );

    return res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] POST cancel error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

export default router;
