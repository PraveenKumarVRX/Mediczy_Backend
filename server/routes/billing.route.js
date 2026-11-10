import { completeLabCheckout } from '../services/patient-lab-checkout.service.js';
import express from 'express';
import { authUser, authDoctor } from '../middleware/auth.middleware.js';
import legacyBillingDeprecation from '../middleware/legacy-billing-deprecation.middleware.js';
import ledgerBridge from '../services/billing-ledger-bridge.service.js';
import { Order, Invoice, Payment, Transaction, Refund } from '../models/billing.model.intelligent.js';
import paymentGateway from '../services/payment-gateway.service.js';
import invoiceService from '../services/invoice.service.js';
import purchaseNotification from '../services/purchase-notification.service.js';
import { User } from '../models/user.model.intelligent.js';
import doctorModel from '../models/postgres/doctor.model.postgres.js';
import { Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { Appointment } from '../models/index.js';
import sharedPool from '../db/pgPool.js';
import { resolveMedicine, priceLine, requiresPrescription } from '../utils/pharmacy-pricing.js';
import multer from 'multer';
import { uploadToMinio } from '../services/minio-upload.service.js';

// A prescription may accompany a medicine order. Memory storage, 10 MB, the
// same accepted types as the companion pharmacy route.
const prescriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

const router = express.Router();

// Normalize an order address (string, or {address|line1|city|state|pincode} object) to a display
// string, or null. Used to surface a consistent deliveryAddress across order types.
function normalizeOrderAddress(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    if (typeof value.address === 'string' && value.address.trim()) return value.address.trim();
    const parts = [value.line1 || value.street, value.area || value.locality, value.city, value.state, value.pincode || value.zip || value.zipCode]
      .map((p) => (p == null ? '' : String(p).trim())).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

router.use(legacyBillingDeprecation);

function buildOrderItemLabel(order) {
  const meta = order.metadata || {};
  if (order.orderType === 'lab_test' && meta.testName) {
    return `${meta.testName} — Lab Test${meta.isHomeCollection ? ' (Home Collection)' : ''}`;
  }
  if (order.orderType === 'medicine' || order.orderType === 'pharmacy') {
    return 'Pharmacy Order';
  }
  if (order.orderType) {
    return `${String(order.orderType).replace(/_/g, ' ')} — Order #${order.orderNumber}`;
  }
  return `Order #${order.orderNumber}`;
}

// ============================================================================
// UNIFIED LEDGER (canonical — hospital RCM)
// ============================================================================

router.get('/ledger/unified/:patientId', authUser, async (req, res) => {
  try {
    const hospitalId = ledgerBridge.resolveHospitalIdFromUser(req.user);
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital context required. Use /api/hospital/billing for hospital staff.',
        migrateTo: '/api/hospital/billing',
      });
    }
    const data = await ledgerBridge.getUnifiedPatientLedger(
      hospitalId,
      Number(req.params.patientId),
      req.query.admissionId ? Number(req.query.admissionId) : null
    );
    res.json({ success: true, data, deprecated: true, canonical: '/api/hospital/billing' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================================
// ORDER MANAGEMENT (legacy — mirrored to hospital ledger when hospital context exists)
// ============================================================================

/**
 * POST /api/billing/orders/create
 * Create new order
 */
router.post('/orders/create', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      orderType,
      itemId,
      subtotal,
      tax,
      discount,
      currency,
      billingAddress,
      shippingAddress,
      metadata,
      notes
    } = req.body;

    // Validate required fields
    if (!orderType || !subtotal) {
      return res.status(400).json({
        success: false,
        message: 'Order type and subtotal are required'
      });
    }

    // Calculate total
    const total = paymentGateway.calculateTotal(
      parseFloat(subtotal),
      parseFloat(tax || 0),
      parseFloat(discount || 0)
    );

    // Generate order number
    const orderNumber = paymentGateway.generateOrderReceipt('ORD');

    // Create order
    const order = await Order.create({
      orderNumber,
      userId,
      orderType,
      itemId,
      status: 'pending',
      subtotal: parseFloat(subtotal),
      tax: parseFloat(tax || 0),
      discount: parseFloat(discount || 0),
      total,
      currency: currency || 'INR',
      billingAddress,
      shippingAddress,
      metadata,
      notes
    });

    const hospitalId = ledgerBridge.resolveHospitalIdFromUser(req.user);
    if (hospitalId) {
      await ledgerBridge.mirrorLegacyOrderToHospitalCharge(order, hospitalId, userId).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order },
      ledger: hospitalId ? { mirrored: true, canonical: '/api/hospital/billing' } : { mirrored: false },
    });

  } catch (error) {
    console.error('Create order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

/**
 * POST /api/billing/orders
 * Place a new medicine (pharmacy) order from patient dashboard.
 * Accepts: { orderType, items[], deliveryAddress, prescriptionRequired }
 */
router.post(
  '/orders',
  authUser,
  (req, res, next) => prescriptionUpload.single('prescription')(req, res, (error) => {
    if (!error) return next();
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE' ? 'The prescription must be 10 MB or smaller' : error.message,
    });
  }),
  async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderType = 'medicine', deliveryAddress, notes } = req.body;

    // A multipart submission (one carrying a prescription file) delivers every
    // field as a string, so `items` arrives as JSON text and a boolean arrives as
    // "true"/"false" — on which `!!value` is true either way.
    let items = req.body?.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = null; }
    }
    const rawRxRequired = req.body?.prescriptionRequired;
    const prescriptionRequired = typeof rawRxRequired === 'string'
      ? rawRxRequired.toLowerCase() === 'true'
      : Boolean(rawRxRequired);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items must be a non-empty array' });
    }
    if (!deliveryAddress || String(deliveryAddress).trim().length < 15 || !/\b[1-9]\d{5}\b/.test(String(deliveryAddress)) || !/[a-zA-Z]{3}/.test(String(deliveryAddress))) {
      return res.status(400).json({ success: false, message: 'Enter a full street address, city and valid six-digit pincode.' });
    }

    // Price every line from the catalogue. The browser's `price` is never billed:
    // the Pharmacy page derives it by dividing the pack price by a pack count it
    // parses itself, which billed a 33.23 strip at 3.32, and a client-supplied
    // price is also a tampering hole (nothing stopped it being 0).
    const priced = [];
    const unresolved = [];
    for (const item of items) {
      const medicine = await resolveMedicine(sharedPool, {
        medicineId: item.medicineId ?? item.medicine_id ?? item.id,
        name: item.name || item.medicine_name,
      });
      if (!medicine) {
        unresolved.push(item.name || item.medicine_name || String(item.medicineId ?? ''));
        continue;
      }
      const line = priceLine(medicine, item.quantity, item);
      if (line.error) {
        unresolved.push(medicine.name);
        continue;
      }
      priced.push(line);
    }

    if (unresolved.length) {
      // Refusing beats quietly substituting a different medicine, which is what a
      // cheapest-substring-match lookup used to do ("Augmentin 625" resolved to
      // "CipAugmentin 625mg" at a lower price, and the Schedule came off that row).
      return res.status(400).json({
        success: false,
        code: 'MEDICINE_NOT_IN_CATALOGUE',
        message: `We could not price these items against the current catalogue: ${unresolved.join(', ')}. Please remove and re-add them.`,
        unresolved,
      });
    }

    // Schedule H / H1 / X cannot lawfully be supplied without a prescription.
    // This path had no gate at all while the companion pharmacy route did, so
    // seven Schedule H lines were accepted here with none on file.
    let prescriptionFileUrl = null;
    if (req.file) {
      try {
        const uploaded = await uploadToMinio({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          keyPrefix: `uploads/prescriptions/${userId}`,
        });
        prescriptionFileUrl = uploaded.url;
      } catch (uploadErr) {
        console.error('[billing/orders] prescription upload failed:', uploadErr.message);
      }
    }

    const rxLines = priced.filter((line) => requiresPrescription(line.schedule));
    if (rxLines.length && !prescriptionFileUrl) {
      const named = rxLines
        .map((l) => `${l.brandName || l.medicineName} (Schedule ${String(l.schedule).toUpperCase()})`)
        .join(', ');
      // A failed upload is our fault, so say so rather than call the order invalid.
      const uploadAttemptedButFailed = Boolean(req.file);
      console.warn(`[billing/orders] rejected: prescription required for ${named} (user ${userId}, upload_attempted=${uploadAttemptedButFailed})`);
      return res.status(400).json({
        success: false,
        code: uploadAttemptedButFailed ? 'PRESCRIPTION_UPLOAD_FAILED' : 'PRESCRIPTION_REQUIRED',
        message: uploadAttemptedButFailed
          ? 'We could not store your prescription file, so the order was not placed. Please try uploading it again.'
          : `A doctor's prescription is required for: ${named}. Please attach a prescription and place the order again.`,
        requiresPrescription: rxLines.map((l) => ({
          medicine_name: l.brandName || l.medicineName,
          schedule: String(l.schedule).toUpperCase(),
        })),
      });
    }

    const subtotal = priced.reduce((sum, line) => sum + line.lineTotal, 0);

    const orderNumber = paymentGateway.generateOrderReceipt('ORD');

    const order = await Order.create({
      orderNumber,
      userId,
      orderType: 'medicine',
      status: 'pending',
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: 0,
      discount: 0,
      total: parseFloat(subtotal.toFixed(2)),
      currency: 'INR',
      shippingAddress: { address: String(deliveryAddress).trim() },
      metadata: {
        // The catalogue-priced lines, so order history and an audit show what was
        // actually billed rather than what the browser proposed.
        items: priced,
        clientSubmittedItems: items,
        deliveryAddress: String(deliveryAddress).trim(),
        prescriptionRequired: !!prescriptionRequired,
        prescriptionFileUrl,
      },
      notes: notes || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { order: { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total } },
    });
  } catch (error) {
    console.error('Place pharmacy order error:', error);
    return res.status(500).json({ success: false, message: 'Failed to place order', error: error.message });
  }
});

