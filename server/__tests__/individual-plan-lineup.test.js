/**
 * Individual plan lineup (owner decision 2026-11-20): Start ₹99/month → One ₹1,499 → Family
 * ₹3,999, add-ons Parents/Mind/Chronic Care/Extra child, old plans retired, corporate plans hidden,
 * non-members buy labs and medicines at list price, members get member prices.
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const findAll = jest.fn(async () => []);
jest.unstable_mockModule('../models/postgres/membershipPlan.model.postgres.js', () => ({
  UserPlan: { findOne: jest.fn(async () => null), findAll }, MembershipPlan: {},
}));

const { selfServiceRefusal, upgradeBaseDue, ENTRY_PLAN_CODE } = await import('../services/plan-pricing.service.js');
const { entitlementFor, isGeneralPractice } = await import('../services/teleconsult-entitlement.service.js');
const { LINEUP, RETIRED_CODES, appliedLimitsFor } = await import('../migrations/20261120000700-individual-plan-lineup.migration.js');
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const plan = (code) => LINEUP.find((p) => p.code === code);

describe('the lineup', () => {
  test('three tiers on one path at the report prices; Start reuses the ₹99 entry plan', () => {
    expect(['BASIC_MONTHLY', 'ONE_ANNUAL', 'FAMILY_ANNUAL'].map((c) => [plan(c).name, plan(c).price, plan(c).months, plan(c).tier]))
      .toEqual([['Start', 99, 1, 0], ['One', 1499, 12, 1], ['Family', 3999, 12, 2]]);
    expect(ENTRY_PLAN_CODE).toBe('BASIC_MONTHLY');
    expect(plan('FAMILY_ANNUAL')).toMatchObject({ maxUsers: 4, featured: true });
    expect(plan('FAMILY_ANNUAL').metadata.familyCoverage).toBe('employee_spouse_children');
  });
  test('add-ons attach to One or Family and carry what they extend', () => {
    expect(plan('PARENTS_ONE')).toMatchObject({ price: 4999, planType: 'addon' });
    expect(plan('PARENTS_TWO')).toMatchObject({ price: 8999, planType: 'addon' });
    expect(plan('MIND_ANNUAL').price).toBe(2999);
    expect([plan('CHRONIC_CARE_ANNUAL').price, plan('CHRONIC_CARE_3M').price, plan('CHRONIC_CARE_3M').months]).toEqual([5999, 1999, 3]);
    expect(plan('EXTRA_CHILD')).toMatchObject({ price: 499 });
    expect(plan('EXTRA_CHILD').metadata.requiresBaseTier).toBe(2);
    expect(plan('PARENTS_TWO').metadata.familyExtension).toEqual({ parents: 2 });
  });
  test('no plan includes insurance or remote monitoring; all old plans and add-ons are retired', () => {
    for (const p of LINEUP) expect(JSON.stringify(p.benefits)).not.toMatch(/insurance|VitalTrack/i);
    for (const code of ['SILVER', 'SILVER_INS', 'SILVER_PRO', 'GOLD_PRO', 'PLATINUM_INS', 'DIAMOND', 'DIAMOND_PRO', 'VITALTRACK', 'RIDER_ELDERLY']) expect(RETIRED_CODES).toContain(code);
    expect(RETIRED_CODES).toHaveLength(18);
  });
});

describe('who can buy what', () => {
  const one = { tier: 1, planType: 'primary' };
  test('corporate plans are never sold to individuals', () => {
    expect(selfServiceRefusal({ type: 'corporate', planType: 'primary' }, null)).toMatchObject({ code: 'PLAN_NOT_SELF_SERVICE' });
    expect(selfServiceRefusal({ type: 'personal', planType: 'health_checkup' }, null)).toMatchObject({ code: 'PLAN_NOT_SELF_SERVICE' });
  });
  test('an add-on needs One or Family; Extra child needs Family', () => {
    const parents = { type: 'personal', planType: 'addon', metadata: { requiresBaseTier: 1 } };
    expect(selfServiceRefusal(parents, null)).toMatchObject({ code: 'BASE_PLAN_REQUIRED' });
    expect(selfServiceRefusal(parents, { tier: 0 })).toMatchObject({ code: 'BASE_PLAN_REQUIRED' });
    expect(selfServiceRefusal(parents, one)).toBeNull();
    expect(selfServiceRefusal({ type: 'personal', planType: 'addon', metadata: { requiresBaseTier: 2 } }, one)).toMatchObject({ code: 'BASE_PLAN_REQUIRED' });
  });
  test('moving up from Start credits the whole ₹99, not just the unused days', () => {
    const now = new Date('2026-11-25T00:00:00Z');
    const start = { paidAmount: 99, startDate: '2026-11-01', endDate: '2026-12-01', plan: { code: 'BASIC_MONTHLY' } };
    expect(upgradeBaseDue(start, { price: 1499 }, now)).toMatchObject({ proratedRefund: 99, baseAmountDue: 1400 });
    const other = { ...start, plan: { code: 'SOMETHING_ELSE' } };
    expect(upgradeBaseDue(other, { price: 1499 }, now).proratedRefund).toBeLessThan(99);
  });
});

describe('consult allowances', () => {
  const meta = (code) => ({ appliedLimits: appliedLimitsFor(plan(code)), usage: {} });
  const now = new Date('2026-11-20T06:00:00Z');
  test('GP consults on One are covered up to 1 a day and 6 a month', () => {
    const m = meta('ONE_ANNUAL');
    expect(entitlementFor(m, 'General Physician', now)).toMatchObject({ kind: 'gp', covered: true, limit: 6 });
    m.usage.teleConsultDays = { '2026-11-20': 1 };
    expect(entitlementFor(m, 'General Physician', now)).toMatchObject({ covered: false, reason: 'daily_fair_use_reached' });
    m.usage.teleConsultDays = { '2026-11-02': 2, '2026-11-09': 2, '2026-11-15': 2 };
    expect(entitlementFor(m, 'general', now)).toMatchObject({ covered: false, reason: 'monthly_fair_use_reached' });
    m.usage.teleConsultDays = { '2026-10-30': 6 };
    expect(entitlementFor(m, 'general', now).covered).toBe(true); // a new month
  });
  test('specialists come from their own count; Start has none', () => {
    const m = meta('ONE_ANNUAL');
    expect(entitlementFor(m, 'Cardiology', now)).toMatchObject({ kind: 'specialist', limit: 3, covered: true });
    m.usage.specialistUsed = 3;
    expect(entitlementFor(m, 'Cardiology', now)).toMatchObject({ covered: false, reason: 'specialist_allowance_exhausted' });
    expect(entitlementFor(meta('BASIC_MONTHLY'), 'Dermatology', now)).toMatchObject({ covered: false, reason: 'plan_has_no_specialist_benefit' });
    expect(entitlementFor(meta('BASIC_MONTHLY'), 'general', now)).toMatchObject({ covered: true, limit: 3 });
  });
  test('add-ons add fair use and specialist consults', () => {
    const m = meta('ONE_ANNUAL');
    m.usage.teleConsultDays = { '2026-11-20': 1 };
    const extra = plan('PARENTS_ONE').metadata.teleconsultExtra;
    expect(entitlementFor(m, 'general', now, extra)).toMatchObject({ covered: true, limit: 12 });
    expect(entitlementFor(m, 'Cardiology', now, extra).limit).toBe(5);
  });
  test('older plans keep their pooled allowance unchanged', () => {
    const legacy = { appliedLimits: { teleConsultLimits: { allSpecialties: 10 } }, usage: { teleConsult: { general: 4 } } };
    expect(entitlementFor(legacy, 'Cardiology', now)).toMatchObject({ kind: 'pooled', limit: 10, used: 4, remaining: 6, covered: true });
    expect(isGeneralPractice('Family Medicine')).toBe(true);
    expect(isGeneralPractice('Orthopaedics')).toBe(false);
  });
});

describe('family coverage adds up', () => {
  test('Family + Parents covers spouse, 2 children and a parent; nothing else changes without new plans', async () => {
    const { extendWithPersonalPlans } = await import('../services/family-member-validation.service.js');
    const employeeOnly = { coverageMode: 'tier', familyCoverage: 'employee', tierRules: { spouse: 0, children: 0, parents: 0 }, maxMembers: 0, allowedRelations: [], source: 'corporate-plan-tier' };
    findAll.mockResolvedValueOnce([]);
    expect(await extendWithPersonalPlans(employeeOnly, 41)).toBe(employeeOnly);
    findAll.mockResolvedValueOnce([
      { endDate: '2099-01-01', plan: { planType: 'primary', name: 'Family', metadata: { lineup: '2026-11', familyCoverage: 'employee_spouse_children' } } },
      { endDate: '2099-01-01', plan: { planType: 'addon', name: 'Parents (1 parent)', metadata: { familyExtension: { parents: 1 } } } },
    ]);
    const limits = await extendWithPersonalPlans(employeeOnly, 41);
    expect(limits.tierRules).toEqual({ spouse: 1, children: 2, parents: 1 });
    expect(limits.maxMembers).toBe(4);
    expect(limits.allowedRelations).toEqual(expect.arrayContaining(['spouse', 'son', 'daughter', 'father', 'mother']));
  });
});

describe('selling and pricing wiring', () => {
  test('the plan list hides corporate plans from individuals', () => {
    expect(read('../routes/membership.route.js')).toContain("plans.filter((p) => String(p.type || '').toLowerCase() !== 'corporate')");
  });
  test('non-members can buy lab tests and medicines; the medicine discount is for members', async () => {
    const mw = read('../middleware/membership.middleware.js');
    for (const path of ["'/api/lab-tests'", "'/api/pharmacy-orders'", "'/api/billing/orders'", "'/api/cart'", "'/api/addresses'"]) expect(mw).toContain(path);
    expect(mw).not.toContain("{ method: 'POST', path: '/api/pharmacy-orders' }");
    const orders = read('../routes/patient-pharmacy-orders.route.js');
    expect(orders).toContain('const automaticDiscount = memberPrice ? policy.discount : 0;');
  });
});
