# Payment Integration for Device Subscriptions

## Overview
Integrate Razorpay for device subscription payments, AMC renewals, and plan upgrades.

---

## 1. Razorpay Setup

### Install Razorpay SDK
```bash
npm install razorpay
```

### Environment Variables
Add to `.env`:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxx
```

---

## 2. Payment Service

**File:** `server/services/payment.service.js`

```javascript
import Razorpay from 'razorpay';
import crypto from 'crypto';

class PaymentService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }

  /**
   * Create order for device purchase
   */
  async createDeviceOrder(deviceId, amount, metadata) {
    try {
      const order = await this.razorpay.orders.create({
        amount: amount * 100, // Convert to paise
        currency: 'INR',
        receipt: `device_${deviceId}_${Date.now()}`,
        notes: {
          type: 'device_purchase',
          device_id: deviceId,
          ...metadata
        }
      });

      return {
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency
      };
    } catch (error) {
      console.error('Razorpay order creation failed:', error);
      throw error;
    }
  }

  /**
   * Create order for AMC renewal
   */
  async createAMCRenewalOrder(deviceId, amount, metadata) {
    try {
      const order = await this.razorpay.orders.create({
        amount: amount * 100,
        currency: 'INR',
        receipt: `amc_${deviceId}_${Date.now()}`,
        notes: {
          type: 'amc_renewal',
          device_id: deviceId,
          ...metadata
        }
      });

      return {
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency
      };
    } catch (error) {
      console.error('AMC order creation failed:', error);
      throw error;
    }
  }

  /**
   * Create subscription for recurring payments
   */
  async createSubscription(deviceId, plan, metadata) {
    try {
      // Create plan first (do this once for each plan)
      const planData = await this.razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: `Mediczy ${plan} Plan`,
          amount: metadata.monthly_fee * 100,
          currency: 'INR'
        }
      });

      // Create subscription
      const subscription = await this.razorpay.subscriptions.create({
        plan_id: planData.id,
        customer_notify: 1,
        total_count: 12, // 12 months
        notes: {
          device_id: deviceId,
          plan: plan,
          ...metadata
        }
      });

      return {
        success: true,
        subscription_id: subscription.id,
        plan_id: planData.id,
        status: subscription.status
      };
    } catch (error) {
      console.error('Subscription creation failed:', error);
      throw error;
    }
  }

  /**
   * Verify payment signature
   */
  verifyPaymentSignature(orderId, paymentId, signature) {
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature) {
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId) {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      console.error('Failed to fetch payment:', error);
      throw error;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentId, amount = null) {
    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: amount ? amount * 100 : undefined // Full refund if amount not specified
      });
      return refund;
    } catch (error) {
      console.error('Refund failed:', error);
      throw error;
    }
  }
}

export default new PaymentService();
```

---

## 3. Payment Routes

**File:** `server/routes/payment.route.js`

```javascript
import express from 'express';
import paymentService from '../services/payment.service.js';
import Device from '../models/postgres/device.model.postgres.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * POST /api/payments/device/:id/create-order
 * Create payment order for device purchase
 */
