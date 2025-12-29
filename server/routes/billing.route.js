import express from 'express';
import { authUser, authDoctor } from '../middleware/auth.middleware.js';
import { Order, Invoice, Payment, Transaction, Refund } from '../models/billing.model.intelligent.js';
import paymentGateway from '../services/payment-gateway.service.js';
import invoiceService from '../services/invoice.service.js';
import userModel from '../models/user.model.intelligent.js';
import doctorModel from '../models/postgres/doctor.model.postgres.js';
import { Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const router = express.Router();

// ============================================================================
// ORDER MANAGEMENT
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

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order }
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

    return res.json({
      success: true,
      data: {
        orders,
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

    // Fetch payment details from Razorpay
    const paymentDetails = await paymentGateway.fetchRazorpayPayment(razorpayPaymentId);

    // Update payment record
    await payment.update({
      status: 'success',
      gatewayPaymentId: razorpayPaymentId,
      gatewaySignature: razorpaySignature,
      method: paymentDetails.payment.method,
      email: paymentDetails.payment.email,
      phone: paymentDetails.payment.contact,
      gatewayResponse: paymentDetails.payment
    });

    // Update order status
    await Order.update(
      { status: 'completed' },
      { where: { id: payment.orderId } }
    );

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

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      data: { payment }
    });

  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

/**
 * POST /api/billing/payments/stripe/create
 * Create Stripe payment intent
 */
router.post('/payments/stripe/create', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, amount, currency } = req.body;

    // Verify order
    const order = await Order.findOne({
      where: { id: orderId, userId }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Create Stripe payment intent
    const paymentIntent = await paymentGateway.createStripePaymentIntent({
      amount: amount || order.total,
      currency: currency || order.currency,
      metadata: {
        orderId: order.id,
        userId: userId,
        orderNumber: order.orderNumber
      },
      description: `Payment for order ${order.orderNumber}`
    });

    // Create payment record
    const payment = await Payment.create({
      paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId: order.id,
      userId: userId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      gateway: 'stripe',
      gatewayOrderId: paymentIntent.paymentIntentId,
      status: 'initiated',
      metadata: {
        clientSecret: paymentIntent.clientSecret
      }
    });

    return res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        paymentId: payment.id
      }
    });

  } catch (error) {
    console.error('Create Stripe payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment',
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
    const user = await userModel.findByPk(userId);

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

    // Total spent
    const totalSpent = await Payment.sum('amount', {
      where: {
        userId,
        status: 'success'
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

    // Recent payments
    const recentPayments = await Payment.findAll({
      where: { userId },
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
      include: [
        {
          model: userModel,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
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
        message: 'Patient ID and at least one item are required'
      });
    }

    // Get patient info
    const patient = await userModel.findByPk(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get doctor info
    const doctor = await doctorModel.findByPk(doctorId);

    // Calculate totals
    let subtotal = 0;
    const invoiceItems = items.map(item => {
      const itemTotal = (parseFloat(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0);
      subtotal += itemTotal;
      return {
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
        total: itemTotal
      };
    });

    const discountAmount = parseFloat(discount) || 0;
    const taxRate = 0; // Can be configured
    const tax = subtotal * taxRate;
    const total = subtotal - discountAmount + tax;

    // Generate invoice number
    const invoiceNumber = `INV-${doctorId}-${Date.now().toString(36).toUpperCase()}`;

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      userId: patientId,
      doctorId,
      appointmentId,
      type: 'consultation',
      status: 'sent',
      items: invoiceItems,
      subtotal,
      tax,
      discount: discountAmount,
      total,
      currency: 'INR',
      notes,
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      billingDetails: {
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        doctorSpecialization: doctor.specialization,
        doctorRegistration: doctor.registrationNumber,
        clinicAddress: doctor.clinicAddress
      },
      patientDetails: {
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        phone: patient.phoneNumber
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: { invoice }
    });

  } catch (error) {
    console.error('Create doctor invoice error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: error.message
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
      include: [
        {
          model: userModel,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        }
      ],
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

    // Recent transactions
    const recentPayments = await Payment.findAll({
      where: { doctorId },
      include: [
        {
          model: userModel,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
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

export default router;
