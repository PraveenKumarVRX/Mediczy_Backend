import paymentService from '../services/payment.service.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import kafkaEvents from '../services/kafka-events.service.js';

// Temporary in-memory store for payment transactions
const paymentTransactions = new Map();
const paymentGateways = new Map();

class PaymentController {
  /**
   * Create a new payment order
   * POST /api/payments/order
   */
  async createOrder(req, res) {
    try {
      const {
        amount,
        currency = 'INR',
        clientType,
        clientId,
        clientName,
        description,
        metadata = {}
      } = req.body;

      // Validate required fields
      if (!amount || !clientType || !clientId || !clientName) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: amount, clientType, clientId, clientName'
        });
      }

      // Generate receipt ID
      const receipt = `rcpt_${Date.now()}_${clientId}`;

      // Create Razorpay order
      const orderResult = await paymentService.createOrder({
        amount,
        currency,
        receipt,
        notes: {
          clientType,
          clientId,
          clientName,
          description,
          ...metadata
        }
      });

      if (!orderResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create payment order',
          error: orderResult.error
        });
      }

      // Calculate fees
      const feeBreakdown = paymentService.calculateFees(amount);

      // Create transaction record
      const transaction = {
        id: `txn_${Date.now()}`,
        transactionId: orderResult.order.id,
        razorpayOrderId: orderResult.order.id,
        gatewayId: 'gw_razorpay_001',
        gatewayName: 'Razorpay',
        clientType,
        clientId,
        clientName,
        amount,
        currency,
        fees: feeBreakdown.fees,
        netAmount: feeBreakdown.netAmount,
        status: 'pending',
        paymentMethod: 'Not specified',
        description: description || 'Payment',
        receipt,
        createdAt: new Date().toISOString(),
        razorpayOrderDetails: orderResult.order
      };

      // Store transaction in database
      await db.PaymentTransaction.create(transaction);

      // Get gateway config for frontend
      const gatewayConfig = paymentService.getGatewayConfig();

      res.json({
        success: true,
        order: orderResult.order,
        transaction,
        gatewayConfig,
        message: 'Payment order created successfully'
      });
    } catch (error) {
      console.error('❌ Error creating payment order:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Verify payment after completion
   * POST /api/payments/verify
   */
  async verifyPayment(req, res) {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = req.body;

      // Validate required fields
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Missing payment verification data'
        });
      }

      // Verify signature
      const isValid = paymentService.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });

      if (!isValid) {
        // Update transaction as failed
        await db.PaymentTransaction.update(
          {
            status: 'failed',
            failureReason: 'Invalid payment signature',
            updatedAt: new Date().toISOString()
          },
          {
            where: { razorpayOrderId: razorpay_order_id }
          }
        );

        return res.status(400).json({
          success: false,
          message: 'Payment signature verification failed'
        });
      }

      // Fetch payment details from Razorpay
      const paymentResult = await paymentService.fetchPayment(razorpay_payment_id);

      if (!paymentResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch payment details',
          error: paymentResult.error
        });
      }

      // Update transaction as completed
      const updatedTransaction = await db.PaymentTransaction.update(
        {
          status: 'completed',
          razorpayPaymentId: razorpay_payment_id,
          paymentMethod: paymentResult.payment.method || 'Unknown',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          razorpayPaymentDetails: paymentResult.payment
        },
        {
          where: { razorpayOrderId: razorpay_order_id }
        }
      );

      // Publish Kafka event for payment success
      try {
        const transaction = await db.PaymentTransaction.findOne({
          where: { razorpayOrderId: razorpay_order_id }
        });
        if (transaction && req.user) {
          await kafkaEvents.publishPaymentSuccess(transaction, req.user);
          console.log('✅ Kafka event published: payment.success');
        }
      } catch (kafkaError) {
        console.error('Failed to publish payment success to Kafka:', kafkaError);
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        payment: paymentResult.payment,
        transaction: updatedTransaction
      });
    } catch (error) {
      console.error('❌ Error verifying payment:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Handle Razorpay webhooks
   * POST /api/payments/webhook
   */
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const body = req.body;

      // Verify webhook signature
      const isValid = paymentService.verifyWebhookSignature(body, signature);

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      const { event, payload } = body;

      console.log('📨 Received webhook event:', event);

      // Handle different webhook events
      switch (event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(payload.payment.entity);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(payload.payment.entity);
          break;
        case 'refund.created':
          await this.handleRefundCreated(payload.refund.entity);
          break;
        case 'refund.speed_changed':
          await this.handleRefundSpeedChanged(payload.refund.entity);
          break;
        case 'order.paid':
          await this.handleOrderPaid(payload.order.entity);
          break;
        default:
          console.log(`Unhandled webhook event: ${event}`);
      }

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      console.error('❌ Error handling webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get all transactions with filtering
   * GET /api/payments/transactions
   */
  async getTransactions(req, res) {
    try {
      const {
        status,
        clientType,
        gatewayId,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      // Build filter criteria
      const filter = {};
      if (status) filter.status = status;
      if (clientType) filter.clientType = clientType;
      if (gatewayId) filter.gatewayId = gatewayId;

      // Fetch transactions
      const transactions = await db.PaymentTransaction.findAll({
        where: filter,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      // Calculate statistics
      const allTransactions = await db.PaymentTransaction.findAll();
      const stats = this.calculateStatistics(allTransactions);

      res.json({
        success: true,
        transactions,
        stats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: transactions.length
        }
      });
    } catch (error) {
      console.error('❌ Error fetching transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get a single transaction by ID
   * GET /api/payments/transactions/:id
   */
  async getTransaction(req, res) {
    try {
      const { id } = req.params;

      const transaction = await db.PaymentTransaction.findByPk(id);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      res.json({
        success: true,
        transaction
      });
    } catch (error) {
      console.error('❌ Error fetching transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Create a refund
   * POST /api/payments/refund
   */
  async createRefund(req, res) {
    try {
      const { transactionId, amount, reason, speed = 'normal' } = req.body;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID is required'
        });
      }

      // Find transaction
      const transaction = await db.PaymentTransaction.findByPk(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      if (transaction.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Can only refund completed transactions'
        });
      }

      // Create refund
      const refundResult = await paymentService.createRefund(
        transaction.razorpayPaymentId,
        {
          amount, // Optional: partial refund
          notes: { reason },
          speed
        }
      );

      if (!refundResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create refund',
          error: refundResult.error
        });
      }

      // Update transaction
      await db.PaymentTransaction.update(
        {
          status: 'refunded',
          refundId: refundResult.refund.id,
          refundAmount: amount || transaction.amount,
          refundReason: reason,
          refundedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          where: { id: transactionId }
        }
      );

      res.json({
        success: true,
        message: 'Refund created successfully',
        refund: refundResult.refund
      });
    } catch (error) {
      console.error('❌ Error creating refund:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get payment gateways
   * GET /api/payments/gateways
   */
  async getGateways(req, res) {
    try {
      const gateways = await db.PaymentGateway.findAll();

      // Calculate statistics for each gateway
      const gatewaysWithStats = await Promise.all(
        gateways.map(async (gateway) => {
          const transactions = await db.PaymentTransaction.findAll({
            where: { gatewayId: gateway.id }
          });

          const stats = this.calculateGatewayStatistics(transactions);

          return {
            ...gateway,
            stats
          };
        })
      );

      res.json({
        success: true,
        gateways: gatewaysWithStats
      });
    } catch (error) {
      console.error('❌ Error fetching gateways:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Create a payment gateway
   * POST /api/payments/gateways
   */
  async createGateway(req, res) {
    try {
      const {
        name,
        provider,
        type,
        isEnabled = true,
        processingFee = 0,
        currency = 'INR',
        merchantId,
        apiKey,
        webhookUrl,
        testMode = true,
        dailyLimit,
        monthlyLimit,
        countries = ['IN']
      } = req.body || {};

      if (!name || !provider || !type) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, provider, type'
        });
      }

      const gateway = await db.PaymentGateway.create({
        id: `gw_${Date.now()}`,
        name,
        provider,
        type,
        isEnabled,
        processingFee,
        currency,
        merchantId,
        apiKey,
        webhookUrl,
        testMode,
        dailyLimit,
        monthlyLimit,
        countries,
        createdAt: new Date().toISOString()
      });

      return res.status(201).json({
        success: true,
        message: 'Gateway created successfully',
        gateway
      });
    } catch (error) {
      console.error('❌ Error creating gateway:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Update gateway configuration
   * PUT /api/payments/gateways/:id
   */
  async updateGateway(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const gateway = await db.PaymentGateway.findByPk(id);

      if (!gateway) {
        return res.status(404).json({
          success: false,
          message: 'Gateway not found'
        });
      }

      // Update gateway
      await db.PaymentGateway.update(updates, {
        where: { id }
      });

      res.json({
        success: true,
        message: 'Gateway updated successfully'
      });
    } catch (error) {
      console.error('❌ Error updating gateway:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  /**
   * Get payment statistics
   * GET /api/payments/stats
   */
  async getStatistics(req, res) {
    try {
      const { startDate, endDate, clientType } = req.query;

      // Build filter
      const filter = {};
      if (clientType) filter.clientType = clientType;

      const transactions = await db.PaymentTransaction.findAll({
        where: filter
      });

      const stats = this.calculateStatistics(transactions);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('❌ Error fetching statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Helper methods

  async handlePaymentCaptured(payment) {
    try {
      await db.PaymentTransaction.update(
        {
          status: 'completed',
          razorpayPaymentId: payment.id,
          paymentMethod: payment.method,
          completedAt: new Date(payment.created_at * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          where: { razorpayOrderId: payment.order_id }
        }
      );
      console.log('✅ Payment captured:', payment.id);
    } catch (error) {
      console.error('❌ Error handling payment captured:', error);
    }
  }

  async handlePaymentFailed(payment) {
    try {
      await db.PaymentTransaction.update(
        {
          status: 'failed',
          failureReason: payment.error_description || 'Payment failed',
          updatedAt: new Date().toISOString()
        },
        {
          where: { razorpayOrderId: payment.order_id }
        }
      );
      console.log('❌ Payment failed:', payment.id);
    } catch (error) {
      console.error('❌ Error handling payment failed:', error);
    }
  }

  async handleRefundCreated(refund) {
    try {
      await db.PaymentTransaction.update(
        {
          status: 'refunded',
          refundId: refund.id,
          refundAmount: refund.amount / 100,
          refundedAt: new Date(refund.created_at * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          where: { razorpayPaymentId: refund.payment_id }
        }
      );
      console.log('✅ Refund created:', refund.id);
    } catch (error) {
      console.error('❌ Error handling refund created:', error);
    }
  }

  async handleRefundSpeedChanged(refund) {
    console.log('⚡ Refund speed changed:', refund.id, refund.speed_processed);
  }

  async handleOrderPaid(order) {
    console.log('💰 Order paid:', order.id);
  }

  calculateStatistics(transactions) {
    const completedTransactions = transactions.filter(t => t.status === 'completed');
    
    return {
      totalTransactions: transactions.length,
      totalAmount: completedTransactions.reduce((sum, t) => sum + t.amount, 0),
      totalFees: completedTransactions.reduce((sum, t) => sum + t.fees, 0),
      successRate: transactions.length > 0 
        ? (completedTransactions.length / transactions.length) * 100 
        : 0,
      todayTransactions: transactions.filter(t => 
        new Date(t.createdAt).toDateString() === new Date().toDateString()
      ).length,
      todayAmount: completedTransactions.filter(t => 
        new Date(t.createdAt).toDateString() === new Date().toDateString()
      ).reduce((sum, t) => sum + t.amount, 0),
      pendingAmount: transactions.filter(t => t.status === 'pending')
        .reduce((sum, t) => sum + t.amount, 0),
      refundedAmount: transactions.filter(t => t.status === 'refunded')
        .reduce((sum, t) => sum + t.amount, 0)
    };
  }

  calculateGatewayStatistics(transactions) {
    const completedTransactions = transactions.filter(t => t.status === 'completed');
    
    return {
      totalProcessed: completedTransactions.reduce((sum, t) => sum + t.amount, 0),
      totalTransactions: transactions.length,
      successRate: transactions.length > 0 
        ? (completedTransactions.length / transactions.length) * 100 
        : 0,
      totalFees: completedTransactions.reduce((sum, t) => sum + t.fees, 0)
    };
  }
}

const paymentController = new PaymentController();
export default paymentController;
