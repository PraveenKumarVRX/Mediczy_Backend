/**
 * Patient Pharmacy Orders Route
 * Allows logged-in patients to place, view, track, and cancel pharmacy orders.
 *
 * Endpoints:
 *   GET    /api/pharmacy-orders                       – list orders (paginated)
 *   POST   /api/pharmacy-orders                       – place a new order (multipart: items + optional prescription file)
 *   GET    /api/pharmacy-orders/:orderId              – get order details
 *   GET    /api/pharmacy-orders/:orderId/tracking     – get status timeline
 *   PUT    /api/pharmacy-orders/:orderId/status       – update status (internal/admin)
 *   POST   /api/pharmacy-orders/:orderId/cancel       – patient cancels a pending order
 */

import express from 'express';
import multer from 'multer';
import { authUser } from '../middleware/auth.middleware.js';
import sharedPool from '../db/pgPool.js';
import { resolveMedicine, priceLine } from '../utils/pharmacy-pricing.js';
import { uploadToMinio } from '../services/minio-upload.service.js';
import {
  COUPON_SCOPES,
  validateOrderCoupon,
  recordCouponUsage
} from '../services/coupon-validation.service.js';

const router = express.Router();

/* ── multer for prescription file upload (memory, 10 MB max) ─────────────── */

const prescriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

const VALID_DELIVERY_TYPES = ['home_delivery', 'store_pickup'];
const VALID_STATUSES       = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];

/** Returns an error string or null */
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

  if (delivery_type === 'home_delivery' && (!body.delivery_address || !/\b[1-9]\d{5}\b/.test(JSON.stringify(body.delivery_address)) || JSON.stringify(body.delivery_address).length < 20)) {
    return 'Enter a full street address, city and valid six-digit pincode';
  }

  return null;
}

/** Build a status event object */
function statusEvent(status, note = '') {
  return { status, timestamp: new Date().toISOString(), note };
}

