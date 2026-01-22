import Razorpay from 'razorpay';
import Stripe from 'stripe';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const mask = (v) => (v ? `${v.slice(0, 3)}***${v.slice(-4)}` : 'undefined');

// Ensure environment variables load from project root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '..', '.env');
console.log('🔧 PaymentGateway env load', { envPath, exists: fs.existsSync(envPath) });
const dotenvResult = dotenv.config({ path: envPath });
console.log('🔧 Dotenv loaded', { 
  error: dotenvResult.error ? dotenvResult.error.message : null, 
  hasRazorpayKey: !!(dotenvResult.parsed && dotenvResult.parsed.RAZORPAY_KEY_ID),
  hasRazorpaySecret: !!(dotenvResult.parsed && dotenvResult.parsed.RAZORPAY_KEY_SECRET)
});
console.log('🔑 Razorpay env in service', {
  hasKey: !!process.env.RAZORPAY_KEY_ID,
  hasSecret: !!process.env.RAZORPAY_KEY_SECRET
});

// Initialize payment gateways
let razorpayInstance = null;
let stripeInstance = null;

// Initialize Razorpay
const resolvedRazorpayKeyId = process.env.RAZORPAY_KEY_ID || (dotenvResult.parsed && dotenvResult.parsed.RAZORPAY_KEY_ID);
const resolvedRazorpaySecret = process.env.RAZORPAY_KEY_SECRET || (dotenvResult.parsed && dotenvResult.parsed.RAZORPAY_KEY_SECRET);
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
    `envPath=${envPath}`
  );
}

// Initialize Stripe
if (process.env.STRIPE_SECRET_KEY) {
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
  console.log('✅ Stripe initialized');
} else {
  console.warn('⚠️ Stripe credentials not configured');
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
    if (!razorpayInstance) {
      throw new Error('Razorpay not configured');
    }

    // Ensure amount is in paise (multiply by 100 for decimal prices)
    const amountInPaise = Math.round(orderData.amount * 100);
    
    const options = {
      amount: amountInPaise,
      currency: orderData.currency || 'INR',
      receipt: orderData.receipt || `order_${Date.now()}`,
      notes: orderData.notes || {},
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
  // STRIPE METHODS
  // ============================================================================

  /**
   * Create Stripe payment intent
   */
  async createStripePaymentIntent(orderData) {
    if (!stripeInstance) {
      throw new Error('Stripe not configured');
    }

    try {
      const paymentIntent = await stripeInstance.paymentIntents.create({
        amount: Math.round(orderData.amount * 100), // Amount in cents
        currency: orderData.currency || 'inr',
        metadata: orderData.metadata || {},
        description: orderData.description
      });

      return {
        success: true,
        gateway: 'stripe',
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('Stripe payment intent error:', error);
      throw error;
    }
  }

  /**
   * Confirm Stripe payment
   */
  async confirmStripePayment(paymentIntentId) {
    if (!stripeInstance) {
      throw new Error('Stripe not configured');
    }

    try {
      const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);
      return {
        success: true,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency
      };
    } catch (error) {
      console.error('Stripe payment confirmation error:', error);
      throw error;
    }
  }

  /**
   * Create Stripe refund
   */
  async createStripeRefund(paymentIntentId, amount = null) {
    if (!stripeInstance) {
      throw new Error('Stripe not configured');
    }

    try {
      const refund = await stripeInstance.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status
      };
    } catch (error) {
      console.error('Stripe refund error:', error);
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

  /**
   * Verify Stripe webhook signature
   */
  verifyStripeWebhook(body, signature) {
    if (!stripeInstance || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe webhook secret not configured');
    }

    try {
      const event = stripeInstance.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return event;
    } catch (error) {
      console.error('Stripe webhook verification error:', error);
      throw error;
    }
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
