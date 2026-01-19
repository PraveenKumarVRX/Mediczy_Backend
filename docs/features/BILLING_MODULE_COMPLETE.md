# Billing Module Implementation Complete

## Overview
Complete billing system with order management, invoices, payment gateway integration, and comprehensive transaction tracking.

## Database Models

### 1. Order Model (`billing.model.intelligent.js`)
- **orderNumber**: Unique order identifier
- **userId**: Customer reference
- **orderType**: membership, appointment, prescription, device, other
- **status**: pending, processing, completed, failed, cancelled, refunded
- **Pricing**: subtotal, tax, discount, total
- **Addresses**: billingAddress, shippingAddress (JSONB)
- **metadata**: Additional order information

### 2. Invoice Model
- **invoiceNumber**: INV-YYYYMM-timestamp
- **orderId**: Linked order
- **status**: draft, sent, paid, overdue, cancelled
- **lineItems**: Detailed breakdown (JSONB)
- **pdfUrl**: Generated invoice PDF path
- **customerDetails**, **companyDetails**: JSONB fields

### 3. Payment Model
- **gateway**: razorpay, stripe, paytm, phonepe, manual
- **gatewayOrderId**, **gatewayPaymentId**: Gateway references
- **status**: initiated, pending, authorized, captured, success, failed, refunded
- **method**: Payment method (UPI, card, net banking, etc.)
- **cardLast4**, **cardBrand**: Card information

### 4. Transaction Model
- **type**: credit, debit, refund, adjustment
- **balanceBefore**, **balanceAfter**: Ledger tracking
- **orderId**, **paymentId**: References

### 5. Refund Model
- **paymentId**: Original payment reference
- **amount**: Refund amount (partial or full)
- **status**: pending, processing, completed, failed
- **gatewayRefundId**: Gateway refund reference

## Payment Gateways

### Razorpay Integration
**Configuration**: `.env`
```env
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
```

**Methods**:
- `createRazorpayOrder(orderData)` - Create order on Razorpay
- `verifyRazorpaySignature(orderId, paymentId, signature)` - HMAC SHA256 verification
- `fetchRazorpayPayment(paymentId)` - Get payment details
- `createRazorpayRefund(paymentId, amount)` - Process refunds

**Payment Flow**:
1. Backend creates Razorpay order → Returns orderId
2. Frontend opens Razorpay checkout with order ID
3. User completes payment on Razorpay
4. Razorpay returns paymentId, signature
5. Backend verifies signature and updates payment status

### Stripe Integration
**Configuration**: `.env`
```env
STRIPE_SECRET_KEY=sk_test_xxx
```

**Methods**:
- `createStripePaymentIntent(orderData)` - Create payment intent
- `confirmStripePayment(paymentIntentId)` - Retrieve payment status
- `createStripeRefund(paymentIntentId, amount)` - Process refunds

## Invoice Generation

### PDF Invoice Service
**Features**:
- Professional A4 invoice layout
- Company branding and details
- Line items table with pricing breakdown
- Tax (GST) calculation
- Digital signature support
- Automatic file management

**Generated Files**:
- Invoices: `/uploads/invoices/invoice_{invoiceNumber}.pdf`
- Receipts: `/uploads/receipts/receipt_{paymentId}.pdf`

**Invoice Layout**:
- Header: Company name, logo, address, GSTIN
- Customer Info: Bill to section
- Line Items: Table with qty, price, amount
- Totals: Subtotal, discount, tax, grand total
- Footer: Notes and thank you message

## API Endpoints

### Order Management
```
POST   /api/billing/orders/create        - Create new order
GET    /api/billing/orders               - Get order history (paginated)
GET    /api/billing/orders/:orderId      - Get order details
```

### Razorpay Payment
```
POST   /api/billing/payments/razorpay/create  - Create Razorpay order
POST   /api/billing/payments/razorpay/verify  - Verify payment signature
```

### Stripe Payment
```
POST   /api/billing/payments/stripe/create    - Create payment intent
```

