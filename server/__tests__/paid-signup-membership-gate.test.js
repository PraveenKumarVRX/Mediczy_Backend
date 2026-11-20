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
});

describe('an individual member without a plan', () => {
  test('is refused everything except the pre-plan paths', async () => {
    for (const path of ['/api/family-members', '/api/appointments/my', '/api/wellness/dashboard', '/api/lab-tests']) {
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
