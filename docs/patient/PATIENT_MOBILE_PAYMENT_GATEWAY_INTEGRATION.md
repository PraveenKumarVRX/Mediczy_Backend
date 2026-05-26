# Patient Mobile App Payment Gateway Integration

Base URL:

```text
https://app.mediqzy.com/api
```

Auth header for protected APIs:

```http
Authorization: Bearer <patient_jwt_token>
Content-Type: application/json
```

## Amount Units — Read This First

Different endpoints return `amount` in different units. Using the wrong one will cause a 100× overcharge.

| Flow | `amount` field | Use for checkout |
|------|---------------|-----------------|
| Billing (`/billing/payments/razorpay/create`) | **Rupees** | `amount * 100` |
| Health Coins (`/wallet/create-order`) | **Rupees** (`amount`) | `amountInPaise` directly, or `amount * 100` |
| Appointment (`/consultation/payment/initiate/:id`) | **Paise** (from Razorpay) | `order.amount` as-is — do NOT multiply by 100 |
| Membership (`/membership/payment-order`) | **Paise** (from Razorpay) | `order.amount` as-is — do NOT multiply by 100 |

Both appointment and membership responses also include an `amountINR` field (rupees) — use it for display only.

---

## Razorpay Config

Use this public endpoint to fetch the active Razorpay key for the mobile checkout SDK.

```http
GET /payments/config
```

Response:

```json
{
  "success": true,
  "keyId": "rzp_live_xxx",
  "currency": "INR"
}
```

Use `keyId` as the Razorpay checkout key.

---

## Billing Payments

Use this flow for lab orders, pharmacy orders, and billing checkout.

### Create Razorpay Order

```http
POST /billing/payments/razorpay/create
```

Body:

```json
{
  "orderId": "123",
  "amount": 500,
  "currency": "INR"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "orderId": "order_xxx",
    "amount": 500,
    "amountInPaise": 50000,
    "currency": "INR",
    "paymentId": 10,
    "key": "rzp_live_xxx"
  }
}
```

`amount` is in **rupees**. Open Razorpay checkout using:

```js
{
  key: data.key,
  amount: data.amount * 100,   // convert rupees → paise
  currency: data.currency,
  order_id: data.orderId,
  name: "Mediqzy"
}
```

### Verify Payment

Call this API after Razorpay returns success in the mobile SDK callback.

```http
POST /billing/payments/razorpay/verify
```

Body (camelCase — billing only):

```json
{
  "orderId": "123",
  "razorpayOrderId": "order_xxx",
  "razorpayPaymentId": "pay_xxx",
  "razorpaySignature": "signature_xxx"
}
```

Success response:

```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "payment": {}
  }
}
```

---

## Health Coins Purchase

### Create Order

```http
POST /wallet/create-order
```

Body:

```json
{
  "packageId": 1,
  "couponCode": "WELCOME50"
}
```

`couponCode` is optional.

Response (paid package):

```json
{
  "success": true,
  "order": {
    "orderId": "order_xxx",
    "amount": 99,
    "amountInPaise": 9900,
    "currency": "INR",
    "key": "rzp_live_xxx"
  },
  "package": { "coins": 100, "price": 99 },
  "coupon": { "code": "WELCOME50", "discount": 49.5, "bonusHC": 0, "finalAmount": 49.5 }
}
```

**Free package edge case**: When a `FREE_HC` coupon makes `finalAmount = 0`, `order` will be `null`. No Razorpay checkout should be opened — coins are credited immediately. Check `order !== null` before opening checkout.

```js
if (response.order) {
  // open Razorpay checkout with response.order.amountInPaise
} else {
  // free — coins already credited
}
```

Open Razorpay checkout using:

```js
{
  key: order.key,
  amount: order.amountInPaise,   // already in paise
  currency: order.currency,
  order_id: order.orderId,
  name: "Mediqzy"
}
```

### Verify Payment

```http
POST /wallet/verify-payment
```

Body (snake_case):

```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx",
  "packageId": 1,
  "couponCode": "WELCOME50"
}
```

---

## Appointment Razorpay Payment

### Initiate Payment

```http
POST /consultation/payment/initiate/:appointmentId
```

Response:

```json
{
  "success": true,
  "order": {
    "id": "order_xxx",
    "amount": 50000,
    "amountINR": 500.00,
    "currency": "INR",
    "receipt": "apt_123_1716000000000"
  },
  "appointment": {
    "id": 123,
    "doctorName": "Dr. Smith",
    "date": "2026-06-01",
    "time": "10:00 AM",
    "consultationFee": 500
  },
  "gatewayConfig": {
    "keyId": "rzp_live_xxx",
    "currency": "INR"
  }
}
```

`order.amount` is in **paise** (Razorpay native). Use `order.amountINR` for display. Open Razorpay checkout using:

```js
{
  key: gatewayConfig.keyId,
  amount: order.amount,    // already in paise — do NOT multiply by 100
  currency: order.currency,
  order_id: order.id,
  name: "Mediqzy"
}
```

### Verify Appointment Payment

```http
POST /consultation/payment/verify/:appointmentId
```

Body (snake_case — different from billing):

```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx"
}
```

---

## Membership Upgrade Payment

### Create Membership Payment Order

```http
POST /membership/payment-order
```

Body:

```json
{
  "amount": 1536,
  "planId": 5,
  "planName": "Gold"
}
```

`amount` here is in **rupees** (the plan price you show the user).

Response:

```json
{
  "success": true,
  "order": {
    "id": "order_xxx",
    "amount": 153600,
    "amountINR": 1536.00,
    "amountInPaise": 153600,
    "currency": "INR"
  },
  "gatewayConfig": {
    "keyId": "rzp_live_xxx",
    "currency": "INR"
  },
  "transaction": {
    "description": "Upgrade to Gold"
  }
}
```

`order.amount` is in **paise**. Open Razorpay checkout using:

```js
{
  key: gatewayConfig.keyId,
  amount: order.amount,    // already in paise — do NOT multiply by 100
  currency: order.currency,
  order_id: order.id,
  name: "Mediqzy"
}
```

### Confirm Upgrade

```http
POST /membership/upgrade/:newPlanId
```

Body (snake_case):

```json
{
  "razorpay_payment_id": "pay_xxx",
  "razorpay_order_id": "order_xxx",
  "razorpay_signature": "signature_xxx"
}
```

---

## Verify Body Field Names Summary

The field naming convention differs between billing and all other flows.

| Flow | Field naming |
|------|-------------|
| Billing verify | camelCase: `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature` |
| Appointment verify | snake_case: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` |
| Membership upgrade | snake_case: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` |
| Wallet verify | snake_case: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` |

---

## Mobile Flow Summary

1. Call the relevant backend create-order API.
2. Check the [Amount Units table](#amount-units--read-this-first) to determine whether to pass `amount` as-is or multiply by 100.
3. Open Razorpay checkout using the backend `key`/`keyId`, correct amount in paise, `orderId`/`id`, and `currency`.
4. On Razorpay success callback, send payment IDs and signature to the relevant backend verify API using the correct field name casing (see [Verify Body Field Names Summary](#verify-body-field-names-summary)).
5. Backend verifies the Razorpay signature and marks payment/order as successful.
6. Do not treat mobile-side success as final until backend verification succeeds.

## Webhook

Configured in Razorpay dashboard:

```text
https://app.mediqzy.com/api/payments/webhook
```

The mobile app does not call this URL. Razorpay calls it server-to-server.
