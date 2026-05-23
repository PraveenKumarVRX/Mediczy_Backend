import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPaths = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env')
];
envPaths.forEach((envPath) => {
  if (!fs.existsSync(envPath)) return;
  const result = dotenv.config({ path: envPath });
  if (!result.parsed) return;
  for (const [key, value] of Object.entries(result.parsed)) {
    if (!process.env[key]) process.env[key] = value;
  }
});

class PaymentService {
  constructor() {
    this.razorpayInstance = null;
    this.initializeRazorpay();
  }

  initializeRazorpay() {
    try {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        this.razorpayInstance = null;
        console.warn('⚠️ Razorpay credentials not configured for PaymentService');
        return;
      }

      this.razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });

      console.log('✅ Razorpay initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Razorpay:', error.message);
    }
  }

  /**
   * Create a Razorpay order
   * @param {Object} orderData - Order details
   * @returns {Promise<Object>} Razorpay order
   */
  async createOrder(orderData) {
    try {
      if (!this.razorpayInstance) {
        return {
          success: false,
          error: 'Razorpay not configured'
        };
      }

      const { amount, currency = 'INR', receipt, notes = {} } = orderData;

      // Amount should be in smallest currency unit (paise for INR)
      const amountInSmallestUnit = Math.round(amount * 100);

      const options = {
        amount: amountInSmallestUnit,
        currency,
        receipt,
        notes: Object.fromEntries(Object.entries(notes || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)])),
        payment_capture: 1 // Auto capture payment
      };

      const order = await this.razorpayInstance.orders.create(options);
      
      console.log('✅ Razorpay order created:', order.id);
      return {
        success: true,
        order
      };
    } catch (error) {
      console.error('❌ Failed to create Razorpay order:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - Payment verification data
   * @returns {Boolean} Verification status
   */
  verifyPaymentSignature(paymentData) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) return false;
      
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const isValid = generatedSignature === razorpay_signature;
      
      if (isValid) {
        console.log('✅ Payment signature verified successfully');
      } else {
        console.error('❌ Payment signature verification failed');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Error verifying payment signature:', error.message);
      return false;
    }
  }

  /**
   * Fetch payment details
   * @param {String} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  async fetchPayment(paymentId) {
    try {
      const payment = await this.razorpayInstance.payments.fetch(paymentId);
      
      return {
        success: true,
        payment
      };
    } catch (error) {
      console.error('❌ Failed to fetch payment:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch order details
   * @param {String} orderId - Razorpay order ID
   * @returns {Promise<Object>} Order details
   */
  async fetchOrder(orderId) {
    try {
      const order = await this.razorpayInstance.orders.fetch(orderId);
      
      return {
        success: true,
        order
      };
    } catch (error) {
      console.error('❌ Failed to fetch order:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a refund
   * @param {String} paymentId - Razorpay payment ID
   * @param {Object} refundData - Refund details
   * @returns {Promise<Object>} Refund details
   */
  async createRefund(paymentId, refundData = {}) {
    try {
      const { amount, notes = {}, speed = 'normal' } = refundData;

      const options = {
        ...(amount && { amount: Math.round(amount * 100) }), // Amount in paise
        notes,
        speed // 'normal' or 'optimum'
      };

      const refund = await this.razorpayInstance.payments.refund(paymentId, options);
      
      console.log('✅ Refund created:', refund.id);
      return {
        success: true,
        refund
      };
    } catch (error) {
      console.error('❌ Failed to create refund:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch all refunds for a payment
   * @param {String} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} List of refunds
   */
  async fetchRefunds(paymentId) {
    try {
      const refunds = await this.razorpayInstance.payments.fetchMultipleRefund(paymentId);
      
      return {
        success: true,
        refunds
      };
    } catch (error) {
      console.error('❌ Failed to fetch refunds:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Capture payment (if not auto-captured)
   * @param {String} paymentId - Razorpay payment ID
   * @param {Number} amount - Amount to capture in INR
   * @param {String} currency - Currency code
   * @returns {Promise<Object>} Captured payment details
   */
  async capturePayment(paymentId, amount, currency = 'INR') {
    try {
      const amountInSmallestUnit = Math.round(amount * 100);

      const payment = await this.razorpayInstance.payments.capture(
        paymentId,
        amountInSmallestUnit,
        currency
      );

      console.log('✅ Payment captured:', payment.id);
      return {
        success: true,
        payment
      };
    } catch (error) {
      console.error('❌ Failed to capture payment:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify webhook signature
   * @param {Object} body - Webhook body
   * @param {String} signature - X-Razorpay-Signature header
   * @returns {Boolean} Verification status
   */
  verifyWebhookSignature(body, signature) {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret || !signature) return false;
      const signedPayload = typeof body === 'string' ? body : JSON.stringify(body);
      
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');

      const isValid = expectedSignature === signature;

      if (isValid) {
        console.log('✅ Webhook signature verified successfully');
      } else {
        console.error('❌ Webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Error verifying webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Get payment gateway configuration
   * @returns {Object} Gateway configuration
   */
  getGatewayConfig() {
    return {
      keyId: process.env.RAZORPAY_KEY_ID,
      currency: 'INR',
      name: 'Mediczy',
      description: 'Healthcare Platform',
      theme: {
        color: '#10B981' // Green color
      }
    };
  }

  /**
   * Calculate processing fee
   * @param {Number} amount - Transaction amount
   * @param {Number} feePercentage - Fee percentage (default 2.36%)
   * @returns {Object} Fee breakdown
   */
  calculateFees(amount, feePercentage = 2.36) {
    const fees = (amount * feePercentage) / 100;
    const netAmount = amount - fees;

    return {
      amount,
      fees: Math.round(fees * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      feePercentage
    };
  }

  /**
   * Format payment amount for display
   * @param {Number} amount - Amount in smallest unit (paise)
   * @param {String} currency - Currency code
   * @returns {String} Formatted amount
   */
  formatAmount(amount, currency = 'INR') {
    const amountInMainUnit = amount / 100;
    
    if (currency === 'INR') {
      return `₹${amountInMainUnit.toLocaleString('en-IN')}`;
    }
    
    return `${currency} ${amountInMainUnit.toLocaleString()}`;
  }
}

// Export singleton instance
const paymentService = new PaymentService();
export default paymentService;
