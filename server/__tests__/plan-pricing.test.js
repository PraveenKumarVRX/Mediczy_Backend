import { describe, expect, it, jest } from '@jest/globals';

/** The server's own price for a plan purchase (audit M18). */
const { planPrice, upgradeBaseDue, quotePlanPurchase } = await import('../services/plan-pricing.service.js');

const models = ({ plan, current = null }) => ({
  MembershipPlan: { findByPk: jest.fn(async () => plan) },
  UserPlan: { findOne: jest.fn(async () => current) },
});

describe('planPrice', () => {
  it('uses the discounted price when set, else the price', () => {
    expect(planPrice({ price: '4999.00', discountedPrice: '3999.00' })).toBe(3999);
    expect(planPrice({ price: '4999.00', discountedPrice: '0.00' })).toBe(4999);
    expect(planPrice({ price: '4999.00', discountedPrice: null })).toBe(4999);
    expect(planPrice({ price: null })).toBe(0);
  });
});

describe('upgradeBaseDue', () => {
  it('refunds the unused days of what was paid', () => {
    const now = new Date('2026-07-01T00:00:00Z');
    const current = { startDate: '2026-01-01', endDate: '2026-12-31', paidAmount: '3640' }; // 364 days, Rs 10/day
    const out = upgradeBaseDue(current, { price: '6000' }, now);
    expect(out.remainingDays).toBe(183);
    expect(out.proratedRefund).toBe(1830);
    expect(out.baseAmountDue).toBe(4170);
  });

  it('never goes below zero', () => {
    const out = upgradeBaseDue({ startDate: '2026-01-01', endDate: '2027-01-01', paidAmount: '99999' }, { price: '100' }, new Date('2026-01-02'));
    expect(out.baseAmountDue).toBe(0);
  });
});

describe('quotePlanPurchase', () => {
  const gold = { id: 7, name: 'Gold', price: '4999', isActive: true, planType: 'primary' };

  it('a member with no plan pays the plan price', async () => {
    await expect(quotePlanPurchase({ userId: 1, planId: 7 }, models({ plan: gold }))).resolves.toMatchObject({ ok: true, kind: 'subscribe', baseAmount: 4999 });
  });

  it('a member on another primary plan pays the prorated upgrade', async () => {
    const current = { membershipPlanId: 3, startDate: '2026-01-01', endDate: '2026-12-31', paidAmount: '0', plan: { planType: 'primary' } };
    await expect(quotePlanPurchase({ userId: 1, planId: 7 }, models({ plan: gold, current }))).resolves.toMatchObject({ ok: true, kind: 'upgrade', baseAmount: 4999 });
  });

  it('an add-on is always a plain purchase', async () => {
    const addon = { ...gold, planType: 'addon', price: '299' };
    const m = models({ plan: addon, current: { membershipPlanId: 3, plan: { planType: 'primary' } } });
    await expect(quotePlanPurchase({ userId: 1, planId: 7 }, m)).resolves.toMatchObject({ kind: 'subscribe', baseAmount: 299 });
    expect(m.UserPlan.findOne).not.toHaveBeenCalled();
  });

  it('an inactive or unknown plan cannot be priced', async () => {
    await expect(quotePlanPurchase({ userId: 1, planId: 7 }, models({ plan: { ...gold, isActive: false } }))).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(quotePlanPurchase({ userId: 1, planId: 7 }, models({ plan: null }))).resolves.toMatchObject({ ok: false, code: 'PLAN_NOT_FOUND' });
  });
});