### Invoice Management
```
POST   /api/billing/invoices/generate         - Generate invoice for order
GET    /api/billing/invoices                  - Get user's invoices
GET    /api/billing/invoices/:id              - Get invoice details
GET    /api/billing/invoices/:id/download     - Download invoice PDF
```

### Transaction History
```
GET    /api/billing/transactions              - Get user's transactions
```

### Statistics
```
GET    /api/billing/stats                     - Get billing statistics
```

## Frontend Components

### 1. OrderCheckout (`/billing/checkout`)
**Features**:
- Order summary display
- Billing address form
- Payment gateway selection (Razorpay/Stripe)
- Razorpay checkout integration
- Payment success/failure handling
- Secure payment indicators

**Usage**:
```typescript
navigate('/billing/checkout', {
  state: {
    orderType: 'membership',
    itemId: planId,
    subtotal: 999,
    tax: 179.82,
    currency: 'INR',
    lineItems: [
      { name: 'Premium Plan', description: '1 year', quantity: 1, price: 999, amount: 999 }
    ]
  }
});
```

### 2. OrderHistory (`/billing/orders`)
**Features**:
- Paginated order list
- Filter by status, order type
- Search by order number
- Billing statistics cards
- Invoice download
- Order details view

**Table Columns**:
- Order Number
- Type (membership, appointment, etc.)
- Date
- Amount
- Status (with colored chips)
- Invoice (download button)
- Actions (view details)

### 3. OrderDetails (`/billing/orders/:orderId`)
**Features**:
- Complete order information
- Pricing breakdown
- Billing address display
- Payment information
- Invoice download
- Payment timeline

## Usage Examples

### Create Order and Process Payment

**Backend** (membership purchase):
```javascript
// In membership purchase controller
const order = await Order.create({
  orderNumber: paymentGateway.generateOrderReceipt('ORD'),
  userId: req.user.id,
  orderType: 'membership',
  itemId: planId,
  subtotal: planPrice,
  tax: planPrice * 0.18,
  total: planPrice * 1.18,
  currency: 'INR'
});

// Redirect to checkout
res.json({
  success: true,
  checkoutUrl: '/billing/checkout',
  orderData: order
});
```

**Frontend**:
```typescript
const handlePurchasePlan = async (planId: string, price: number) => {
  navigate('/billing/checkout', {
    state: {
      orderType: 'membership',
      itemId: planId,
      subtotal: price,
      tax: price * 0.18,
      lineItems: [
        { name: 'Membership Plan', description: '1 year access', quantity: 1, price, amount: price }
      ]
    }
  });
};
```

### Generate Invoice After Payment

```javascript
// In payment verification callback
if (payment.status === 'success') {
  // Update order
  await Order.update({ status: 'completed' }, { where: { id: orderId } });

  // Generate invoice
  const invoice = await Invoice.create({
    invoiceNumber: paymentGateway.generateInvoiceNumber(),
    orderId: order.id,
    userId: order.userId,
    issueDate: new Date(),
    status: 'paid',
    total: order.total,
    lineItems: [
      { name: 'Membership Plan', qty: 1, price: order.subtotal, amount: order.total }
    ]
  });

  // Generate PDF
  const pdf = await invoiceService.generateInvoicePDF(invoice);
  await invoice.update({ pdfUrl: pdf.url });
}
```

### Integration with Membership Purchase

```javascript
// When user subscribes to membership plan
const createMembershipOrder = async (userId, planId) => {
  const plan = await MembershipPlan.findByPk(planId);
  
  const order = await Order.create({
    orderNumber: paymentGateway.generateOrderReceipt('ORD'),
    userId: userId,
    orderType: 'membership',
    itemId: planId,
    subtotal: plan.price,
    tax: paymentGateway.calculateTax(plan.price),
    total: paymentGateway.calculateTotal(plan.price, plan.price * 0.18, 0),
    currency: 'INR',
    metadata: {
      planName: plan.name,
      duration: plan.duration
    }
  });

  return order;
};

// After payment success
const activateMembership = async (orderId) => {
  const order = await Order.findByPk(orderId);
  
  const userPlan = await UserPlan.create({
    userId: order.userId,
    planId: order.itemId,
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    status: 'active'
  });

  // Update user status
  await User.update({ status: 'active' }, { where: { id: order.userId } });
};
```

