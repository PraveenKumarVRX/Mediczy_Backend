/**
 * What a membership plan entitles a member to, snapshotted onto user_plans.metadata.appliedLimits
 * at activation. Shared by every path that activates a plan (subscribe, upgrade, coupon, and the
 * server-side activation from a captured Razorpay payment), so they cannot drift.
 */

// ── Build appliedLimits from a plan's coverageDetails ─────────────────────────
export function buildAppliedLimits(plan) {
  const coverage = plan.metadata?.coverageDetails || {};
  return {
    benefitLimits: {
      pharmacyLimitINR: coverage.pharmacy?.limitINR ?? 0,
      homeCareLimitINR: coverage.homeCare?.limitINR ?? 0,
      ambulanceLimitINR: coverage.ambulance?.limitINR ?? 0,
    },
    teleConsultLimits: {
      allSpecialties: coverage.onlineConsult?.limit ?? 0,
      // 2026-11-20 lineup: GP consults under fair use (per day / per month) and a separate
      // specialist count. Older plans have neither and keep the pooled allowance above.
      ...(coverage.onlineConsult?.fairUse ? {
        gpFairUse: { perDay: coverage.onlineConsult.fairUse.perDay ?? null, perMonth: coverage.onlineConsult.fairUse.perMonth },
        specialist: coverage.specialistConsult?.limit ?? 0,
      } : {}),
    },
    healthCheckPackage: coverage.healthCheck?.package ?? null,
    priceINR: Number(plan.discountedPrice != null && plan.discountedPrice !== '0.00' && plan.discountedPrice !== 0 ? plan.discountedPrice : plan.price) || 0,
    // The itemised picture. The three INR fields above were all this exposed,
    // and they are 0 on most plans, so Benefits & Plans had nothing to render
    // and showed dashes for Total Coverage and Utilized. coverageDetails
    // actually carries discounts, insurance sums, a health-check count and the
    // teleconsult unit — none of which reached the client.
    coverage: summariseCoverage(coverage),
  };
}

/**
 * Normalise a plan's coverageDetails into something a client can render.
 *
 * Returns itemised benefits plus a total. `totalCoverageINR` sums the monetary
 * limits only — a discount percentage and a visit count are real benefits but
 * are not rupees and must not be added into a money total. A plan whose limits
 * are all zero reports 0, not null: "no monetary cover" is an answer, a dash
 * is not.
 */
export function summariseCoverage(coverage = {}) {
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const MONETARY = ['pharmacy', 'homeCare', 'ambulance', 'dental', 'labTests', 'optical', 'physiotherapy'];

  const benefits = [];
  for (const key of MONETARY) {
    const item = coverage[key];
    if (!item || typeof item !== 'object') continue;
    benefits.push({
      key,
      limitINR: num(item.limitINR),
      discountPct: item.discountPct === undefined ? null : num(item.discountPct),
    });
  }

  const insurance = coverage.insurance && typeof coverage.insurance === 'object'
    ? {
      lifeINR: num(coverage.insurance.life),
      healthINR: num(coverage.insurance.health),
      accidentINR: num(coverage.insurance.accident),
    }
    : null;

  const insuranceTotal = insurance ? insurance.lifeINR + insurance.healthINR + insurance.accidentINR : 0;

  return {
    totalCoverageINR: benefits.reduce((sum, b) => sum + b.limitINR, 0) + insuranceTotal,
    benefits,
    insurance,
    healthCheck: coverage.healthCheck
      ? { count: num(coverage.healthCheck.count), package: coverage.healthCheck.package ?? null }
      : null,
    teleconsult: coverage.onlineConsult
      ? { limit: num(coverage.onlineConsult.limit), unit: coverage.onlineConsult.unit ?? null }
      : null,
  };
}

export default { buildAppliedLimits, summariseCoverage };
