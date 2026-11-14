/**
 * The one check every paid plan activation must pass (audit M18).
 *
 * Before 2026-11-14, POST /membership/subscribe/:planId accepted any string as
 * razorpay_payment_id and recorded the full plan price as paid, and
 * POST /membership/upgrade/:newPlanId verified only the Razorpay signature —
 * which proves a payment belongs to an order, not that the order was for this
 * user, this plan, or enough money. /membership/payment-order creates orders
 * for whatever amount the app sends, so a ₹1 order could activate any plan,
 * and one person's payment could be replayed by another account.
 *
 * A payment now activates a plan only when all of these hold:
 *   1. the signature over order_id|payment_id verifies (our Razorpay secret)
 *   2. Razorpay reports the payment captured or authorised, for that order
 *   3. the amount paid covers what the server says is due (in paise)
 *   4. the order was created by our payment-order for this user and this plan
 *      (its notes carry userId and planId)
 *   5. the payment has not already activated a plan
 *
 * Returns { ok: true, paymentId, amountPaidINR } or { ok: false, status, code, message }.
 */

const refuse = (code, message, status = 400) => ({ ok: false, status, code, message });

/**
 * @param {object} input
 * @param {number} input.userId
 * @param {number|string} input.planId
 * @param {number} input.amountDueINR      what the server computed is due
 * @param {string} input.orderId           razorpay_order_id
 * @param {string} input.paymentId         razorpay_payment_id
 * @param {string} input.signature         razorpay_signature
 * @param {object} deps                    { paymentService, UserPlan } (injected for tests)
 */
export async function verifyPlanPayment({ userId, planId, amountDueINR, orderId, paymentId, signature }, { paymentService, UserPlan }) {
  if (!orderId || !paymentId || !signature) {
    return refuse('PAYMENT_REQUIRED', 'Please complete payment to activate this plan.');
  }
  if (!paymentService.verifyPaymentSignature({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature })) {
    return refuse('PAYMENT_VERIFICATION_FAILED', 'We could not verify that payment. Please try again.');
  }

  const [paymentResult, orderResult] = await Promise.all([
    paymentService.fetchPayment(paymentId).catch(() => null),
    paymentService.fetchOrder(orderId).catch(() => null),
  ]);
  const payment = paymentResult?.success ? paymentResult.payment : null;
  const order = orderResult?.success ? orderResult.order : null;
  if (!payment || !order) {
    return refuse('PAYMENT_LOOKUP_FAILED', 'We could not confirm that payment with the bank right now. Please try again in a minute.', 503);
  }
  if (!['captured', 'authorized'].includes(String(payment.status)) || payment.order_id !== orderId) {
    return refuse('PAYMENT_NOT_COMPLETED', 'That payment has not completed yet. Please try again.');
  }

  // Razorpay amounts are integer paise; compare in paise to avoid float drift.
  const duePaise = Math.round(Number(amountDueINR) * 100);
  if (!(Number(payment.amount) >= duePaise)) {
    console.warn(`[plan-payment] amount short for user ${userId}, plan ${planId}: paid ${payment.amount} paise, due ${duePaise}`);
    return refuse('PAYMENT_AMOUNT_MISMATCH', 'The payment amount does not match this plan.');
  }

  const notes = order.notes || {};
  if (String(notes.userId) !== String(userId) || String(notes.planId) !== String(planId)) {
    console.warn(`[plan-payment] order ${orderId} belongs to user ${notes.userId}/plan ${notes.planId}, used by user ${userId} for plan ${planId}`);
    return refuse('PAYMENT_NOT_FOR_THIS_PLAN', 'That payment was made for a different plan or account.');
  }

  const alreadyUsed = await UserPlan.findOne({ where: { paymentId }, attributes: ['id'] });
  if (alreadyUsed) {
    console.warn(`[plan-payment] payment ${paymentId} replayed by user ${userId} (already on user_plans ${alreadyUsed.id})`);
    return refuse('PAYMENT_ALREADY_USED', 'That payment has already been used to activate a plan.', 409);
  }

  return { ok: true, paymentId, amountPaidINR: Number(payment.amount) / 100 };
}

export default { verifyPlanPayment };