/**
 * GET /api/billing/orders
 * Get user's order history
 */
router.get('/orders', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, orderType, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (status) where.status = status;
    if (orderType) where.orderType = orderType;

    const offset = (page - 1) * limit;

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        {
          model: Payment,
          as: 'payments',
          attributes: ['id', 'paymentId', 'amount', 'status', 'gateway', 'method', 'createdAt']
        },
        {
          model: Invoice,
          as: 'invoice',
          attributes: ['id', 'invoiceNumber', 'status', 'pdfUrl', 'total']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Normalize provider + delivery address across order types. The underlying data exists but under
    // inconsistent keys (metadata.labName / pharmacyName / provider, shippingAddress.address /
    // metadata.deliveryAddress / metadata.address), so the raw rows showed "Provider not specified"
    // / "Address not provided". Surface a consistent shape the client can render.
    const enriched = orders.map((o) => {
      const plain = typeof o.toJSON === 'function' ? o.toJSON() : o;
      const m = plain.metadata || {};
      return {
        ...plain,
        provider: m.labName || m.pharmacyName || m.provider || m.vendorName || m.hospitalName || null,
        deliveryAddress: normalizeOrderAddress(plain.shippingAddress) || normalizeOrderAddress(m.deliveryAddress) || normalizeOrderAddress(m.address) || null,
      };
    });

    return res.json({
      success: true,
      data: {
        orders: enriched,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/orders/:orderId
 * Get order details
 */
router.get('/orders/:orderId', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const order = await Order.findOne({
      where: { id: orderId, userId },
      include: [
        {
          model: Payment,
          as: 'payments'
        },
        {
          model: Invoice,
          as: 'invoice'
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    return res.json({
      success: true,
      data: { order }
    });

  } catch (error) {
    console.error('Get order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/orders/:orderId/detailed
 * Get detailed order history with full item breakdown, payment history, and tracking
 */
router.get('/orders/:orderId/detailed', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const order = await Order.findOne({
      where: { id: orderId, userId },
      include: [
        {
          model: Payment,
          as: 'payments',
          order: [['createdAt', 'DESC']]
        },
        {
          model: Invoice,
          as: 'invoice'
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Parse items from metadata
    const items = order.metadata?.items || [];
    
    // Build detailed response
    const detailedOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      
      // Financial details
      subtotal: parseFloat(order.subtotal),
      tax: parseFloat(order.tax || 0),
      discount: parseFloat(order.discount || 0),
      total: parseFloat(order.total),
      currency: order.currency,
      
      // Items breakdown
      items: items,
      itemCount: items.length,
      
      // Provider + address (normalized across order types so lab/pharmacy orders don't render
      // "Provider not specified" / "Address not provided" when the data is under varying keys).
      provider: order.metadata?.labName || order.metadata?.pharmacyName || order.metadata?.provider || order.metadata?.vendorName || order.metadata?.hospitalName || null,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
      deliveryAddress: normalizeOrderAddress(order.shippingAddress) || normalizeOrderAddress(order.metadata?.deliveryAddress) || normalizeOrderAddress(order.metadata?.address) || null,
      
      // Delivery tracking
      estimatedDelivery: order.metadata?.estimatedDelivery,
      actualDelivery: order.metadata?.actualDelivery,
      trackingNumber: order.metadata?.trackingNumber,
      trackingUrl: order.metadata?.trackingUrl,
      
      // Prescription info (for pharmacy orders)
      prescriptionRequired: order.metadata?.prescriptionRequired || false,
      prescriptionUrl: order.metadata?.prescriptionUrl,
      
      // Payment information
      payments: order.payments?.map(p => ({
        id: p.id,
        paymentId: p.paymentId,
        amount: parseFloat(p.amount),
        status: p.status,
        method: p.method,
        gateway: p.gateway,
        createdAt: p.createdAt
      })) || [],
      
      // Invoice
      invoice: order.invoice ? {
        id: order.invoice.id,
        invoiceNumber: order.invoice.invoiceNumber,
        status: order.invoice.status,
        pdfUrl: order.invoice.pdfUrl,
        total: parseFloat(order.invoice.total)
      } : null,
      
      // Notes
      notes: order.notes,
      
      // Status timeline
      statusTimeline: order.metadata?.statusTimeline || [
        { status: 'pending', timestamp: order.createdAt }
      ]
    };

    return res.json({
      success: true,
      data: { order: detailedOrder }
    });

  } catch (error) {
    console.error('Get detailed order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch detailed order',
      error: error.message
    });
  }
});

/**
 * POST /api/billing/orders/:orderId/reorder
 * Reorder items from a previous order
 */
router.post('/orders/:orderId/reorder', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { 
      deliveryAddress,
      notes,
      selectedItems // Optional: array of item indices to reorder (if not provided, reorder all)
    } = req.body;

    // Find original order
    const originalOrder = await Order.findOne({
      where: { id: orderId, userId }
    });

    if (!originalOrder) {
      return res.status(404).json({
        success: false,
        message: 'Original order not found'
      });
    }

    // Get items from original order
    const originalItems = originalOrder.metadata?.items || [];
    
    if (originalItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items found in original order to reorder'
      });
    }

    // Filter items if specific ones are selected
    let itemsToReorder = originalItems;
    if (selectedItems && Array.isArray(selectedItems) && selectedItems.length > 0) {
      itemsToReorder = selectedItems
        .filter(idx => idx >= 0 && idx < originalItems.length)
        .map(idx => originalItems[idx]);
    }

    if (itemsToReorder.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items selected for reorder'
      });
    }

    // Calculate totals
    const subtotal = itemsToReorder.reduce((sum, item) => {
      return sum + (parseFloat(item.price) * (item.quantity || 1));
    }, 0);
    
    const tax = subtotal * 0.05; // 5% tax
    const total = paymentGateway.calculateTotal(subtotal, tax, 0);

    // Generate new order number
    const orderNumber = paymentGateway.generateOrderReceipt('REORD');

    // Create new order
    const newOrder = await Order.create({
      orderNumber,
      userId,
      orderType: originalOrder.orderType,
      itemId: originalOrder.itemId,
      status: 'pending',
      subtotal: subtotal,
      tax: tax,
      discount: 0,
      total: total,
      currency: originalOrder.currency || 'INR',
      billingAddress: originalOrder.billingAddress,
      shippingAddress: deliveryAddress || originalOrder.shippingAddress,
      notes: notes || `Reorder from order #${originalOrder.orderNumber}`,
      metadata: {
        items: itemsToReorder,
        deliveryAddress: deliveryAddress || originalOrder.metadata?.deliveryAddress,
        prescriptionRequired: originalOrder.metadata?.prescriptionRequired,
        prescriptionUrl: originalOrder.metadata?.prescriptionUrl,
        originalOrderId: originalOrder.id,
        originalOrderNumber: originalOrder.orderNumber,
        isReorder: true,
        statusTimeline: [
          { status: 'pending', timestamp: new Date().toISOString() }
        ]
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Reorder created successfully',
      data: {
        order: {
          id: newOrder.id,
          orderNumber: newOrder.orderNumber,
          status: newOrder.status,
          items: itemsToReorder,
          subtotal: parseFloat(newOrder.subtotal),
          tax: parseFloat(newOrder.tax),
          total: parseFloat(newOrder.total),
          currency: newOrder.currency,
          deliveryAddress: newOrder.metadata?.deliveryAddress,
          originalOrderId: originalOrder.id,
          createdAt: newOrder.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Reorder error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create reorder',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/orders/pharmacy/medicine-search
 * Patient-accessible medicine search using CIMS database
 */
router.get('/orders/pharmacy/medicine-search', authUser, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, data: [], message: 'Enter at least 2 characters' });
    }

    const parsedLimit = parseInt(limit) || 20;
    const query = q.toLowerCase().trim();
    let results = [];

    // 1) Try CIMS service (2000+ branded Indian medicines)
    try {
      const cimsService = (await import('../services/cims-medicine.service.js')).default;
      if (cimsService.loaded) {
        const cimsResults = cimsService.searchByName(q, { page: 1, limit: parsedLimit + 10 });
        if (cimsResults?.data?.length > 0) {
          results = cimsResults.data.map(m => ({
            id: m.id || m.brandName,
            name: m.brandName || m.name,
            genericName: m.genericName || '',
            category: m.category || '',
            manufacturer: m.manufacturer || '',
            strength: m.strength || '',
            form: m.form || 'Tablet',
            price: m.mrp || 0,
            packSize: m.packSize || '',
            schedule: m.schedule || 'OTC',
            prescriptionRequired: m.schedule && m.schedule !== 'OTC'
          }));
        }
      }
    } catch (cimsErr) {
      console.warn('[medicine-search] CIMS error:', cimsErr.message);
    }

    // 2) Also search MASTER_MEDICINES (68 common meds) to fill gaps
    try {
      const { MASTER_MEDICINES } = await import('./pharmacy/inventory.routes.js');
      if (MASTER_MEDICINES?.length > 0) {
        const existingIds = new Set(results.map(r => r.name.toLowerCase()));
        const masterMatches = MASTER_MEDICINES.filter(m =>
          (m.name?.toLowerCase().includes(query) ||
           m.genericName?.toLowerCase().includes(query) ||
           m.category?.toLowerCase().includes(query)) &&
          !existingIds.has(m.name?.toLowerCase())
        );
        for (const m of masterMatches) {
          results.push({
            id: `INV-${m.id || m.name}`,
            name: m.name,
            genericName: m.genericName || '',
            category: m.category || '',
            manufacturer: m.manufacturer || '',
            strength: m.strength || '',
            form: m.form || m.unit || 'Tablet',
            price: m.mrp || m.price || 0,
            packSize: m.packSize || `per ${m.unit || 'unit'}`,
            schedule: m.requiresPrescription ? 'H' : 'OTC',
            prescriptionRequired: !!m.requiresPrescription
          });
        }
      }
    } catch {
      // inventory not available as named export, skip
    }

    // 3) Deduplicate by name (case-insensitive) and limit
    const seen = new Set();
    results = results.filter(r => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, parsedLimit);

    return res.json({ success: true, query: q, count: results.length, data: results });
  } catch (error) {
    console.error('Medicine search error:', error);
    return res.status(500).json({ success: false, message: 'Medicine search failed', error: error.message });
  }
});

/**
 * GET /api/billing/orders/pharmacy/history
 * Get pharmacy-specific order history with detailed medicine info
 */
router.get('/orders/pharmacy/history', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;

    const where = { 
      userId,
      orderType: 'medicine'
    };
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        {
          model: Payment,
          as: 'payments',
          attributes: ['id', 'paymentId', 'amount', 'status', 'method', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Transform orders for pharmacy-specific view
    const pharmacyOrders = orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      status: order.status,
      items: order.metadata?.items || [],
      totalAmount: parseFloat(order.total),
      deliveryAddress: order.metadata?.deliveryAddress || order.shippingAddress,
      estimatedDelivery: order.metadata?.estimatedDelivery,
      prescriptionRequired: order.metadata?.prescriptionRequired || false,
      prescriptionUrl: order.metadata?.prescriptionUrl,
      trackingNumber: order.metadata?.trackingNumber,
      payments: order.payments,
      canReorder: ['completed', 'delivered'].includes(order.status)
    }));

    // Calculate stats
    const stats = {
      totalOrders: count,
      activeOrders: orders.filter(o => ['pending', 'confirmed', 'processing', 'out_for_delivery'].includes(o.status)).length,
      deliveredOrders: orders.filter(o => o.status === 'delivered' || o.status === 'completed').length,
      totalSpent: Number(await Payment.sum('amount', { where: { userId, status: 'success' }, include: [{ model: Order, as: 'order', attributes: [], where: { orderType: 'medicine' } }] })) || 0
    };

    return res.json({
      success: true,
      data: {
        orders: pharmacyOrders,
        stats,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get pharmacy order history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pharmacy order history',
      error: error.message
    });
  }
});

// ============================================================================
// PAYMENT PROCESSING
// ============================================================================

/**
 * POST /api/billing/payments/razorpay/create
 * Create Razorpay payment order
 */
router.post('/payments/razorpay/create', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, amount, currency } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId is required. Call /billing/orders/create first to get an orderId.'
      });
    }

    // Verify order belongs to user
    const order = await Order.findOne({
      where: { id: orderId, userId }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Create Razorpay order
    const razorpayOrder = await paymentGateway.createRazorpayOrder({
      amount: amount || order.total,
      currency: currency || order.currency,
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        userId: userId,
        orderType: order.orderType
      }
    });

    // Create payment record
    const payment = await Payment.create({
      paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId: order.id,
      userId: userId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      gateway: 'razorpay',
      gatewayOrderId: razorpayOrder.orderId,
      status: 'initiated',
      metadata: {
        razorpayOrderId: razorpayOrder.orderId
      }
    });

    return res.json({
      success: true,
      data: {
        orderId: razorpayOrder.orderId,
        amount: razorpayOrder.amount,
        amountInPaise: razorpayOrder.amountInPaise,
        currency: razorpayOrder.currency,
        paymentId: payment.id,
        key: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('Create Razorpay payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment',
      error: error.message
    });
  }
});

/**
 * POST /api/billing/payments/razorpay/verify
 * Verify Razorpay payment
 */
router.post('/payments/razorpay/verify', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    // Verify signature
    const isValid = paymentGateway.verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Find payment record
    const payment = await Payment.findOne({
      where: {
        gatewayOrderId: razorpayOrderId,
        userId: userId
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Commit DB update immediately — do not block on the Razorpay API fetch.
    // Signature is already verified; the payment is valid regardless of whether
    // the enrichment call below succeeds.
    await payment.update({
      status: 'success',
      gatewayPaymentId: razorpayPaymentId,
      gatewaySignature: razorpaySignature
    });

    // Update order status
    await Order.update(
      { status: 'completed' },
      { where: { id: payment.orderId } }
    );

    // ── Propagate the payment to the pharmacy order ───────────────────────────
    // patient_pharmacy_orders.payment_status and payment_id were written by NOTHING: the INSERT
    // in patient-pharmacy-orders.route.js omits both columns (so they sit at their defaults
    // 'pending' and NULL), its three UPDATE sites touch only status/status_history, and the only
    // payment_status write anywhere in the server is on ambulance_trip. Every paid pharmacy order
    // therefore still read payment_status='pending' with no payment id, so the pharmacy saw paid
    // orders as unpaid and would not dispense. Found 2026-10-04 on orders 38 and 39, both paid
    // through Razorpay with invoices marked paid.
    //
    // Guarded and non-fatal: the money is already captured and the Payment/Order rows are already
    // updated, so a failure here must be loud but must not fail the verification response.
    try {
      const paidOrder = await Order.findByPk(payment.orderId);
      if (paidOrder?.metadata?.source === 'patient_lab_checkout') await completeLabCheckout(userId, payment.orderId);
      const pharmacyOrderId = paidOrder?.metadata?.pharmacyOrderId;
      if (pharmacyOrderId) {
        const gatewayRef = payment.gatewayPaymentId || payment.paymentId || null;
        // A raw UPDATE returns [rows, metadata]; on pg the metadata IS the affected count
        // (verified: a non-matching id returns [[], 0]), so read it defensively either way.
        const [, meta] = await sequelize.query(
          `UPDATE patient_pharmacy_orders
              SET payment_status = 'paid',
                  payment_id     = COALESCE($1, payment_id),
                  updated_at     = NOW()
            WHERE order_id = $2`,
          { bind: [gatewayRef, pharmacyOrderId], type: sequelize.QueryTypes.UPDATE },
        );
        const rowCount = meta?.rowCount ?? meta ?? 0;
        if (rowCount) {
          console.log(`✅ pharmacy order ${pharmacyOrderId} marked paid (${gatewayRef || 'no gateway ref'})`);
        } else {
          console.error(`⚠️ pharmacy order ${pharmacyOrderId} referenced by order ${payment.orderId} was not found — payment NOT propagated`);
        }
      }
    } catch (pharmErr) {
      console.error(`❌ failed to mark pharmacy order paid for order ${payment.orderId}:`, pharmErr.message);
    }

    // ── Propagate the payment to a linked lab appointment (lab-payment bridge) ────────────────
    // A fee-bearing /labs/book creates a billing Order with metadata.appointmentId. The appointments
    // table enforces FORCE RLS, so set the per-request GUCs on this connection before the update.
    try {
      const linked = await Order.findByPk(payment.orderId);
      const appointmentId = linked?.metadata?.appointmentId;
      if (appointmentId) {
        await sequelize.transaction(async (apptTx) => {
          const orgRaw = Number(req.user?.organization_id ?? req.user?.organizationId);
          await sequelize.query(
            "SELECT set_config('app.current_org_id', :org, true), set_config('app.current_user_id', :uid, true)",
            { replacements: { org: String(Number.isFinite(orgRaw) && orgRaw > 0 ? orgRaw : 0), uid: String(userId) }, transaction: apptTx }
          );
          await Appointment.update(
            { paymentStatus: 'paid' },
            { where: { id: appointmentId, userId }, transaction: apptTx }
          );
        });
        console.log(`✅ lab appointment ${appointmentId} marked paid via order ${payment.orderId}`);
      }
    } catch (apptErr) {
      console.error(`❌ failed to mark lab appointment paid for order ${payment.orderId}:`, apptErr.message);
    }

    await sequelize.transaction(async transaction => {
      const paidOrder = await Order.findByPk(payment.orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!paidOrder) throw new Error('Paid order was not found');
      const [invoice] = await Invoice.findOrCreate({ where: { orderId: paidOrder.id }, defaults: {
        invoiceNumber: paymentGateway.generateInvoiceNumber(), userId, issueDate: new Date(), dueDate: new Date(), status: 'paid',
        subtotal: paidOrder.subtotal, tax: paidOrder.tax, discount: paidOrder.discount, total: paidOrder.total, currency: paidOrder.currency,
        lineItems: paidOrder.metadata?.items || [{ description: buildOrderItemLabel(paidOrder), quantity: 1, unitPrice: paidOrder.total, total: paidOrder.total }],
      }, transaction });
      if (invoice.status !== 'paid') await invoice.update({ status: 'paid' }, { transaction });
    });

    // Create transaction record
    await Transaction.create({
      transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: userId,
      orderId: payment.orderId,
      paymentId: payment.id,
      type: 'credit',
      amount: payment.amount,
      currency: payment.currency,
      status: 'completed',
      description: `Payment successful for order ${payment.orderId}`
    });

    // Respond before the optional Razorpay enrichment fetch
    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: { payment }
    });

    // Fire-and-forget: customer confirmation email + invoice, and internal team alert.
    // Never blocks the response and never affects the recorded order/payment on failure.
    (async () => {
      try {
        const [order, user] = await Promise.all([
          Order.findByPk(payment.orderId),
          User.findByPk(userId),
        ]);
        if (order && user) {
          await purchaseNotification.notifyOrderPurchase({
            order,
            user,
            payment,
            itemLabel: buildOrderItemLabel(order),
          });
        }
      } catch (notifyErr) {
        console.error('Purchase notification dispatch failed:', notifyErr.message);
      }
    })();

    // Fire-and-forget: enrich payment record with method/email/phone from Razorpay.
    // A failure here does not affect the client or the order.
    paymentGateway.fetchRazorpayPayment(razorpayPaymentId).then(details => {
      payment.update({
        method: details.payment.method,
        email: details.payment.email,
        phone: details.payment.contact,
        gatewayResponse: details.payment
      }).catch(err => console.error('Payment enrichment DB update failed:', err.message));
    }).catch(err => console.error('fetchRazorpayPayment enrichment failed:', err.message));

    return;

  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

// ============================================================================
// INVOICE MANAGEMENT
// ============================================================================

/**
 * POST /api/billing/invoices/generate
 * Generate invoice for an order
 */
router.post('/invoices/generate', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, lineItems, notes } = req.body;

    // Get order
    const order = await Order.findOne({
      where: { id: orderId, userId }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get user details
    const user = await User.findByPk(userId);

    // Check if invoice already exists
    let invoice = await Invoice.findOne({
      where: { orderId: order.id }
    });

    if (!invoice) {
      // Generate invoice number
      const invoiceNumber = paymentGateway.generateInvoiceNumber();

      // Create invoice
      invoice = await Invoice.create({
        invoiceNumber,
        orderId: order.id,
        userId: userId,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'sent',
        subtotal: order.subtotal,
        tax: order.tax,
        discount: order.discount,
        total: order.total,
        currency: order.currency,
        lineItems: lineItems || [],
        customerDetails: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phoneNumber,
          address: order.billingAddress
        },
        notes
      });
    }

    // Generate PDF
    const pdfResult = await invoiceService.generateInvoicePDF(invoice.toJSON());

    // Update invoice with PDF URL
    await invoice.update({
      pdfUrl: pdfResult.url
    });

    return res.json({
      success: true,
      message: 'Invoice generated successfully',
      data: {
        invoice,
        pdfUrl: pdfResult.url
      }
    });

  } catch (error) {
    console.error('Generate invoice error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate invoice',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/invoices
 * Get user's invoices
 */
router.get('/invoices', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['id', 'orderNumber', 'orderType', 'status']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get invoices error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/invoices/:invoiceId
 * Get invoice details
 */
router.get('/invoices/:invoiceId', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({
      where: { id: invoiceId, userId },
      include: [
        {
          model: Order,
          as: 'order'
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    return res.json({
      success: true,
      data: { invoice }
    });

  } catch (error) {
    console.error('Get invoice error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/invoices/:invoiceId/download
 * Download invoice PDF
 */
router.get('/invoices/:invoiceId/download', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({
      where: { id: invoiceId, userId }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (!invoice.pdfUrl) {
      return res.status(404).json({
        success: false,
        message: 'Invoice PDF not generated'
      });
    }

    // Send file for download
    const filePath = invoice.pdfUrl.replace('/uploads', 'uploads');
    return res.download(filePath, `invoice_${invoice.invoiceNumber}.pdf`);

  } catch (error) {
    console.error('Download invoice error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download invoice',
      error: error.message
    });
  }
});

// ============================================================================
// TRANSACTION HISTORY
// ============================================================================

/**
 * GET /api/billing/transactions
 * Get user's transaction history
 */
router.get('/transactions', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, status, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (type) where.type = type;
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

// ============================================================================
// PAYMENT STATISTICS
// ============================================================================

/**
 * GET /api/billing/stats
 * Get user's billing statistics
 */
router.get('/stats', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Total spent — only money actually captured/succeeded (W-ORD-3)
    const SUCCESSFUL_PAYMENT = { [Op.in]: ['success', 'captured'] };
    const totalSpent = await Payment.sum('amount', {
      where: {
        userId,
        status: SUCCESSFUL_PAYMENT
      }
    }) || 0;

    // Order counts by status
    const orderCounts = await Order.findAll({
      where: { userId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Recent payments — only successful ones, so this can never contradict
    // totalSpent (W-ORD-3: it showed 4 "payments" while nothing had been paid).
    const recentPayments = await Payment.findAll({
      where: { userId, status: SUCCESSFUL_PAYMENT },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Pending invoices
    const pendingInvoices = await Invoice.count({
      where: {
        userId,
        status: { [Op.in]: ['sent', 'overdue'] }
      }
    });

    return res.json({
      success: true,
      data: {
        totalSpent: parseFloat(totalSpent).toFixed(2),
        orderCounts,
        recentPayments,
        pendingInvoices
      }
    });

  } catch (error) {
    console.error('Get billing stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

// ============================================================================
// DOCTOR BILLING ENDPOINTS
// ============================================================================

/**
 * GET /api/billing/doctor/earnings
 * Get doctor's earnings and billing stats
 */
router.get('/doctor/earnings', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { period = 'month', startDate, endDate } = req.query;

    // Calculate date range
    let dateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        }
      };
    } else {
      switch (period) {
        case 'week':
          dateFilter = {
            createdAt: { [Op.gte]: new Date(now - 7 * 24 * 60 * 60 * 1000) }
          };
          break;
        case 'month':
          dateFilter = {
            createdAt: { [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1) }
          };
          break;
        case 'year':
          dateFilter = {
            createdAt: { [Op.gte]: new Date(now.getFullYear(), 0, 1) }
          };
          break;
        default:
          dateFilter = {};
      }
    }

    // Get doctor's payments (from appointments, consultations)
    const payments = await Payment.findAll({
      where: {
        doctorId,
        status: 'success',
        ...dateFilter
      },
      order: [['createdAt', 'DESC']]
    });

    // Calculate totals
    const totalEarnings = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalConsultations = payments.length;

    // Group by payment type
    const earningsByType = {};
    payments.forEach(p => {
      const type = p.paymentType || 'consultation';
      if (!earningsByType[type]) {
        earningsByType[type] = { count: 0, amount: 0 };
      }
      earningsByType[type].count++;
      earningsByType[type].amount += parseFloat(p.amount || 0);
    });

    // Monthly breakdown for the year
    const monthlyEarnings = await Payment.findAll({
      where: {
        doctorId,
        status: 'success',
        createdAt: { [Op.gte]: new Date(now.getFullYear(), 0, 1) }
      },
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    return res.json({
      success: true,
      data: {
        totalEarnings: totalEarnings.toFixed(2),
        totalConsultations,
        earningsByType,
        monthlyEarnings,
        period,
        recentPayments: payments.slice(0, 10)
      }
    });

  } catch (error) {
    console.error('Get doctor earnings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/doctor/invoices
 * Get doctor's issued invoices
 */
router.get('/doctor/invoices', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, page = 1, limit = 20 } = req.query;

    const where = { doctorId };
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const patientIds = [...new Set(invoices.map((invoice) => invoice.userId).filter(Boolean))];
    const patients = patientIds.length > 0
      ? await User.findAll({
          where: { id: { [Op.in]: patientIds } },
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        })
      : [];

    const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
    const invoiceData = invoices.map((invoice) => ({
      ...invoice.toJSON(),
      patient: patientMap.get(invoice.userId) || null
    }));

    return res.json({
      success: true,
      data: {
        invoices: invoiceData,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get doctor invoices error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

/**
 * POST /api/billing/doctor/invoices/create
 * Create invoice for patient consultation
 */
router.post('/doctor/invoices/create', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const {
      patientId,
      appointmentId,
      items,
      notes,
      dueDate,
      discount
    } = req.body;

    if (!patientId || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID and at least one item are required',
        details: {
          patientIdMissing: !patientId,
          itemsMissing: !items || items.length === 0,
          itemsCount: items?.length || 0
        }
      });
    }

    // Validate items
    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Items must be an array',
        details: { receivedType: typeof items }
      });
    }

    // Validate each item has required fields
    const invalidItems = items.filter(item => 
      !item.description || 
      item.quantity === undefined || 
      item.unitPrice === undefined
    );

    if (invalidItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Each item must have description, quantity, and unitPrice',
        details: { invalidItemCount: invalidItems.length }
      });
    }

    // Get patient info - try Postgres first, then fallback to MongoDB
    let patient = await User.findByPk(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get doctor info - use data from authenticated request
    let doctor = req.doctor;
    
    // If doctor info incomplete, try to fetch from database
    if (!doctor || !doctor.firstName) {
      const dbDoctor = await doctorModel.findByPk(doctorId);
      if (dbDoctor) {
        doctor = dbDoctor.dataValues || dbDoctor;
      }
    }

    // Calculate totals
    let subtotal = 0;
    const invoiceItems = items.map(item => {
      const itemTotal = (parseFloat(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0);
      subtotal += itemTotal;
      return {
        description: item.description || 'Service',
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
        total: itemTotal
      };
    });

    const discountAmount = parseFloat(discount) || 0;
    const taxRate = 0; // Can be configured
    const tax = subtotal * taxRate;
    const total = subtotal - discountAmount + tax;

    // Generate invoice number and create order for invoice linkage
    const invoiceNumber = paymentGateway.generateInvoiceNumber();
    const orderNumber = paymentGateway.generateOrderReceipt('ORD');

    // Prepare doctor details
    const doctorName = doctor.prefix
      ? `${doctor.prefix} ${doctor.firstName} ${doctor.lastName}`
      : `Dr. ${doctor.firstName} ${doctor.lastName}`;

    const { order, invoice } = await sequelize.transaction(async (transaction) => {
      const order = await Order.create({
        orderNumber,
        userId: patientId,
        orderType: appointmentId ? 'appointment' : 'consultation',
        itemId: appointmentId || null,
        status: 'pending',
        subtotal,
        tax,
        discount: discountAmount,
        total,
        currency: 'INR',
        notes: notes || '',
        metadata: {
          doctorId,
          doctorName,
          appointmentId: appointmentId || null
        }
      }, { transaction });

      const invoice = await Invoice.create({
        invoiceNumber,
        orderId: order.id,
        userId: patientId,
        doctorId,
        issueDate: new Date(),
        status: 'sent',
        lineItems: invoiceItems,
        subtotal,
        tax,
        discount: discountAmount,
        total,
        currency: 'INR',
        notes: notes || '',
        dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        customerDetails: {
          name: `${patient.firstName} ${patient.lastName}`,
          email: patient.email || '',
          phone: patient.phoneNumber || ''
        },
        companyDetails: {
          name: doctorName,
          address: doctor.clinicAddress || 'N/A',
          email: doctor.email || '',
          phone: doctor.phoneNumber || '',
          gstin: doctor.registrationNumber || 'N/A'
        }
      }, { transaction });

      return { order, invoice };
    });

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: { 
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          orderId: order.id,
          total: invoice.total,
          status: invoice.status,
          createdAt: invoice.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create doctor invoice error:', error);
    
    // Provide detailed error messages for debugging
    let errorMessage = 'Failed to create invoice';
    let statusCode = 500;
    
    if (error.message.includes('Not found')) {
      errorMessage = 'Patient not found. Please verify the patient ID.';
      statusCode = 404;
    } else if (error.message.includes('validation')) {
      errorMessage = 'Invalid data provided. Please check all fields.';
      statusCode = 400;
    } else if (error.message.includes('constraint')) {
      errorMessage = 'Database constraint error. Please contact support.';
      statusCode = 400;
    }
    
    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
      details: {
        timestamp: new Date().toISOString(),
        patientId: req.body.patientId,
        itemsCount: req.body.items?.length || 0
      }
    });
  }
});

/**
 * GET /api/billing/doctor/payments
 * Get doctor's received payments
 */
router.get('/doctor/payments', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, page = 1, limit = 20 } = req.query;

    const where = { doctorId };
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: payments } = await Payment.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({
      success: true,
      data: {
        payments,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get doctor payments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
});

/**
 * GET /api/billing/doctor/stats
 * Get doctor's billing statistics dashboard
 */
router.get('/doctor/stats', authDoctor, async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // This month's earnings
    const monthlyEarnings = await Payment.sum('amount', {
      where: {
        doctorId,
        status: 'success',
        createdAt: { [Op.gte]: startOfMonth }
      }
    }) || 0;

    // Total earnings (all time)
    const totalEarnings = await Payment.sum('amount', {
      where: {
        doctorId,
        status: 'success'
      }
    }) || 0;

    // Pending payments
    const pendingPayments = await Payment.sum('amount', {
      where: {
        doctorId,
        status: 'pending'
      }
    }) || 0;

    // Payment counts
    const successfulPayments = await Payment.count({
      where: {
        doctorId,
        status: 'success',
        createdAt: { [Op.gte]: startOfMonth }
      }
    });

    // Invoice stats
    const paidInvoices = await Invoice.count({
      where: { doctorId, status: 'paid' }
    });

    const pendingInvoices = await Invoice.count({
      where: { doctorId, status: { [Op.in]: ['sent', 'overdue'] } }
    });

    const overdueInvoices = await Invoice.count({
      where: { doctorId, status: 'overdue' }
    });

    // Recent transactions (without User association for now)
    const recentPayments = await Payment.findAll({
      where: { doctorId },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    return res.json({
      success: true,
      data: {
        earnings: {
          monthly: parseFloat(monthlyEarnings).toFixed(2),
          total: parseFloat(totalEarnings).toFixed(2),
          pending: parseFloat(pendingPayments).toFixed(2)
        },
        payments: {
          successful: successfulPayments
        },
        invoices: {
          paid: paidInvoices,
          pending: pendingInvoices,
          overdue: overdueInvoices
        },
        recentPayments
      }
    });

  } catch (error) {
    console.error('Get doctor billing stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

/**
 * Refund a paid order (full or partial). Reusable by the cancel flow and the staff endpoint.
 * Returns the Refund row. Throws on no successful payment / gateway failure.
 */
export async function refundOrder(orderId, { amount = null, reason = '', actorUserId = null } = {}) {
  const order = await Order.findByPk(orderId);
  if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }
  const payment = await Payment.findOne({ where: { orderId: order.id, status: 'success' }, order: [['createdAt', 'DESC']] });
  if (!payment || !payment.gatewayPaymentId) { const e = new Error('No captured payment to refund for this order'); e.status = 409; throw e; }
  const refundAmount = amount != null ? Number(amount) : Number(payment.amount);
  const gw = await paymentGateway.createRazorpayRefund(payment.gatewayPaymentId, refundAmount, { orderId: order.id, reason: String(reason || '').slice(0, 200) });
  const refund = await Refund.create({
    refundId: `REF_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    paymentId: payment.id, orderId: order.id, userId: order.userId,
    amount: refundAmount, currency: order.currency || 'INR', reason: String(reason || '').slice(0, 500),
    status: 'processing', gatewayRefundId: gw?.refundId || null,
    metadata: { gateway: 'razorpay', initiatedBy: actorUserId },
  });
  await Order.update({ status: 'refunded' }, { where: { id: order.id } });
  await Payment.update({ status: 'refunded' }, { where: { id: payment.id } });
  return refund;
}

// Staff-initiated refund for an order (admin / team / hospital only).
router.post('/orders/:orderId/refund', authUser, async (req, res) => {
  const role = req.user?.role;
  if (!req.user?.isAdmin && !['admin', 'super_admin', 'team', 'team_member', 'team_lead', 'hospital'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Refunds require admin, team or hospital access' });
  }
  try {
    const refund = await refundOrder(req.params.orderId, { amount: req.body?.amount ?? null, reason: req.body?.reason || 'Staff-initiated refund', actorUserId: req.user.id });
    return res.json({ success: true, refund: { id: refund.id, refundId: refund.refundId, amount: Number(refund.amount), status: refund.status, gatewayRefundId: refund.gatewayRefundId } });
  } catch (e) {
    console.error('[billing] refund error:', e.message);
    return res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Refund could not be processed' });
  }
});

// Cancel an order (patient's own). Pending/processing orders cancel directly; a completed (paid)
// order is refunded (reusing refundOrder) and marked refunded.
router.post('/orders/:orderId/cancel', authUser, async (req, res) => {
  try {
    const order = await Order.findOne({ where: { id: req.params.orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (['cancelled', 'refunded'].includes(order.status)) {
      return res.status(409).json({ success: false, message: `Order is already ${order.status}` });
    }
    const reason = String(req.body?.reason || 'Cancelled by customer').slice(0, 500);
    let refund = null, finalStatus = 'cancelled';
    if (order.status === 'completed') {
      try { refund = await refundOrder(order.id, { reason, actorUserId: req.user.id }); finalStatus = 'refunded'; }
      catch (e) { if (e.status !== 409) throw e; /* nothing captured to refund — just cancel */ }
    }
    const meta = { ...(order.metadata || {}), cancelledAt: new Date().toISOString(), cancellationReason: reason };
    await Order.update({ status: finalStatus, metadata: meta }, { where: { id: order.id } });
    return res.json({ success: true, order: { id: order.id, orderNumber: order.orderNumber, status: finalStatus }, refund: refund ? { id: refund.id, status: refund.status, amount: Number(refund.amount) } : null });
  } catch (e) {
    console.error('[billing] cancel order error:', e.message);
    return res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Unable to cancel the order' });
  }
});

// Order tracking — a status timeline synthesised from the order's lifecycle timestamps.
router.get('/orders/:orderId/tracking', authUser, async (req, res) => {
  try {
    const order = await Order.findOne({ where: { id: req.params.orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const m = order.metadata || {};
    const timeline = [{ status: 'placed', at: order.createdAt }];
    if (['processing', 'completed', 'refunded'].includes(order.status)) timeline.push({ status: 'confirmed', at: m.confirmedAt || order.updatedAt });
    if (['completed', 'refunded'].includes(order.status)) timeline.push({ status: 'completed', at: m.completedAt || order.updatedAt });
    if (order.status === 'cancelled' || m.cancelledAt) timeline.push({ status: 'cancelled', at: m.cancelledAt || order.updatedAt });
    if (order.status === 'refunded') timeline.push({ status: 'refunded', at: order.updatedAt });
    return res.json({ success: true, tracking: { orderNumber: order.orderNumber, status: order.status, timeline } });
  } catch (e) {
    console.error('[billing] order tracking error:', e.message);
    return res.status(500).json({ success: false, message: 'Unable to load order tracking' });
  }
});

export default router;