## Tax Calculation

**GST (18%)**:
```javascript
const tax = paymentGateway.calculateTax(subtotal, 18); // Default 18%
const total = paymentGateway.calculateTotal(subtotal, tax, discount);
```

## Security

### Payment Signature Verification
**Razorpay HMAC SHA256**:
```javascript
const isValid = paymentGateway.verifyRazorpaySignature(
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
);
```

### Webhook Verification
```javascript
// Razorpay webhook
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const isValid = paymentGateway.verifyRazorpayWebhook(requestBody, signature);

// Stripe webhook
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const isValid = paymentGateway.verifyStripeWebhook(requestBody, signature);
```

## Environment Variables

```env
# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Invoice Settings
COMPANY_NAME=MEDICZY
COMPANY_GSTIN=29XXXXX1234X1Z5
COMPANY_EMAIL=billing@mediczy.com
COMPANY_PHONE=+91-1234567890
```

## Testing

### Test Razorpay Integration
**Test Cards**:
- Success: 4111 1111 1111 1111
- Failure: 4000 0000 0000 0002

**Test UPI**: success@razorpay

### Create Test Order
```bash
curl -X POST http://localhost:8000/api/billing/orders/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "membership",
    "subtotal": 999,
    "tax": 179.82,
    "currency": "INR"
  }'
```

### Generate Test Invoice
```bash
curl -X POST http://localhost:8000/api/billing/invoices/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID",
    "lineItems": [
      {"name": "Test Item", "qty": 1, "price": 999, "amount": 999}
    ]
  }'
```

## Error Handling

### Common Errors
1. **Order Not Found**: Check orderId and userId match
2. **Payment Verification Failed**: Verify signature and gateway credentials
3. **Invoice Generation Failed**: Check pdfkit dependencies and file permissions
4. **Razorpay Order Creation Failed**: Verify API credentials

### Debug Mode
```javascript
// Enable detailed logging
console.log('Order created:', order.toJSON());
console.log('Payment verification:', { orderId, paymentId, signature });
console.log('Invoice generated:', invoice.pdfUrl);
```

## Next Steps

### TODO
1. ✅ Billing models and associations
2. ✅ Payment gateway service (Razorpay + Stripe)
3. ✅ Invoice PDF generation
4. ✅ API routes and controllers
5. ✅ Frontend components (checkout, history, details)
6. ⏳ Webhook handlers for payment confirmations
7. ⏳ Refund management UI
8. ⏳ Admin billing dashboard
9. ⏳ Payment analytics and reporting
10. ⏳ Automated invoice emails

### Future Enhancements
- UPI AutoPay for subscriptions
- International payment support
- Multi-currency billing
- Subscription management
- Installment payments
- Credit notes
- Payment reminders
- Invoice templates customization

## Production Checklist

- [ ] Configure production payment gateway credentials
- [ ] Set up webhook endpoints
- [ ] Test payment flows end-to-end
- [ ] Enable SSL/TLS for payment pages
- [ ] Set up automated invoice emails
- [ ] Configure backup for invoice PDFs
- [ ] Set up payment failure notifications
- [ ] Enable refund request workflow
- [ ] Configure tax rates by region
- [ ] Set up payment analytics dashboard

## Support

For issues or questions:
1. Check error logs in `/var/log/mediczy/`
2. Verify payment gateway credentials
3. Test with Razorpay test mode first
4. Check database connection for order/invoice records
5. Verify PDF generation dependencies (pdfkit, fonts)

---

**Implementation Status**: ✅ Complete
**Last Updated**: 2024-01-09
**Version**: 1.0.0
