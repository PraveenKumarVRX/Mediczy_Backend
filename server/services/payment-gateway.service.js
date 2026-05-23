import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const mask = (v) => (v ? `${v.slice(0, 3)}***${v.slice(-4)}` : 'undefined');

// Ensure environment variables load from project root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPaths = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env')
];
const dotenvResults = envPaths.map((envPath) => ({
  envPath,
  exists: fs.existsSync(envPath),
  result: dotenv.config({ path: envPath })
}));
dotenvResults.forEach(({ result }) => {
  if (!result.parsed) return;
  for (const [key, value] of Object.entries(result.parsed)) {
    if (!process.env[key]) process.env[key] = value;
  }
});
console.log('🔧 PaymentGateway env load', dotenvResults.map(({ envPath, exists }) => ({ envPath, exists })));
console.log('🔧 Dotenv loaded', { 
  errors: dotenvResults
    .filter(({ result }) => result.error)
    .map(({ envPath, result }) => ({ envPath, error: result.error.message })),
  hasRazorpayKey: !!process.env.RAZORPAY_KEY_ID,
  hasRazorpaySecret: !!process.env.RAZORPAY_KEY_SECRET
});
console.log('🔑 Razorpay env in service', {
  hasKey: !!process.env.RAZORPAY_KEY_ID,
  hasSecret: !!process.env.RAZORPAY_KEY_SECRET
});

// Initialize payment gateways
let razorpayInstance = null;

// Initialize Razorpay
const resolvedRazorpayKeyId = process.env.RAZORPAY_KEY_ID;
const resolvedRazorpaySecret = process.env.RAZORPAY_KEY_SECRET;
if (resolvedRazorpayKeyId && resolvedRazorpaySecret) {
  // Backfill process.env for downstream usage if missing
  if (!process.env.RAZORPAY_KEY_ID) process.env.RAZORPAY_KEY_ID = resolvedRazorpayKeyId;
  if (!process.env.RAZORPAY_KEY_SECRET) process.env.RAZORPAY_KEY_SECRET = resolvedRazorpaySecret;

  razorpayInstance = new Razorpay({
    key_id: resolvedRazorpayKeyId,
    key_secret: resolvedRazorpaySecret
  });
  console.log(
    '✅ Razorpay initialized',
    `(key_id=${mask(resolvedRazorpayKeyId)})`
  );
} else {
  console.warn(
    '⚠️ Razorpay credentials not configured',
    `(key_id=${mask(resolvedRazorpayKeyId)}, secret=${mask(resolvedRazorpaySecret)})`,
    `envPaths checked`
  );
}

/**
 * Payment Gateway Service
 */
class PaymentGatewayService {
  
  // ============================================================================
  // RAZORPAY METHODS
  // ============================================================================

  /**
   * Create Razorpay order
   */
  async createRazorpayOrder(orderData) {
    if (!razorpayInstance && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      razorpayInstance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
      console.log('✅ Razorpay lazily initialized');
    }

    if (!razorpayInstance) {
      throw new Error('Razorpay not configured');
    }

    // Ensure amount is in paise (multiply by 100 for decimal prices)
    const amountInPaise = Math.round(orderData.amount * 100);
    
    // Sanitize notes: Razorpay requires string values, no nulls
    const sanitizedNotes = {};
    if (orderData.notes) {
      for (const [k, v] of Object.entries(orderData.notes)) {
        if (v !== null && v !== undefined) sanitizedNotes[k] = String(v);
      }
    }
    
    const options = {
      amount: amountInPaise,
      currency: orderData.currency || 'INR',
      receipt: orderData.receipt || `order_${Date.now()}`,
      notes: sanitizedNotes,
      payment_capture: 1 // Auto-capture payment
    };

    try {
      console.log('📤 Creating Razorpay order with options:', JSON.stringify(options, null, 2));
      const order = await razorpayInstance.orders.create(options);
      
      const result = {
        success: true,
        gateway: 'razorpay',
        orderId: order.id,
        amount: order.amount / 100,
        amountInPaise: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status
      };
      
      console.log('✅ Razorpay order created successfully:', result.orderId);
      return result;
    } catch (error) {
      console.error('❌ Razorpay order creation error:', {
        message: error?.message,
        name: error?.name,
        status: error?.status || error?.statusCode,
        code: error?.code,
        description: error?.description,
        error: error?.error,
        options
      });
      throw error;
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyRazorpaySignature(orderId, paymentId, signature) {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay secret key not configured');
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Fetch Razorpay payment details
   */
  async fetchRazorpayPayment(paymentId) {
    if (!razorpayInstance) {
      throw new Error('Razorpay not configured');
    }

    try {
      const payment = await razorpayInstance.payments.fetch(paymentId);
      return {
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount / 100,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
          cardId: payment.card_id,
          bank: payment.bank,
          wallet: payment.wallet,
          vpa: payment.vpa,
          createdAt: new Date(payment.created_at * 1000)
        }
      };
    } catch (error) {
      console.error('Fetch Razorpay payment error:', error);
      throw error;
    }
  }

  /**
   * Create Razorpay refund
   */
  async createRazorpayRefund(paymentId, amount, notes = {}) {
    if (!razorpayInstance) {
      throw new Error('Razorpay not configured');
    }

    try {
      const refund = await razorpayInstance.payments.refund(paymentId, {
        amount: amount ? Math.round(amount * 100) : undefined, // Partial or full refund
        notes: notes
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        paymentId: refund.payment_id
      };
    } catch (error) {
      console.error('Razorpay refund error:', error);
      throw error;
    }
  }

  // ============================================================================
  // WEBHOOK VERIFICATION
  // ============================================================================

  /**
   * Verify Razorpay webhook signature
   */
  verifyRazorpayWebhook(body, signature) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      throw new Error('Razorpay webhook secret not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');

    return expectedSignature === signature;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Generate order receipt number
   */
  generateOrderReceipt(prefix = 'ORD') {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Generate invoice number
   */
  generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now();
    return `INV-${year}${month}-${timestamp}`;
  }

  /**
   * Calculate tax (GST for India)
   */
  calculateTax(amount, taxRate = 18) {
    return parseFloat((amount * (taxRate / 100)).toFixed(2));
  }

  /**
   * Calculate total with tax and discount
   */
  calculateTotal(subtotal, tax = 0, discount = 0) {
    return parseFloat((subtotal + tax - discount).toFixed(2));
  }
}

export default new PaymentGatewayService();