/** Append a new status event to status_history in DB and return updated row */
async function appendStatusEvent(orderId, status, note = '') {
  const result = await sharedPool.query(
    `UPDATE patient_pharmacy_orders
        SET status          = $1,
            status_history  = status_history || $2::jsonb,
            updated_at      = NOW()
      WHERE order_id = $3
      RETURNING *`,
    [status, JSON.stringify(statusEvent(status, note)), orderId]
  );
  return result.rows[0] || null;
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

/* ── POST /api/pharmacy-orders/validate-coupon ─────────────────────────────── */

router.post('/validate-coupon', authUser, async (req, res) => {
  try {
    const { couponCode, orderAmount } = req.body;

    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const validation = await validateOrderCoupon({
      code: couponCode,
      userId: req.user.id,
      scope: COUPON_SCOPES.PHARMACY_PURCHASE,
      orderAmount: Number(orderAmount || 0)
    });

    return res.json({
      success: true,
      message: 'Coupon is valid for this pharmacy order',
      coupon: {
        code: validation.coupon.code,
        grantType: validation.grantType,
        discount: validation.discount,
        finalPrice: validation.finalPrice,
        minPurchase: Number(validation.coupon.minPurchase || 0)
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/* ── POST /api/pharmacy-orders ────────────────────────────────────────────── */
/* Accepts multipart/form-data with optional `prescription` file field.
   The `items` field must be a JSON string when sending multipart. */

router.post('/', authUser, prescriptionUpload.single('prescription'), async (req, res) => {
  try {
    const userId = req.user.id;

    // items may arrive as a JSON string (multipart) or a parsed array (JSON body)
    let items = req.body.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }

    const bodyForValidation = { ...req.body, items };
    const error = validateOrderBody(bodyForValidation);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const {
      delivery_type,
      delivery_address   = null,
      delivery_date      = null,
      delivery_time_slot = null,
      prescription_note  = null,
      delivery_charge    = 0,
      discount           = 0,
      coupon_code        = null,
      customer_notes     = null,
    } = req.body;

    // ── Upload prescription file to MinIO if provided ─────────────────────
    let prescriptionFileUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToMinio({
          buffer:       req.file.buffer,
          originalName: req.file.originalname,
          mimeType:     req.file.mimetype,
          keyPrefix:    `uploads/prescriptions/${userId}`,
        });
        prescriptionFileUrl = uploadResult.url;
      } catch (uploadErr) {
        console.error('[pharmacy-orders] prescription upload failed:', uploadErr.message);
        // Non-fatal — order proceeds without prescription URL
      }
    }

    // ── Enrich items with MRP from pharmacy_medicines DB ──────────────────
    // Resolution is exact: numeric id, CIMS id, then a whole name. It used to be
    // `name ILIKE '%<name>%' ... ORDER BY mrp ASC LIMIT 1` — the cheapest substring
    // match — so "Augmentin 625" resolved to "CipAugmentin 625mg" at 110.83, a
    // different manufacturer's product. The `schedule` below came off that same
    // wrong row, which meant the prescription gate judged a drug the customer had
    // never ordered. An item that cannot be resolved is refused, not re-priced.
    const unresolvedItems = [];
    const enrichedItems = [];
    for (const item of items) {
      const name = item.medicine_name || item.name || '';
      const dbMed = await resolveMedicine(sharedPool, {
        medicineId: item.medicine_id ?? item.medicineId ?? item.id,
        name,
      });
      if (!dbMed) { unresolvedItems.push(name || String(item.medicine_id ?? '')); continue; }
      const line = priceLine(dbMed, item.quantity, item);
      if (line.error) { unresolvedItems.push(dbMed.name); continue; }
      enrichedItems.push({
        medicine_name: line.medicineName,
        brand_name:    line.brandName,
        generic_name:  line.genericName,
        strength:      line.strength,
        form:          line.form,
        manufacturer:  line.manufacturer,
        pack_size:     line.packSize,
        medicine_id:   line.medicineId,
        // Persisted on the line so a dispensing pharmacist sees the schedule without re-querying,
        // and so an audit can tell what the system believed at the time of the order.
        schedule:      line.schedule,
        quantity:      line.quantity,
        unit:          line.unit,
        units_per_pack: line.unitsPerPack,
        sold_by_pack:  line.soldByPack,
        pack_price:    line.packPrice,
        unit_price:    line.unitPrice,
        line_total:    line.lineTotal,
      });
    }

    if (unresolvedItems.length) {
      return res.status(400).json({
        success: false,
        code: 'MEDICINE_NOT_IN_CATALOGUE',
        message: `We could not price these items against the current catalogue: ${unresolvedItems.join(', ')}. Please remove and re-add them.`,
        unresolved: unresolvedItems,
      });
    }

    // ── Prescription gate for scheduled drugs ─────────────────────────────
    // Schedule H / H1 / X cannot lawfully be supplied without a prescription (Drugs and Cosmetics
    // Rules). Until 2026-10-04 nothing here read pharmacy_medicines.schedule at all: the column
    // was accurate (Clonazepam -> X, Rosuvastatin -> H) and simply never consulted, so 29
    // prescription-only orders were accepted with no prescription on file, including one
    // Schedule X benzodiazepine. The prescription file was documented as "optional" and an upload
    // failure was explicitly non-fatal.
    //
    // Policy (decided 2026-10-04): require a stored prescription, else reject. The order must not
    // enter the fulfilment queue at all without one.
    const RX_REQUIRED_SCHEDULES = new Set(['H', 'H1', 'X']);
    const rxItems = enrichedItems.filter(
      (i) => i.schedule && RX_REQUIRED_SCHEDULES.has(String(i.schedule).toUpperCase().trim()),
    );
    if (rxItems.length > 0 && !prescriptionFileUrl) {
      const named = rxItems
        .map((i) => `${i.brand_name || i.medicine_name} (Schedule ${String(i.schedule).toUpperCase()})`)
        .join(', ');
      // Distinguish "none attached" from "attached but we failed to store it" — the second is our
      // fault and the customer should be told to retry rather than told their order is invalid.
      const uploadAttemptedButFailed = Boolean(req.file);
      console.warn(`[pharmacy-orders] rejected: prescription required for ${named} (user ${userId}, upload_attempted=${uploadAttemptedButFailed})`);
      return res.status(400).json({
        success: false,
        code: uploadAttemptedButFailed ? 'PRESCRIPTION_UPLOAD_FAILED' : 'PRESCRIPTION_REQUIRED',
        message: uploadAttemptedButFailed
          ? 'We could not store your prescription file, so the order was not placed. Please try uploading it again.'
          : `A doctor's prescription is required for: ${named}. Please attach a prescription and place the order again.`,
        requiresPrescription: rxItems.map((i) => ({
          medicine_name: i.brand_name || i.medicine_name,
          schedule: String(i.schedule).toUpperCase(),
        })),
      });
    }

    // ── Calculate totals ───────────────────────────────────────────────────
    const subtotal          = parseFloat(enrichedItems.reduce((s, i) => s + i.line_total, 0).toFixed(2));
    const deliveryChargeVal = parseFloat(delivery_charge) || 0;

    let couponValidation = null;
    let discountVal = 0;
    let appliedCouponCode = null;

    if (coupon_code) {
      couponValidation = await validateOrderCoupon({
        code: coupon_code,
        userId,
        scope: COUPON_SCOPES.PHARMACY_PURCHASE,
        orderAmount: subtotal
      });
      discountVal = couponValidation.discount;
      appliedCouponCode = couponValidation.coupon.code;
    } else {
      discountVal = parseFloat(discount) || 0;
    }

    const totalAmount       = parseFloat(Math.max(0, subtotal + deliveryChargeVal - discountVal).toFixed(2));

    const initialHistory = JSON.stringify([statusEvent('pending', 'Order placed')]);

    const result = await sharedPool.query(
      `INSERT INTO patient_pharmacy_orders
         (user_id, items, delivery_type, delivery_address, delivery_date,
          delivery_time_slot, prescription_note, prescription_file_url,
          subtotal, delivery_charge, discount, total_amount,
          customer_notes, status_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        userId,
        JSON.stringify(enrichedItems),
        delivery_type,
        delivery_address ? JSON.stringify(delivery_address) : null,
        delivery_date      || null,
        delivery_time_slot || null,
        prescription_note  || null,
        prescriptionFileUrl,
        subtotal,
        deliveryChargeVal,
        discountVal,
        totalAmount,
        appliedCouponCode
          ? [customer_notes, `Coupon: ${appliedCouponCode}`].filter(Boolean).join(' | ')
          : (customer_notes || null),
        initialHistory,
      ]
    );

    if (couponValidation?.coupon) {
      await recordCouponUsage({
        coupon: couponValidation.coupon,
        userId,
        discountAmount: discountVal,
        amountPaid: totalAmount,
        hcPurchased: 0,
        hcBonus: 0,
        paymentId: `PHARMACY_${result.rows[0].order_id}`
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] POST create error:', err);
    if (err.message?.includes('coupon') || err.message?.includes('Coupon') || err.message?.includes('Minimum order')) {
      return res.status(400).json({ success: false, message: err.message });
    }
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

/* ── GET /api/pharmacy-orders/:orderId/tracking ───────────────────────────── */
/* Returns the full status timeline, estimated delivery, and tracking number. */

router.get('/:orderId/tracking', authUser, async (req, res) => {
  try {
    const userId  = req.user.id;
    const orderId = parseInt(req.params.orderId, 10);

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const result = await sharedPool.query(
      `SELECT order_id, status, status_history, tracking_number,
              estimated_delivery, delivery_type, delivery_address,
              created_at, updated_at, delivered_at, cancelled_at
         FROM patient_pharmacy_orders
        WHERE order_id = $1 AND user_id = $2`,
      [orderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = result.rows[0];

    // ── Build canonical timeline, ensuring all terminal statuses are present ─
    const history  = Array.isArray(order.status_history) ? order.status_history : [];
    const allSteps = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered'];

    // For cancelled orders, include up-to-cancel + cancelled step
    const isCancelled = order.status === 'cancelled';
    const steps = isCancelled
      ? [...allSteps.slice(0, allSteps.indexOf(history.find(h => !['pending','confirmed'].includes(h.status))?.status || 'confirmed') + 1), 'cancelled']
      : allSteps;

    const timeline = steps.map(step => {
      const event = history.find(h => h.status === step);
      const isReached = history.some(h => h.status === step) ||
        (VALID_STATUSES.indexOf(order.status) >= VALID_STATUSES.indexOf(step) && !isCancelled);
      return {
        status:    step,
        label:     stepLabel(step),
        reached:   !!event || isReached,
        active:    order.status === step,
        timestamp: event?.timestamp || null,
        note:      event?.note      || null,
      };
    });

    return res.json({
      success: true,
      data: {
        order_id:          order.order_id,
        current_status:    order.status,
        tracking_number:   order.tracking_number || null,
        estimated_delivery:order.estimated_delivery || null,
        delivered_at:      order.delivered_at || null,
        cancelled_at:      order.cancelled_at || null,
        delivery_type:     order.delivery_type,
        delivery_address:  order.delivery_address,
        timeline,
      },
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] GET tracking error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve tracking info' });
  }
});

function stepLabel(step) {
  const labels = {
    pending:          'Order Placed',
    confirmed:        'Order Confirmed',
    processing:       'Being Prepared',
    out_for_delivery: 'Out for Delivery',
    delivered:        'Delivered',
    cancelled:        'Cancelled',
  };
  return labels[step] || step;
}

/* ── PUT /api/pharmacy-orders/:orderId/status ─────────────────────────────── */
/* Internal/admin use: update order status and optionally set tracking info.
   Patients cannot call this — it requires authUser + role check. */

router.put('/:orderId/status', authUser, async (req, res) => {
  try {
    // Only allow pharmacy staff / admin
    const role = req.user.role || req.user.userType;
    if (!['admin', 'super_admin', 'pharmacy', 'pharmacy_staff'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const orderId = parseInt(req.params.orderId, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const { status, note = '', tracking_number, estimated_delivery } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Fetch current state
    const fetchResult = await sharedPool.query(
      'SELECT order_id, status FROM patient_pharmacy_orders WHERE order_id = $1',
      [orderId]
    );
    if (fetchResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const current = fetchResult.rows[0];
    if (current.status === 'cancelled') {
      return res.status(409).json({ success: false, message: 'Cannot update a cancelled order' });
    }

    // Build extra update fields
    const extraUpdates = [];
    const extraParams  = [];
    let paramIdx = 3;

    if (tracking_number) {
      extraUpdates.push(`tracking_number = $${paramIdx++}`);
      extraParams.push(tracking_number);
    }
    if (estimated_delivery) {
      extraUpdates.push(`estimated_delivery = $${paramIdx++}`);
      extraParams.push(estimated_delivery);
    }
    if (status === 'delivered') {
      extraUpdates.push(`delivered_at = NOW()`);
    }
    if (status === 'cancelled') {
      extraUpdates.push(`cancelled_at = NOW()`);
    }

    const extraSql = extraUpdates.length ? ', ' + extraUpdates.join(', ') : '';

    const result = await sharedPool.query(
      `UPDATE patient_pharmacy_orders
          SET status         = $1,
              status_history = status_history || $2::jsonb,
              updated_at     = NOW()
              ${extraSql}
        WHERE order_id = $${paramIdx}
        RETURNING *`,
      [status, JSON.stringify(statusEvent(status, note)), ...extraParams, orderId]
    );

    return res.json({
      success: true,
      message: `Order status updated to '${status}'`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] PUT status error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update order status' });
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
        message: `Cannot cancel an order with status '${order.status}'`,
      });
    }

    const reason = req.body.reason || 'Cancelled by patient';
    const result = await sharedPool.query(
      `UPDATE patient_pharmacy_orders
          SET status         = 'cancelled',
              cancelled_at   = NOW(),
              status_history = status_history || $1::jsonb,
              updated_at     = NOW()
        WHERE order_id = $2 AND user_id = $3
        RETURNING *`,
      [JSON.stringify(statusEvent('cancelled', reason)), orderId, userId]
    );

    return res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[patient-pharmacy-orders] POST cancel error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

export default router;
