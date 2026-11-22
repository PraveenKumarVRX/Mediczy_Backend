/**
 * Owner decision 2026-11-20: no free plan. A new individual member buys the ₹99 Basic plan or
 * redeems a promo coupon. Until then the account is inactive and its session reaches only plans,
 * payment, coupons and account settings; everything else answers MEMBERSHIP_REQUIRED.
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const userPlanFindOne = jest.fn();
const sqlQuery = jest.fn();
const userFindOne = jest.fn();
const userUpdate = jest.fn();

jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  UserPlan: { findOne: userPlanFindOne, update: jest.fn() },
}));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: sqlQuery, QueryTypes: { SELECT: 'SELECT' } },
}));
jest.unstable_mockModule('../middleware/audit.middleware.js', () => ({ auditAccountStatusTransition: jest.fn() }));
jest.unstable_mockModule('../models/user.model.intelligent.js', () => ({
  default: { findOne: userFindOne, update: userUpdate },
}));

const reconcileUserPlanOrders = jest.fn();
jest.unstable_mockModule('../services/plan-activation.service.js', () => ({ reconcileUserPlanOrders }));

const { validateMembership, isPrePlanPath } = await import('../middleware/membership.middleware.js');

const call = async ({ path, method = 'GET', status = 'inactive', user = {} }) => {
  const [baseUrl, ...rest] = path.split(/(?=\/[^/]*$)/);
  const req = { method, baseUrl: rest.length ? baseUrl : path, path: rest.length ? rest[0] : '/', userRole: 'user', user: { id: 41, email: 'm@example.invalid', status, ...user } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const next = jest.fn();
  await validateMembership(req, res, next);
  return { passed: next.mock.calls.length === 1, res, req };
};

beforeEach(() => {
  userPlanFindOne.mockReset().mockResolvedValue(null);
  sqlQuery.mockReset().mockResolvedValue([]);
  userFindOne.mockReset().mockResolvedValue({ status: 'inactive', email: 'm@example.invalid', metadata: {} });
  userUpdate.mockReset().mockResolvedValue([1]);
  reconcileUserPlanOrders.mockReset().mockResolvedValue({ activated: [], pending: 0, refused: [], checked: 0 });
});

describe('a member who paid but whose app never finished activation (incident 2026-11-22)', () => {
  test('is let in once the sign-in reconcile finds the paid order', async () => {
    reconcileUserPlanOrders.mockImplementation(async () => {
      userPlanFindOne.mockResolvedValue({ id: 2311, endDate: '2099-01-01' });
      return { activated: [{ orderId: 'order_A1', userPlanId: 2311 }], pending: 0, refused: [], checked: 1 };
    });
    const { passed, req } = await call({ path: '/api/appointments/my' });
    expect(reconcileUserPlanOrders).toHaveBeenCalledWith(41, { via: 'reconcile' });
    expect(passed).toBe(true);
    expect(req.user.status).toBe('active');
  });

  test('with nothing paid, is still refused (and a reconcile failure is not an error)', async () => {
    expect((await call({ path: '/api/appointments/my' })).res.body.code).toBe('MEMBERSHIP_REQUIRED');
    reconcileUserPlanOrders.mockRejectedValue(new Error('razorpay down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call({ path: '/api/appointments/my' })).res.body.code).toBe('MEMBERSHIP_REQUIRED');
    spy.mockRestore();
  });

  test('can reach "check again" and raise and read their own support tickets, not the staff ticket tools', async () => {
    expect((await call({ path: '/api/membership/reconcile', method: 'POST' })).passed).toBe(true);
    for (const [method, path] of [['GET', '/api/tickets'], ['POST', '/api/tickets'], ['GET', '/api/tickets/TKT-123'], ['POST', '/api/tickets/TKT-123/messages']]) {
      expect(isPrePlanPath(path, method)).toBe(true);
    }
    for (const [method, path] of [['GET', '/api/tickets/stats'], ['GET', '/api/tickets/agents'], ['GET', '/api/tickets/export/csv'], ['PUT', '/api/tickets/TKT-123'],
      ['DELETE', '/api/tickets/TKT-123'], ['POST', '/api/tickets/bulk/x'], ['POST', '/api/tickets/TKT-123/assign']]) {
      expect(isPrePlanPath(path, method)).toBe(false);
    }
  });
});

describe('an individual member without a plan', () => {
  test('is refused everything except the pre-plan paths', async () => {
    // Lab tests and medicines are open at list price since 2026-11-20 (individual-plan-lineup.test.js).
    for (const path of ['/api/family-members', '/api/appointments/my', '/api/wellness/dashboard', '/api/diet/log']) {
      const { passed, res } = await call({ path });
      expect(passed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_REQUIRED');
      expect(res.body.details.nextStep).toBe('choose_plan');
    }
  });

  test('can still choose, pay for or redeem a plan and manage the account', async () => {
    for (const path of ['/api/membership/plans', '/api/membership/payment-order', '/api/membership/subscribe/35',
      '/api/membership/redeem-free-coupon', '/api/membership/validate-free-coupon', '/api/membership/my/current',
      '/api/users/profile', '/api/users/account', '/api/privacy/delete-account', '/api/privacy/export', '/api/fcm/register-token']) {
      expect(isPrePlanPath(path)).toBe(true);
      expect((await call({ path, method: 'POST' })).passed).toBe(true);
    }
    expect(isPrePlanPath('/api/membership/e-card')).toBe(false);
    expect(isPrePlanPath('/api/users/profileX')).toBe(false);
  });

  test('a member who has paid but is not yet marked active is let in and activated', async () => {
    userPlanFindOne.mockResolvedValue({ id: 9, endDate: '2099-01-01' });
    const { passed, req } = await call({ path: '/api/appointments/my' });
    expect(passed).toBe(true);
    expect(req.user.status).toBe('active');
    expect(userUpdate).toHaveBeenCalledWith({ status: 'active' }, { where: { id: 41 } });
  });

  test('a funded corporate employee is not asked to buy a plan', async () => {
    sqlQuery.mockResolvedValue([{ '?column?': 1 }]);
    expect((await call({ path: '/api/appointments/my' })).passed).toBe(true);
  });

  test('a deleted or suspended account is never re-activated by the gate', async () => {
    userPlanFindOne.mockResolvedValue({ id: 9 });
    for (const status of ['deleted', 'suspended']) {
      const { passed, res } = await call({ path: '/api/appointments/my', status });
      expect(passed).toBe(false);
      expect(res.body.code).toBe('ACCOUNT_INACTIVE');
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });

  test('an inactive member with role patient (most corporate employees) is gated the same way', async () => {
    const req = { method: 'GET', baseUrl: '/api/appointments', path: '/my', userRole: 'patient', user: { id: 41, email: 'm@example.invalid', status: 'inactive' } };
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    const next = jest.fn();
    await validateMembership(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.body.code).toBe('MEMBERSHIP_REQUIRED');
    expect(readFileSync(new URL('../middleware/auth.middleware.js', import.meta.url), 'utf8'))
      .toContain("(req.userRole === 'user' || (req.userRole === 'patient' && user.status !== 'active')) && !user.isAdmin");
  });

  test('an active member goes through without any extra lookup', async () => {
    expect((await call({ path: '/api/appointments/my', status: 'active' })).passed).toBe(true);
    expect(userPlanFindOne).not.toHaveBeenCalled();
  });
});

describe('sign-up, sign-in and plan wiring', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const userRoute = read('../routes/user.route.js');
  const controller = read('../controller/user.controller.js');
  const membership = read('../routes/membership.route.js');

  test('no sign-up path grants a free plan or opens an individual account', () => {
    expect(userRoute).not.toMatch(/INSERT INTO user_subscriptions[\s\S]{0,120}VALUES \(:userId, 1,/);
    expect(userRoute).toContain("status: 'inactive',");
    expect(controller).not.toContain("code: 'FREE_TRIAL'");
    expect(controller).toContain('status: "inactive",');
    expect(read('../config/oauth.config.js')).toContain("status: 'inactive'");
    expect(read('../controller/apple-auth.controller.js')).toContain("status: 'inactive',");
  });

  test('sign-up redeems an optional promo coupon and tells the app whether a plan is still needed', () => {
    expect(userRoute).toContain('await redeemFreeMembershipCoupon({ user: newUser, couponCode })');
    expect(userRoute).toContain('const membershipRequired = !isCorporate && !signupCoupon?.applied;');
  });

  test('an individual without a plan can sign in to pay; employees still go to HR', () => {
    for (const src of [controller, userRoute]) {
      expect(src).toContain("const isPlanPendingIndividual = user.status === 'inactive' && user.isActive !== false && !user.isCorporate;");
      expect(src).toContain("membershipRequired: user.status !== 'active',");
    }
  });

  test('paying or redeeming opens the account at once', () => {
    expect(membership.match(/await syncUserStatusWithMembership\((req\.user|user)\.id\)/g)).toHaveLength(2);
    expect(membership).toContain("export const ENTRY_PLAN_CODE = 'BASIC_MONTHLY';");
  });

  test('the entry plan is ₹99 for one month and the free plans stop being sold', async () => {
    const { ENTRY_PLAN, RETIRED_FREE_PLAN_CODES, up } = await import('../migrations/20261120000300-paid-basic-plan.migration.js');
    expect(ENTRY_PLAN).toMatchObject({ code: 'BASIC_MONTHLY', price: 99, durationMonths: 1 });
    expect(RETIRED_FREE_PLAN_CODES).toEqual(expect.arrayContaining(['BASIC', 'FREE_TRIAL', 'BASIC_FREE', 'SMART_BASIC']));
    const sql = [];
    await up({ query: async (q, p) => { sql.push([q, p]); return { rows: [] }; } });
    expect(sql[0][0]).toContain('WHERE NOT EXISTS');
    expect(sql[1][0]).toMatch(/SET "isActive" = false[\s\S]*COALESCE\(price, 0\) = 0/);
  });
});
