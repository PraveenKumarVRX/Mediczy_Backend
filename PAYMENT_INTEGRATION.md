# Razorpay Payment Integration

## Overview

The Mediczy platform now supports complete payment processing through Razorpay. This integration includes:

- ✅ Payment order creation
- ✅ Payment verification with signature validation
- ✅ Transaction management and tracking
- ✅ Refund processing
- ✅ Multiple payment methods (Credit Card, UPI, Net Banking, Wallets)
- ✅ Webhook handling for real-time updates
- ✅ Payment gateway configuration
- ✅ Comprehensive payment analytics

## Architecture

### Backend Components

1. **Payment Service** (`server/services/payment.service.js`)
   - Razorpay SDK initialization
   - Order creation and management
   - Payment verification
   - Refund processing
   - Webhook signature validation

2. **Payment Controller** (`server/controller/payment.controller.js`)
   - Request handling and validation
   - Transaction management
   - Statistics calculation
   - Gateway configuration

3. **Payment Routes** (`server/routes/payment.route.js`)
   - RESTful API endpoints
   - Authentication middleware
   - Public webhook endpoint

4. **Database Models** (`server/db/intelligent-db-adapter.js`)
   - PaymentTransaction model
   - PaymentGateway model
   - In-memory storage with full CRUD operations

### Frontend Components

1. **Razorpay Utility** (`client/src/utils/razorpay.ts`)
   - Razorpay SDK loading
   - Checkout modal integration
   - API communication
   - TypeScript type definitions

2. **Payment Management UI** (`client/src/pages/admin/PaymentManagement.tsx`)
   - Transaction listing and filtering
   - Payment gateway management
   - Analytics dashboard
   - Refund processing UI

## Setup Instructions

### 1. Get Razorpay Credentials

