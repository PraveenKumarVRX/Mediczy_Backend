/**
 * Benefits & Plans coverage figures (mobile report rows 53, 170).
 *
 * QA: "Silver plan shown but Total Coverage and Utilized are dashes."
 * buildAppliedLimits() exposed only pharmacy/homeCare/ambulance limitINR —
 * all of which are 0 on the live plans — so the screen had nothing to render.
 * The plans' coverageDetails actually carry discounts, insurance sums, a
 * health-check count and the teleconsult unit; none of it reached the client.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn() } }));

const { summariseCoverage, summariseUtilisation } = await import('../routes/membership.route.js');

// The real Gold plan coverageDetails, as stored in production.
const GOLD = {
  dental: { limitINR: 0 },
  homeCare: { limitINR: 0 },
  labTests: { limitINR: 0, discountPct: 30 },
  pharmacy: { limitINR: 0, discountPct: 20 },
  ambulance: { limitINR: 0 },
  insurance: { life: 0, health: 0, accident: 0 },
  healthCheck: { count: 2, package: 'Standard Annual Checkup' },
  onlineConsult: { limit: 10, unit: 'GP' },
};

describe('summariseCoverage', () => {
  test('surfaces the benefits the old shape dropped', () => {
    const c = summariseCoverage(GOLD);
    expect(c.benefits).toEqual(expect.arrayContaining([
      { key: 'pharmacy', limitINR: 0, discountPct: 20 },
      { key: 'labTests', limitINR: 0, discountPct: 30 },
    ]));
    expect(c.healthCheck).toEqual({ count: 2, package: 'Standard Annual Checkup' });
    expect(c.teleconsult).toEqual({ limit: 10, unit: 'GP' });
  });

  test('a total of zero is reported as 0, not null — "no monetary cover" is an answer', () => {
    // Every INR limit on the live plans is genuinely 0; the screen should say
    // ₹0, not a dash that reads as "we do not know".
    expect(summariseCoverage(GOLD).totalCoverageINR).toBe(0);
  });

  test('monetary limits add up; discounts and visit counts never enter the money total', () => {
    const c = summariseCoverage({
      pharmacy: { limitINR: 5000, discountPct: 20 },
      ambulance: { limitINR: 2500 },
      healthCheck: { count: 4 },
      onlineConsult: { limit: 10 },
    });
    expect(c.totalCoverageINR).toBe(7500);
  });

  test('insurance sums are included in the total', () => {
    const c = summariseCoverage({ insurance: { life: 100000, health: 50000, accident: 25000 } });
    expect(c.totalCoverageINR).toBe(175000);
  });

  test('a plan with no coverage block degrades to zeros, not undefined', () => {
    const c = summariseCoverage({});
    expect(c).toMatchObject({ totalCoverageINR: 0, benefits: [], insurance: null, healthCheck: null, teleconsult: null });
    expect(summariseCoverage().totalCoverageINR).toBe(0);
  });

  test('non-numeric limits are treated as zero rather than NaN', () => {
    expect(summariseCoverage({ pharmacy: { limitINR: 'unlimited' } }).totalCoverageINR).toBe(0);
  });
});

describe('summariseUtilisation', () => {
  const limits = { teleConsultLimits: { allSpecialties: 10 } };

  test('teleconsults used are pooled across specialties', () => {
    expect(summariseUtilisation(limits, { teleConsult: { gp: 2, cardiology: 1 } }))
      .toMatchObject({ teleconsultsUsed: 3, teleconsultsRemaining: 7 });
  });

  test('monetary spend is reported as unknown rather than guessed', () => {
    const u = summariseUtilisation(limits, {});
    expect(u.utilisedINR).toBe(0);
    expect(u.utilisedKnown).toBe(false);
  });

  test('over-consumption never reports a negative remaining', () => {
    expect(summariseUtilisation(limits, { teleConsult: { gp: 99 } }).teleconsultsRemaining).toBe(0);
  });

  test('missing inputs do not throw', () => {
    expect(summariseUtilisation()).toMatchObject({ teleconsultsUsed: 0, teleconsultsRemaining: 0 });
  });
});