router.post('/device/:id/create-order', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findByPk(id);

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const totalAmount = device.device_cost + device.amc_annual_fee;

    const order = await paymentService.createDeviceOrder(device.id, totalAmount, {
      device_name: device.device_name,
      plan: device.subscription_plan,
      tenant_id: req.user.tenant_id
    });

    res.json({
      success: true,
      order,
      device: {
        id: device.id,
        name: device.device_name,
        amount: totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

/**
 * POST /api/payments/device/:id/renew-amc-order
 * Create payment order for AMC renewal
 */
router.post('/device/:id/renew-amc-order', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findByPk(id);

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const order = await paymentService.createAMCRenewalOrder(
      device.id,
      device.amc_annual_fee,
      {
        device_name: device.device_name,
        tenant_id: req.user.tenant_id
      }
    );

    res.json({
      success: true,
      order,
      device: {
        id: device.id,
        name: device.device_name,
        amc_fee: device.amc_annual_fee
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create AMC order',
      error: error.message
    });
  }
});

/**
 * POST /api/payments/verify
 * Verify payment and update device
 */
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { order_id, payment_id, signature, device_id, type } = req.body;

    // Verify signature
    const isValid = paymentService.verifyPaymentSignature(
      order_id,
      payment_id,
      signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Get payment details
    const payment = await paymentService.getPayment(payment_id);

    if (payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        message: 'Payment not captured'
      });
    }

    // Update device based on payment type
    const device = await Device.findByPk(device_id);

    if (type === 'amc_renewal') {
      const now = new Date();
      const amcEnd = new Date();
      amcEnd.setFullYear(amcEnd.getFullYear() + 1);

      await device.update({
        amc_active: true,
        amc_start_date: now,
        amc_end_date: amcEnd,
        amc_renewal_date: amcEnd
      });
    } else if (type === 'device_purchase') {
      await device.update({
        status: 'active'
      });
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: {
        id: payment.id,
        amount: payment.amount / 100,
        status: payment.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
});

/**
 * POST /api/payments/webhook
 * Razorpay webhook handler
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(req.body, signature);

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        console.log('Payment captured:', event.payload.payment.entity.id);
        // Handle successful payment
        break;

      case 'payment.failed':
        console.log('Payment failed:', event.payload.payment.entity.id);
        // Handle failed payment
        break;

      case 'subscription.charged':
        console.log('Subscription charged:', event.payload.subscription.entity.id);
        // Handle subscription payment
        break;

      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

export default router;
```

---

## 4. Frontend Payment Component

**File:** `client/src/components/payments/RazorpayCheckout.tsx`

```typescript
import React from 'react';
import axios from 'axios';

interface RazorpayCheckoutProps {
  deviceId: number;
  amount: number;
  type: 'device_purchase' | 'amc_renewal';
  onSuccess: () => void;
  onFailure: (error: string) => void;
}

const RazorpayCheckout: React.FC<RazorpayCheckoutProps> = ({
  deviceId,
  amount,
  type,
  onSuccess,
  onFailure
}) => {
  const handlePayment = async () => {
    try {
      const token = localStorage.getItem('adminToken');

      // Create order
      const endpoint = type === 'amc_renewal'
        ? `/api/payments/device/${deviceId}/renew-amc-order`
        : `/api/payments/device/${deviceId}/create-order`;

      const orderResponse = await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!orderResponse.data.success) {
        throw new Error('Failed to create order');
      }

      const { order } = orderResponse.data;

      // Open Razorpay checkout
      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Mediczy',
        description: type === 'amc_renewal' ? 'AMC Renewal' : 'Device Purchase',
        handler: async function (response: any) {
          try {
            // Verify payment
            const verifyResponse = await axios.post(
              '/api/payments/verify',
              {
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                device_id: deviceId,
                type
              },
              {
                headers: { Authorization: `Bearer ${token}` }
              }
            );

            if (verifyResponse.data.success) {
              onSuccess();
            } else {
              onFailure('Payment verification failed');
            }
          } catch (error) {
            onFailure('Payment verification failed');
          }
        },
        prefill: {
          name: '',
          email: '',
          contact: ''
        },
        theme: {
          color: '#2563eb'
        }
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    } catch (error) {
      onFailure('Failed to initiate payment');
    }
  };

  return (
    <button
      onClick={handlePayment}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
      Pay ₹{amount.toLocaleString()}
    </button>
  );
};

export default RazorpayCheckout;
```

---

## 5. Add Razorpay Script to HTML

**File:** `client/public/index.html`

Add before closing `</body>`:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

---

## 6. Wire Payment Routes

**File:** `server/app.js`

```javascript
import paymentRouter from './routes/payment.route.js';

// Add route
app.use('/api/payments', paymentRouter);
```

---

## 7. Database Schema for Transactions

```javascript
// models/postgres/transaction.model.postgres.js
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  device_id: { type: DataTypes.INTEGER, references: { model: 'devices', key: 'id' } },
  tenant_id: { type: DataTypes.INTEGER, references: { model: 'tenants', key: 'id' } },
  order_id: { type: DataTypes.STRING, unique: true },
  payment_id: { type: DataTypes.STRING, unique: true },
  type: { type: DataTypes.ENUM('device_purchase', 'amc_renewal', 'subscription'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('created', 'pending', 'success', 'failed', 'refunded'), defaultValue: 'created' },
  payment_method: { type: DataTypes.STRING },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
});
```

---

## 8. Testing Payment Integration

### Test Mode (using Razorpay test keys)

**Test Cards:**
- Success: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date
- OTP: `123456`

**Test Flow:**
1. Register device
2. Click "Pay Now" button
3. Razorpay checkout opens
4. Enter test card details
5. Complete payment
6. Webhook receives event
7. Device/AMC activated

---

## 9. Webhook Configuration

**Razorpay Dashboard:**
1. Go to Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/payments/webhook`
3. Select events:
   - `payment.captured`
   - `payment.failed`
   - `subscription.charged`
   - `subscription.cancelled`

---

## 10. Production Checklist

- [ ] Replace test keys with live keys
- [ ] Configure webhook URL
- [ ] Test payment flow end-to-end
- [ ] Setup payment failure alerts
- [ ] Configure refund policy
- [ ] Add GST/tax calculations
- [ ] Setup invoice generation
- [ ] Add payment receipts via email
- [ ] Monitor failed transactions
- [ ] Setup payment reconciliation cron

---

## Revenue Tracking

With payment integration, track:
- Total payments received
- Failed payments
- Refund requests
- Subscription churn rate
- Average revenue per device
- Monthly recurring revenue (MRR)
- Annual recurring revenue (ARR)

**Dashboard Query:**
```javascript
const revenueStats = await Transaction.findAll({
  attributes: [
    [sequelize.fn('SUM', sequelize.col('amount')), 'total_revenue'],
    [sequelize.fn('COUNT', sequelize.col('id')), 'total_transactions']
  ],
  where: {
    status: 'success',
    createdAt: {
      [Op.gte]: new Date(new Date().setDate(1)) // This month
    }
  }
});
```
