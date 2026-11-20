/**
 * 2026-11-20 fixes: (1) POST /api/billing/orders/create no longer stores client-supplied prices
 * (a tampered client could pay any amount); reorders are re-priced from the catalogue.
 * (2) Check-ups included in One/Family are bookable as ₹0 "PLAN-<id>" packages.
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query, QueryTypes: { SELECT: 'SELECT' } } }));
const svc = await import('../services/plan-checkup.service.js');
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const FAMILY_ROW = {
  user_plan_id: 501, valid_from: '2026-11-20', valid_to: '2027-11-20', plan_name: 'Family', used: 0,
  plan_metadata: { coverageDetails: { healthCheck: { count: 2, package: 'Core health check-up (home collection)', tests: ['CBC', 'HbA1c'], eligibleRelations: ['self', 'spouse'] } } },
};
beforeEach(() => query.mockReset());

describe('client-priced orders are gone', () => {
  const billing = read('../routes/billing.route.js');
  const createStart = billing.indexOf("router.post('/orders/create'");
  const create = billing.slice(createStart, billing.indexOf("router.post(\n  '/orders',", createStart));
  test('/orders/create never creates an order from client numbers', () => {
    expect(create).not.toContain('Order.create(');
    expect(create).not.toMatch(/parseFloat\(subtotal\)/);
    expect(create).toContain("code: 'CLIENT_PRICED_ORDERS_REMOVED'");
    expect(create).toContain('status(410)');
  });
  test('it only hands back a pending order the server already made for this member', () => {
    expect(create).toContain('Order.findOne({ where: { id: existingId, userId: req.user.id } })');
    expect(create).toContain("order.status !== 'pending'");
  });
  test('a reorder is re-priced from the catalogue with member pricing and no invented tax', () => {
    const reorder = billing.slice(billing.indexOf("router.post('/orders/:orderId/reorder'"), billing.indexOf("router.get('/orders/pharmacy/medicine-search'"));
    expect(reorder).toContain('resolveMedicine(sharedPool');
    expect(reorder).toContain('computeOrderTotals(priced)');
    expect(reorder).toContain('await isPaidMember(userId)');
    expect(reorder).not.toContain('subtotal * 0.05');
    expect(reorder).toContain("code: 'REORDER_NOT_SUPPORTED'");
    expect(reorder).not.toMatch(/parseFloat\(item\.price\)/);
  });
});

describe('check-ups included in a plan', () => {
  test('a Family member sees one ₹0 package with 2 check-ups for self and spouse', async () => {
    query.mockResolvedValueOnce([FAMILY_ROW]);
    const [p] = await svc.planCheckupPackages(41);
    expect(p).toMatchObject({ packageId: 'PLAN-501', price: 0, source: 'plan', allowance: { count: 2, used: 0, remaining: 2 } });
    expect(p.metadata.eligibleRelations).toEqual(['self', 'spouse']);
    expect(p.packageDetails.tests).toEqual(['CBC', 'HbA1c']);
  });
  test('used-up check-ups are not offered', async () => {
    query.mockResolvedValueOnce([{ ...FAMILY_ROW, used: 2 }]);
    expect(await svc.planCheckupPackages(41)).toEqual([]);
  });
  test('booking locks the plan row, blocks a second active booking for the same person and stops at the allowance', async () => {
    query.mockResolvedValueOnce([{ id: 501 }]).mockResolvedValueOnce([FAMILY_ROW]).mockResolvedValueOnce([]);
    expect((await svc.resolvePlanCheckup(41, 'PLAN-501', 'spouse', {})).raw.packageId).toBe('PLAN-501');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    query.mockReset();
    query.mockResolvedValueOnce([{ id: 501 }]).mockResolvedValueOnce([FAMILY_ROW]).mockResolvedValueOnce([{ id: 9 }]);
    expect(await svc.resolvePlanCheckup(41, 'PLAN-501', 'self', {})).toEqual({ reason: 'already_booked' });
    query.mockReset();
    query.mockResolvedValueOnce([{ id: 501 }]).mockResolvedValueOnce([{ ...FAMILY_ROW, used: 2 }]).mockResolvedValueOnce([]);
    expect(await svc.resolvePlanCheckup(41, 'PLAN-501', 'spouse', {})).toEqual({ reason: 'already_booked' });
  });
  test('someone else\'s plan, or a malformed id, is not eligible', async () => {
    query.mockResolvedValueOnce([]);
    expect(await svc.resolvePlanCheckup(41, 'PLAN-777', 'self', {})).toEqual({ reason: 'package_not_eligible' });
    expect(await svc.resolvePlanCheckup(41, 'PLAN-x', 'self', {})).toEqual({ reason: 'package_not_eligible' });
  });
  test('the check-up flow offers and books plan check-ups, also for a company-covered member', () => {
    const route = read('../routes/health-checkup.route.js');
    expect(route).toContain('if (isPlanCheckupId(packageId)) {');
    expect(route).toContain('const included=(await planCheckupPackages(req.user.id))');
    expect(route).toContain("if (isPlanCheckupId(packageId)) return { corporate: c, eligible: true };");
    expect(route).toContain('packageId && !isPlanCheckupId(packageId) ? String(packageId) : null');
  });
  test('One covers the member, Family the member and spouse, on a panel pending clinical review', async () => {
    const { CORE_PANEL } = await import('../migrations/20261120000800-plan-checkup-panel.migration.js');
    expect(CORE_PANEL).toContain('HbA1c');
    expect(read('../migrations/20261120000800-plan-checkup-panel.migration.js')).toContain("FAMILY_ANNUAL: ['self', 'spouse']");
  });
});
