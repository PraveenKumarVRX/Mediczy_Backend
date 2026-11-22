/**
 * Stuck-payment incident 2026-11-22: a member paid for Start, the app never called /subscribe, and
 * the account stayed locked. A plan order now activates from Razorpay itself (webhook, sign-in
 * reconcile, admin tool), with the same checks as the app path, exactly once per payment.
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const poolQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery } }));

const userPlans = [];
const planFindByPk = jest.fn();
const UserPlan = {
  findOne: jest.fn(async ({ where }) => {
    if (where.paymentId) return userPlans.find((p) => p.paymentId === where.paymentId) || null;
    if (where.membershipPlanId) return userPlans.find((p) => p.userId === where.userId && p.membershipPlanId === where.membershipPlanId && p.status === 'active') || null;
    return userPlans.find((p) => p.userId === where.userId && p.status === 'active' && p.plan?.planType === 'primary') || null;
  }),
  create: jest.fn(async (row) => {
    if (userPlans.some((p) => p.paymentId === row.paymentId)) { const e = new Error('dup'); e.name = 'SequelizeUniqueConstraintError'; throw e; }
    const created = { id: 3000 + userPlans.length, status: 'active', ...row };
    userPlans.push(created);
    return created;
  }),
  sequelize: { transaction: async (fn) => fn({}) },
};
jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({ UserPlan, MembershipPlan: { findByPk: planFindByPk } }));
jest.unstable_mockModule('../services/payment.service.js', () => ({ default: { razorpayInstance: null } }));
const syncUserStatusWithMembership = jest.fn(async () => ({ success: true }));
jest.unstable_mockModule('../middleware/membership.middleware.js', () => ({ syncUserStatusWithMembership }));
const onPlanActivated = jest.fn(async () => ({ receipt: true, welcome: true }));
jest.unstable_mockModule('../services/plan-emails.service.js', () => ({ onPlanActivated }));
const notifyMembershipPurchase = jest.fn(async () => {});
jest.unstable_mockModule('../services/purchase-notification.service.js', () => ({ default: { notifyMembershipPurchase } }));
jest.unstable_mockModule('../services/whatsapp-production.service.js', () => ({ default: { sendMembershipPlanActivated: jest.fn(async () => {}) } }));

const { activatePlanFromRazorpay, reconcileUserPlanOrders, activateFromPaymentId, isPlanOrder } = await import('../services/plan-activation.service.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const START = { id: 36, name: 'Start', planType: 'primary', tier: 1, durationMonths: 1, price: '99.00', metadata: {} };
const ONE = { id: 45, name: 'One', planType: 'primary', tier: 2, durationMonths: 12, price: '999.00', metadata: {} };
const order = ({ notes, ...rest } = {}) => ({ id: 'order_A1', amount: 9900, receipt: 'plan36_u8521_1', ...rest, notes: { pricing: 'server-v1', kind: 'subscribe', userId: '8521', planId: '36', ...notes } });
const captured = (over = {}) => ({ id: 'pay_P1', order_id: 'order_A1', amount: 9900, status: 'captured', ...over });
const rzWith = ({ o = order(), payments = [captured()] } = {}) => ({
  orders: { fetch: jest.fn(async () => o), fetchPayments: jest.fn(async () => ({ items: payments })) },
  payments: { fetch: jest.fn(async (id) => payments.find((p) => p.id === id) || { id, status: 'failed' }) },
});

let userRow;
beforeEach(() => {
  userPlans.length = 0;
  userRow = { id: 8521, firstName: 'D', email: 'd@example.invalid', phoneNumber: '', status: 'inactive' };
  poolQuery.mockReset().mockImplementation(async (sql) => (/FROM users/.test(sql) ? { rows: [userRow] } : { rows: [] }));
  planFindByPk.mockReset().mockImplementation(async (id) => ({ 36: START, 45: ONE }[id] || null));
  [UserPlan.create, syncUserStatusWithMembership, onPlanActivated, notifyMembershipPurchase].forEach((m) => m.mockClear());
});

const orderMarks = () => poolQuery.mock.calls.filter(([sql]) => /INSERT INTO plan_payment_orders/.test(sql)).map(([, p]) => ({ status: p[6], paymentId: p[7], userPlanId: p[8], via: p[9], refusal: p[10] }));

describe('activating a paid plan order from Razorpay', () => {
  test('a captured subscribe order starts the plan, opens the account and sends the receipt', async () => {
    const r = await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz: rzWith() });
    expect(r).toMatchObject({ ok: true, userId: 8521, planName: 'Start', kind: 'subscribe' });
    expect(UserPlan.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 8521, membershipPlanId: 36, paidAmount: 99, paymentId: 'pay_P1', paymentMethod: 'razorpay' }));
    expect(UserPlan.create.mock.calls[0][0].metadata).toMatchObject({ activatedVia: 'webhook', razorpayOrderId: 'order_A1', planName: 'Start' });
    expect(syncUserStatusWithMembership).toHaveBeenCalledWith(8521);
    expect(onPlanActivated).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_P1', amount: 99, kind: 'subscribe' }));
    expect(orderMarks()).toEqual([expect.objectContaining({ status: 'activated', paymentId: 'pay_P1', via: 'webhook' })]);
  });

  test('the same payment twice (webhook retry, order.paid after payment.captured) makes one plan', async () => {
    const rz = rzWith();
    await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz });
    const again = await activatePlanFromRazorpay({ orderId: 'order_A1', paymentId: 'pay_P1', via: 'webhook' }, { rz });
    expect(again).toMatchObject({ ok: true, alreadyActivated: true });
    expect(UserPlan.create).toHaveBeenCalledTimes(1);
    expect(onPlanActivated).toHaveBeenCalledTimes(1);
  });

  test('losing the race to the app\'s own /subscribe (unique paymentId) is success, not an error', async () => {
    // The app's row lands between our "already used?" check and our insert.
    UserPlan.findOne.mockImplementationOnce(async () => null);
    userPlans.push({ id: 77, userId: 8521, paymentId: 'pay_P1', status: 'active', membershipPlanId: 36 });
    const r = await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz: rzWith() });
    expect(r).toMatchObject({ ok: true, alreadyActivated: true, userPlanId: 77 });
    expect(onPlanActivated).not.toHaveBeenCalled();
  });

  test('an unpaid order changes nothing and stays open for later', async () => {
    const r = await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'reconcile' }, { rz: rzWith({ payments: [captured({ status: 'failed' })] }) });
    expect(r).toMatchObject({ ok: false, code: 'NOT_PAID', pending: true });
    expect(UserPlan.create).not.toHaveBeenCalled();
    expect(orderMarks()).toEqual([]);
  });

  test('orders that are not ours, short payments and other members\' orders are refused', async () => {
    expect(await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz: rzWith({ o: { id: 'order_A1', amount: 9900, notes: { purpose: 'pharmacy' } } }) }))
      .toMatchObject({ ok: false, code: 'NOT_A_PLAN_ORDER' });
    expect(await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz: rzWith({ payments: [captured({ amount: 100 })] }) }))
      .toMatchObject({ ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect(await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'reconcile', expectUserId: 999 }, { rz: rzWith() }))
      .toMatchObject({ ok: false, code: 'NOT_YOUR_ORDER' });
    expect(await activatePlanFromRazorpay({ orderId: 'order_A1', paymentId: 'pay_OTHER', via: 'admin' }, { rz: rzWith({ payments: [captured({ id: 'pay_OTHER', order_id: 'order_ZZ' })] }) }))
      .toMatchObject({ ok: false, code: 'PAYMENT_NOT_FOR_ORDER' });
    expect(UserPlan.create).not.toHaveBeenCalled();
  });

  test('a paid order that would break a plan rule is marked for a person, never activated', async () => {
    userPlans.push({ id: 5, userId: 8521, status: 'active', membershipPlanId: 45, paymentId: 'pay_OLD', plan: ONE });
    const r = await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz: rzWith() });
    expect(r).toMatchObject({ ok: false, code: 'PRIMARY_PLAN_ALREADY_ACTIVE', needsReview: true });
    expect(orderMarks()).toEqual([expect.objectContaining({ status: 'refused', refusal: 'PRIMARY_PLAN_ALREADY_ACTIVE', paymentId: 'pay_P1' })]);
    expect(UserPlan.create).not.toHaveBeenCalled();
  });

  test('an erased or suspended account is not reopened by a payment', async () => {
    userRow.status = 'deleted';
    expect(await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz: rzWith() })).toMatchObject({ ok: false, code: 'ACCOUNT_NOT_ACTIVE' });
    expect(UserPlan.create).not.toHaveBeenCalled();
  });

  test('an upgrade order retires the current plan and starts the new one', async () => {
    const current = { id: 6, userId: 8521, status: 'active', membershipPlanId: 36, paymentId: 'pay_OLD', plan: START, metadata: {}, update: jest.fn(async function (f) { Object.assign(this, f); }) };
    userPlans.push(current);
    const rz = rzWith({ o: order({ notes: { kind: 'upgrade', planId: '45' }, amount: 90000 }), payments: [captured({ amount: 90000 })] });
    const r = await activatePlanFromRazorpay({ orderId: 'order_A1', via: 'webhook' }, { rz });
    expect(r).toMatchObject({ ok: true, kind: 'upgrade', planName: 'One' });
    expect(current.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'upgraded' }), expect.anything());
    expect(UserPlan.create.mock.calls[0][0]).toMatchObject({ membershipPlanId: 45, paidAmount: 900, paymentId: 'pay_P1' });
    expect(notifyMembershipPurchase).toHaveBeenCalledWith(expect.objectContaining({ previousPlanName: 'Start', amountDue: 900 }));
  });

  test('the admin tool takes a payment id and checks it the same way', async () => {
    expect(await activateFromPaymentId('not-a-payment', { rz: rzWith() })).toMatchObject({ ok: false, code: 'BAD_PAYMENT_ID' });
    const r = await activateFromPaymentId('pay_U3B6DqxhbyY9e0', { rz: rzWith({ payments: [captured({ id: 'pay_U3B6DqxhbyY9e0' })] }) });
    expect(r).toMatchObject({ ok: true, userId: 8521 });
    expect(UserPlan.create.mock.calls[0][0].metadata.activatedVia).toBe('admin');
  });

  test('isPlanOrder recognises only server-priced subscribe/upgrade orders', () => {
    expect(isPlanOrder(order())).toBe(true);
    expect(isPlanOrder(order({ notes: { kind: 'renewal' } }))).toBe(false);
    expect(isPlanOrder({ notes: { kind: 'subscribe', userId: '1', planId: '2' } })).toBe(false);
  });
});

describe('reconcile (sign-in and "check again")', () => {
  test('checks only the caller\'s own open recent orders, throttled, and activates the paid one', async () => {
    poolQuery.mockImplementation(async (sql) => {
      if (/UPDATE plan_payment_orders SET last_checked_at/.test(sql)) return { rows: [{ razorpay_order_id: 'order_A1' }] };
      if (/FROM users/.test(sql)) return { rows: [userRow] };
      return { rows: [] };
    });
    const out = await reconcileUserPlanOrders(8521, {}, { rz: rzWith() });
    expect(out).toMatchObject({ checked: 1, pending: 0, refused: [] });
    expect(out.activated).toEqual([expect.objectContaining({ orderId: 'order_A1' })]);
    const [sql, params] = poolQuery.mock.calls.find(([s]) => /last_checked_at = now\(\)/.test(s));
    expect(sql).toMatch(/user_id = \$1 AND status = 'created'/);
    expect(params).toEqual([8521, 30, 20, 5]);
  });

  test('nothing to check costs one query and no Razorpay call', async () => {
    const rz = rzWith();
    expect(await reconcileUserPlanOrders(8521, {}, { rz })).toEqual({ activated: [], pending: 0, refused: [], checked: 0 });
    expect(rz.orders.fetch).not.toHaveBeenCalled();
  });
});

describe('wiring', () => {
  const route = read('routes/membership.route.js');
  test('payment-order records the order; subscribe/upgrade mark it and answer a repeat as success', () => {
    expect(route).toContain('await recordPlanOrder({ userId: req.user.id, planId: Number(planId), kind: quote.kind, order: orderResult.order');
    expect(route).toContain("markOrderActivatedByApp({ orderId: req.body.razorpay_order_id, paymentId: verifiedPaymentId, userPlanId: userPlan.id, via: 'subscribe' })");
    expect(route).toContain("markOrderActivatedByApp({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, userPlanId: newUserPlan.id, via: 'upgrade' })");
    expect(route.match(/const done = await alreadyActivatedFor\(req\);/g)).toHaveLength(2);
  });
  test('reconcile is the member\'s own; the admin tool is staff-only', () => {
    expect(route).toMatch(/router\.post\('\/reconcile', authUser, async/);
    expect(route).toContain("reconcileUserPlanOrders(req.user.id, { via: 'reconcile' })");
    expect(route).toContain("router.post('/admin/activate-from-payment', authUser, requireRole(['admin', 'super_admin', 'team'])");
  });
  test('the Razorpay webhook activates plan orders', () => {
    const c = read('controller/payment.controller.js');
    expect(c).toContain("await this.activatePlanIfPlanOrder({ orderId: payment?.order_id, paymentId: payment?.id });");
    expect(c).toContain('if (isPlanOrder(order)) await this.activatePlanIfPlanOrder({ orderId: order.id });');
  });
  test('the migration is in the runner and makes paymentId unique', () => {
    expect(read('scripts/migrate-all.mjs')).toContain("'20261122000200-plan-payment-orders.migration.js'");
    const m = read('migrations/20261122000200-plan-payment-orders.migration.js');
    expect(m).toContain('CREATE UNIQUE INDEX IF NOT EXISTS user_plans_payment_id_unique');
    expect(m).toContain("attach_uid_reference('plan_payment_orders', 'user_id', 'user_uid', 'users')");
  });
  test('a member\'s ticket is filed under their own account', () => {
    const t = read('routes/tickets.route.js');
    expect(t).toMatch(/if \(!isStaffCaller && req\.user\?\.id\) \{\n\s+requester = \{/);
    expect(t).toContain('email: req.user.email,');
  });
});