1. Sign up at [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings** → **API Keys**
3. Generate API keys for **Test Mode**
4. Copy the Key ID and Key Secret

### 2. Configure Environment Variables

Add the following to your `server/.env` file:

```bash
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
```

**Important**: 
- For production, use live mode keys (starting with `rzp_live_`)
- Generate webhook secret from Razorpay Dashboard → Webhooks → Add New Webhook
- Never commit real keys to version control

### 3. Install Dependencies

The Razorpay SDK is already installed. If you need to reinstall:

```bash
cd server
npm install razorpay
```

### 4. Configure Webhooks

1. Go to Razorpay Dashboard → **Webhooks**
2. Add webhook URL: `https://your-domain.com/api/payments/webhook`
3. Select events to track:
   - `payment.captured`
   - `payment.failed`
   - `refund.created`
   - `order.paid`
4. Copy the webhook secret and add to `.env`

### 5. Start the Server

```bash
cd server
npm start
```

The payment routes will be available at `http://localhost:8000/api/payments`

## API Endpoints

### Create Payment Order
```http
POST /api/payments/order
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 1000,
  "currency": "INR",
  "clientType": "user",
  "clientId": "user_123",
  "clientName": "John Doe",
  "description": "Consultation fee",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "order_xxxxx",
    "amount": 100000,
    "currency": "INR",
    "receipt": "rcpt_xxxxx"
  },
  "transaction": {
    "id": "txn_xxxxx",
    "status": "pending",
    "amount": 1000
  },
  "gatewayConfig": {
    "keyId": "rzp_test_xxxxx",
    "currency": "INR",
    "name": "Mediczy"
  }
}
```

### Verify Payment
```http
POST /api/payments/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "signature_xxxxx"
}
```

### Get Transactions
```http
GET /api/payments/transactions?status=completed&clientType=user&limit=50
Authorization: Bearer <token>
```

### Get Transaction by ID
```http
GET /api/payments/transactions/:id
Authorization: Bearer <token>
```

### Create Refund
```http
POST /api/payments/refund
Authorization: Bearer <token>
Content-Type: application/json

{
  "transactionId": "txn_xxxxx",
  "amount": 500,
  "reason": "Cancellation requested",
  "speed": "normal"
}
```

### Get Gateways
```http
GET /api/payments/gateways
Authorization: Bearer <token>
```

### Update Gateway
```http
PUT /api/payments/gateways/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "isEnabled": true,
  "processingFee": 2.5
}
```

### Get Statistics
```http
GET /api/payments/stats?clientType=user
Authorization: Bearer <token>
```

### Webhook Endpoint (Public)
```http
POST /api/payments/webhook
X-Razorpay-Signature: <signature>
Content-Type: application/json

{
  "event": "payment.captured",
  "payload": { ... }
}
```

### Get Razorpay Config (Public)
```http
GET /api/payments/config
```

## Frontend Integration

### 1. Import Razorpay Utilities

```typescript
import {
  createPaymentOrder,
  openRazorpayCheckout,
  verifyPayment
} from '@/utils/razorpay';
```

### 2. Create Payment Flow

```typescript
const handlePayment = async () => {
  try {
    // 1. Create order
    const orderData = {
      amount: 1000, // Amount in INR
      currency: 'INR',
      clientType: 'user',
      clientId: 'user_123',
      clientName: 'John Doe',
      description: 'Consultation fee'
    };

    const token = localStorage.getItem('token');
    const orderResponse = await createPaymentOrder(orderData, token);

    // 2. Open Razorpay checkout
    await openRazorpayCheckout(orderResponse, {
      prefill: {
        name: 'John Doe',
        email: 'john@example.com',
        contact: '+919876543210'
      },
      onSuccess: async (response) => {
        // 3. Verify payment
        await verifyPayment(response, token);
        console.log('Payment successful!');
      },
      onFailure: (error) => {
        console.error('Payment failed:', error);
      }
    });
  } catch (error) {
    console.error('Payment error:', error);
  }
};
```

### 3. Access Payment Management

Navigate to: `http://localhost:9443/admin/payment-management`

**Features:**
- View all transactions with filtering
- Monitor payment statistics
- Process refunds
- Configure payment gateways
- View payment analytics

## Testing

### Test Cards (Razorpay Test Mode)

Use these test cards for testing payments:

**Successful Payment:**
- Card Number: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date

**Failed Payment:**
- Card Number: `4000 0000 0000 0002`
- CVV: Any 3 digits
- Expiry: Any future date

**UPI Test:**
- UPI ID: `success@razorpay`

### Test Workflow

1. **Create a test order:**
```bash
curl -X POST http://localhost:8000/api/payments/order \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "currency": "INR",
    "clientType": "user",
    "clientId": "test_001",
    "clientName": "Test User",
    "description": "Test payment"
  }'
```

2. **View transaction in admin dashboard:**
   - Go to Payment Management
   - Check Transactions tab
   - Verify order is in "pending" state

3. **Complete payment using Razorpay checkout:**
   - Use test card details
   - Complete payment flow

4. **Verify webhook received:**
   - Check server logs for webhook event
   - Verify transaction status updated to "completed"

5. **Test refund:**
   - Click refund button in admin dashboard
   - Verify refund processed successfully

## Security Best Practices

1. **Never expose secrets in frontend:**
   - Only use Key ID in frontend
   - Keep Key Secret on backend only
   - Validate webhook signatures

2. **Always verify payments:**
   - Never trust frontend payment status
   - Always verify with Razorpay signature
   - Store verification results in database

3. **Use HTTPS in production:**
   - Razorpay requires HTTPS for webhooks
   - Enable SSL/TLS on your server

4. **Implement proper error handling:**
   - Log all payment errors
   - Notify admins of failed payments
   - Provide clear user feedback

5. **Regular audits:**
   - Reconcile payments daily
   - Monitor suspicious activities
   - Review transaction logs

## Payment Flow Diagram

```
┌─────────┐                ┌─────────┐                ┌──────────┐
│ Client  │                │ Backend │                │ Razorpay │
└────┬────┘                └────┬────┘                └────┬─────┘
     │                          │                          │
     │ 1. Create Order          │                          │
     ├─────────────────────────>│                          │
     │                          │ 2. Create Razorpay Order │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │ 3. Order Created         │
     │                          │<─────────────────────────┤
     │ 4. Order + Config        │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │ 5. Open Checkout         │                          │
     ├──────────────────────────┼─────────────────────────>│
     │                          │                          │
     │ 6. User enters details   │                          │
     │                          │                          │
     │ 7. Payment Success       │                          │
     │<─────────────────────────┼──────────────────────────┤
     │                          │                          │
     │ 8. Verify Payment        │                          │
     ├─────────────────────────>│                          │
     │                          │ 9. Verify Signature      │
     │                          │                          │
     │                          │ 10. Update Transaction   │
     │                          │                          │
     │ 11. Success Response     │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │                          │ 12. Webhook (async)      │
     │                          │<─────────────────────────┤
     │                          │                          │
     │                          │ 13. Verify & Process     │
     │                          │                          │
```

## Webhook Events

The system handles these Razorpay webhook events:

1. **payment.captured** - Payment successfully captured
2. **payment.failed** - Payment failed
3. **refund.created** - Refund initiated
4. **refund.speed_changed** - Refund processing speed changed
5. **order.paid** - Order fully paid

## Fee Structure

Default Razorpay fees (configurable per gateway):

- **Credit/Debit Cards:** 2.36% + GST
- **UPI:** 0.99% + GST
- **Net Banking:** 1.99% + GST
- **Wallets:** 1.75% + GST

The system automatically calculates net amount after fees.

## Transaction States

1. **pending** - Order created, payment not completed
2. **completed** - Payment successful and verified
3. **failed** - Payment failed
4. **cancelled** - Order cancelled by user
5. **refunded** - Amount refunded to customer

## Support

For issues or questions:
- Check server logs for errors
- Review Razorpay Dashboard for payment details
- Test with Razorpay test credentials first
- Contact Razorpay support for API issues

## Migration to Production

1. Switch to live mode keys in `.env`
2. Update webhook URL to production domain
3. Enable HTTPS/SSL
4. Test with small real transactions
5. Monitor logs for first few days
6. Set up alerts for failed payments
7. Configure daily reconciliation

## Additional Resources

- [Razorpay Documentation](https://razorpay.com/docs/)
- [Razorpay API Reference](https://razorpay.com/docs/api/)
- [Razorpay Test Cards](https://razorpay.com/docs/payments/payments/test-card-details/)
- [Razorpay Webhooks](https://razorpay.com/docs/webhooks/)
