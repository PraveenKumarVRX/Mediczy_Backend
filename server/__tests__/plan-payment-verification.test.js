import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Audit M18: paid plans must not be buyable cheaply or for free. Before this,
 * /membership/subscribe accepted any string as a payment id, and
 * /membership/upgrade trusted any validly-signed payment — including a ₹1 order
 * or someone else's payment. Each attack below must be refused; the honest
 * payment must still go through.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { verifyPlanPayment } = await import('../services/plan-payment-verification.service.js');

const USER = 501;
const PLAN = 7;
const honestOrder = { id: 'order_1', amount: 499900, notes: { userId: String(USER), planId: String(PLAN) } };
const honestPayment = { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 499900 };

function deps({ signatureOk = true, payment = honestPayment, order = honestOrder, used = null, lookupFails = false } = {}) {
  return {
    paymentService: {
      verifyPaymentSignature: jest.fn(() => signatureOk),
      fetchPayment: jest.fn(async () => (lookupFails ? { success: false } : { success: true, payment })),
      fetchOrder: jest.fn(async () => (lookupFails ? { success: false } : { success: true, order })),
    },
    UserPlan: { findOne: jest.fn(async () => used) },
  };
}
const input = (over = {}) => ({ userId: USER, planId: PLAN, amountDueINR: 4999, orderId: 'order_1', paymentId: 'pay_1', signature: 'sig', ...over });

describe('an honest payment', () => {
  it('activates: signed, captured, enough, for this user and plan, not used before', async () => {
    await expect(verifyPlanPayment(input(), deps())).resolves.toEqual({ ok: true, paymentId: 'pay_1', amountPaidINR: 4999 });
  });

  it('a payment above the amount due is accepted (e.g. rounding up)', async () => {
    await expect(verifyPlanPayment(input({ amountDueINR: 4998.5 }), deps())).resolves.toMatchObject({ ok: true });
  });
});

describe('attacks that used to work', () => {
  it('a made-up payment id with no order or signature', async () => {
    const d = deps();
    await expect(verifyPlanPayment(input({ orderId: undefined, signature: undefined, paymentId: 'pay_FAKE' }), d))
      .resolves.toMatchObject({ ok: false, code: 'PAYMENT_REQUIRED' });
    expect(d.paymentService.fetchPayment).not.toHaveBeenCalled();
  });

  it('a forged signature', async () => {
    await expect(verifyPlanPayment(input(), deps({ signatureOk: false }))).resolves.toMatchObject({ ok: false, code: 'PAYMENT_VERIFICATION_FAILED' });
  });

  it('a genuine ₹1 order against a ₹4,999 plan', async () => {
    const rupee = deps({ payment: { ...honestPayment, amount: 100 }, order: { ...honestOrder, amount: 100 } });
    await expect(verifyPlanPayment(input(), rupee)).resolves.toMatchObject({ ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' });
  });

  it('someone else\'s genuine payment replayed on another account', async () => {
    const theirs = deps({ order: { ...honestOrder, notes: { userId: '999', planId: String(PLAN) } } });
    await expect(verifyPlanPayment(input(), theirs)).resolves.toMatchObject({ ok: false, code: 'PAYMENT_NOT_FOR_THIS_PLAN' });
  });

  it('a payment made for a cheaper plan, used for a dearer one', async () => {
    const other = deps({ order: { ...honestOrder, notes: { userId: String(USER), planId: '3' } } });
    await expect(verifyPlanPayment(input(), other)).resolves.toMatchObject({ ok: false, code: 'PAYMENT_NOT_FOR_THIS_PLAN' });
  });

  it('an order with no notes (not made by our payment-order)', async () => {
    await expect(verifyPlanPayment(input(), deps({ order: { ...honestOrder, notes: undefined } }))).resolves.toMatchObject({ ok: false, code: 'PAYMENT_NOT_FOR_THIS_PLAN' });
  });

  it('the same payment used twice', async () => {
    await expect(verifyPlanPayment(input(), deps({ used: { id: 42 } }))).resolves.toMatchObject({ ok: false, code: 'PAYMENT_ALREADY_USED', status: 409 });
  });

  it('a payment that failed or belongs to another order', async () => {
    await expect(verifyPlanPayment(input(), deps({ payment: { ...honestPayment, status: 'failed' } }))).resolves.toMatchObject({ ok: false, code: 'PAYMENT_NOT_COMPLETED' });
    await expect(verifyPlanPayment(input(), deps({ payment: { ...honestPayment, order_id: 'order_OTHER' } }))).resolves.toMatchObject({ ok: false, code: 'PAYMENT_NOT_COMPLETED' });
  });
});

describe('when Razorpay cannot be reached', () => {
  it('refuses with a retryable 503 rather than activating', async () => {
    await expect(verifyPlanPayment(input(), deps({ lookupFails: true }))).resolves.toMatchObject({ ok: false, code: 'PAYMENT_LOOKUP_FAILED', status: 503 });
  });
});

describe('the routes use it', () => {
  const src = readFileSync(join(ROOT, 'routes/membership.route.js'), 'utf8');
  const route = (marker) => src.slice(src.indexOf(marker), src.indexOf('\nrouter.', src.indexOf(marker) + 10));

  it('subscribe verifies before activating a paid plan, and records the payment id', () => {
    const subscribe = route("router.post('/subscribe/:planId'");
    expect(subscribe).toMatch(/verifyPlanPayment\(/);
    expect(subscribe).toMatch(/paymentId: verifiedPaymentId/);
    expect(subscribe.indexOf('verifyPlanPayment(')).toBeLessThan(subscribe.indexOf('UserPlan.create('));
  });

  it('upgrade verifies amount, owner and plan, not just the signature', () => {
    const upgrade = route("router.post('/upgrade/:newPlanId'");
    expect(upgrade).toMatch(/verifyPlanPayment\(/);
    expect(upgrade).not.toMatch(/const isValid = paymentService\.verifyPaymentSignature/);
  });
});
