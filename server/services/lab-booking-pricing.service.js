/**
 * Lab booking pricing — the one place a lab test's price is decided.
 *
 * Every lab surface the patient apps use reads it:
 *   GET  /api/labs/:labId/tests   lists the bookable tests       (listBookableLabTests)
 *   POST /api/cart/add|sync, GET  re-prices the cart              (catalogueByIdentifier)
 *   POST /api/labs/book/quote     prices a booking before it is made (priceLabBooking)
 *   POST /api/labs/book           prices the booking it creates   (priceLabBooking)
 *
 * WHERE A PRICE COMES FROM (owner decision 2026-11-15: labs set their own
 * test lists and prices). Keyed by lab:
 *   - a lab with at least one active row in `lab_test_prices` offers ONLY
 *     those tests, at THOSE prices                       -> priceSource 'lab'
 *   - a lab with none (not onboarded yet) books from the platform "Standard"
 *     catalogue, the active `api_lab_tests` rows         -> priceSource 'standard'
 * The catalogue remains the definition of a test either way: a lab-priced test
 * must still be an active catalogue row. A client-sent price is never used.
 * The table is created by migrations/20261115000200-lab-test-prices; until it
 * exists every lab is 'standard'.
 *
 * WHAT THE MEMBER PAYS (owner decision 2026-11-15: a benefit plan applies to
 * lab tests for the members it covers). The booking user's active plan is
 * read from `membership_plans.metadata.coverageDetails.labTests`:
 *   { discountPct, limitINR, period }
 *   - discountPct  percentage off the tests subtotal (100 = free)
 *   - limitINR     an allowance the plan pays, per `period` ('plan_term',
 *                  the default, or 'month'); spent allowance is what earlier
 *                  bookings on the same user plan recorded as planCoveredAmount
 * The plan covers the account holder and the verified family members on their
 * list. A plan that defines neither field gives nothing: no benefit is
 * inferred from a plan's type or price.
 *
 * QA-06 (app 1.5.2): GET /labs/:labId/tests answered 2,381 of 2,418 active labs
 * with eight hardcoded sample tests (ids 1-8, "CBC ₹500"), which are not in
 * the catalogue, so POST /cart/add refused every one with TEST_NOT_BOOKABLE.
 *
 * QA-07: POST /labs/book added `serviceType === 'checkup' ? 1500 : 2500` to
 * the client's own test prices. That "base fee" was not a lab visit or
 * collection fee: no lab, catalogue row or setting holds it; it was a
 * hardcoded default carried over in the MariaDB->PostgreSQL port, and the web
 * booking page never showed it either. It is gone: the total is the sum of
 * the test prices, less the plan benefit. The /labs/book flow books a visit
 * to the lab (it has no home-collection step), so the per-test
 * home_collection_charge does not apply here; it is returned per test for a
 * future home-collection flow.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

export const CORPORATE_BENEFIT_SOURCES = Object.freeze(['corporate-benefit', 'corporate-family-benefit']);
export const PRICE_SOURCES = Object.freeze({ LAB: 'lab', STANDARD: 'standard' });
export const LAB_BENEFIT_PERIODS = Object.freeze(['plan_term', 'month']);

// Categories booked as "diagnostic" (imaging / cardiac) rather than "checkup".
const DIAGNOSTIC_CATEGORIES = new Set(['radiology', 'cardiology', 'cardiac']);

const MAX_TESTS_PER_BOOKING = 30;

// ── Price sources ────────────────────────────────────────────────────────────

const STANDARD_COLUMNS = `t.test_id, t.name, t.test_code, t.category, t.sample_type, t.turnaround_time_hours,
       t.price, t.currency, t.home_collection_charge, 'standard'::text AS price_source`;

// A lab price is positive INR by table constraint. The lab sets no home
// collection charge yet, so none is claimed for it.
const LAB_COLUMNS = `t.test_id, t.name, t.test_code, t.category, t.sample_type, t.turnaround_time_hours,
       p.price, 'INR'::text AS currency, NULL::numeric AS home_collection_charge, 'lab'::text AS price_source`;

// A catalogue row is bookable only with a confirmed, finite, non-negative INR price.
const STANDARD_BOOKABLE = `t.status = 'active' AND t.price IS NOT NULL AND t.price::numeric >= 0
     AND (t.currency IS NULL OR t.currency = 'INR')`;

const MATCHES_IDENTIFIER = `(
       t.test_id::text = ANY($1::text[])
       OR LOWER(t.test_code) IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)
       OR LOWER(t.name)      IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)
     )`;

const STANDARD_BY_IDENTIFIER_SQL = `
  SELECT ${STANDARD_COLUMNS}
    FROM api_lab_tests t
   WHERE ${STANDARD_BOOKABLE}
     AND ${MATCHES_IDENTIFIER}`;

const STANDARD_LIST_SQL = `
  SELECT ${STANDARD_COLUMNS}
    FROM api_lab_tests t
   WHERE ${STANDARD_BOOKABLE}
   ORDER BY t.category, t.name`;

const LAB_BY_IDENTIFIER_SQL = `
  SELECT ${LAB_COLUMNS}
    FROM lab_test_prices p
    JOIN api_lab_tests t ON t.test_id = p.test_id
   WHERE p.lab_id = $2 AND p.is_active AND t.status = 'active'
     AND ${MATCHES_IDENTIFIER}`;

const LAB_LIST_SQL = `
  SELECT ${LAB_COLUMNS}
    FROM lab_test_prices p
    JOIN api_lab_tests t ON t.test_id = p.test_id
   WHERE p.lab_id = $1 AND p.is_active AND t.status = 'active'
   ORDER BY t.category, t.name`;

const LAB_HAS_PRICE_LIST_SQL = 'SELECT 1 FROM lab_test_prices WHERE lab_id = $1 AND is_active LIMIT 1';

const amount = (value) => Math.round(Number(value) * 100) / 100;
const optionalAmount = (value) => (value === null || value === undefined ? null : amount(value));

/** A positive integer lab id, or null. */
export function normaliseLabId(labId) {
  if (labId === null || labId === undefined || labId === '') return null;
  const n = Number(labId);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

let missingTableLogged = false;
const isMissingPriceTable = (error) => error?.code === '42P01' && /lab_test_prices/.test(String(error?.message || ''));

/**
 * 'lab' when this lab has an active price list, otherwise 'standard'. A lab id
 * that is absent or malformed is 'standard' (the cart of an older app sends no
 * lab). Before the lab_test_prices migration is applied every lab is
 * 'standard'.
 */
export async function labPriceSource(labId) {
  const id = normaliseLabId(labId);
  if (!id) return PRICE_SOURCES.STANDARD;
  try {
    const { rows } = await pool.query(LAB_HAS_PRICE_LIST_SQL, [id]);
    return rows.length ? PRICE_SOURCES.LAB : PRICE_SOURCES.STANDARD;
  } catch (error) {
    if (!isMissingPriceTable(error)) throw error;
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn('[lab-pricing] lab_test_prices does not exist yet; every lab prices from the Standard catalogue');
    }
    return PRICE_SOURCES.STANDARD;
  }
}

/**
 * Bookable rows for the given identifiers (test_id, test_code or name), keyed
 * by each of those three in lowercase. With a lab that has a price list, only
 * that lab's active tests are found, at its prices. Each row carries
 * `price_source`.
 */
export async function catalogueByIdentifier(identifiers, { labId = null, priceSource = null } = {}) {
  const ids = [...new Set((identifiers || []).filter((v) => v !== null && v !== undefined && v !== '').map(String))];
  const map = new Map();
  if (!ids.length) return map;
  const source = priceSource || await labPriceSource(labId);
  const { rows } = source === PRICE_SOURCES.LAB
    ? await pool.query(LAB_BY_IDENTIFIER_SQL, [ids, normaliseLabId(labId)])
    : await pool.query(STANDARD_BY_IDENTIFIER_SQL, [ids]);
  for (const row of rows) {
    for (const key of [row.test_id, row.test_code, row.name]) {
      if (key !== null && key !== undefined) map.set(String(key).toLowerCase(), row);
    }
  }
  return map;
}

const priceSourceOf = (row) => (row?.price_source === PRICE_SOURCES.LAB ? PRICE_SOURCES.LAB : PRICE_SOURCES.STANDARD);

/** A priced row as a test a patient can pick: `id` is what the cart and booking accept. */
export function bookableTestFromRow(row) {
  const hours = Number(row.turnaround_time_hours);
  return {
    id: row.test_id,
    catalogTestId: row.test_id,
    code: row.test_code ?? null,
    name: row.name,
    category: row.category ?? null,
    sampleType: row.sample_type ?? null,
    price: amount(row.price),
    currency: row.currency || 'INR',
    homeCollectionCharge: optionalAmount(row.home_collection_charge),
    duration: Number.isFinite(hours) && hours > 0 ? `${hours} hours` : null,
    priceSource: priceSourceOf(row),
  };
}

const isDiagnosticRow = (row) => DIAGNOSTIC_CATEGORIES.has(String(row.category || '').trim().toLowerCase());

/**
 * The tests a lab can be booked for, priced as the cart and the booking will
 * price them. `serviceType` narrows to checkup or diagnostic tests; if that
 * leaves nothing, every test is returned (as the old listing did).
 *
 * @returns {Promise<{ priceSource: 'lab'|'standard', tests: object[] }>}
 */
export async function listBookableLabTests({ serviceType, labId = null } = {}) {
  const priceSource = await labPriceSource(labId);
  const { rows } = priceSource === PRICE_SOURCES.LAB
    ? await pool.query(LAB_LIST_SQL, [normaliseLabId(labId)])
    : await pool.query(STANDARD_LIST_SQL);
  let chosen = rows;
  if (serviceType === 'checkup' || serviceType === 'diagnostic') {
    const wantDiagnostic = serviceType === 'diagnostic';
    const narrowed = rows.filter((row) => isDiagnosticRow(row) === wantDiagnostic);
    if (narrowed.length) chosen = narrowed;
  }
  return { priceSource, tests: chosen.map(bookableTestFromRow) };
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class LabPricingError extends Error {
  constructor(message, { errorCode = 'LAB_PRICING_INVALID', unavailableTests, statusCode = 400 } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    if (unavailableTests) this.unavailableTests = unavailableTests;
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      errorCode: this.errorCode,
      ...(this.unavailableTests ? { unavailableTests: this.unavailableTests } : {}),
    };
  }
}

// ── Plan lab benefit ─────────────────────────────────────────────────────────

/**
 * Normalise `coverageDetails.labTests` into the benefit pricing applies, or
 * null when the plan gives no lab benefit. A limit with a period this code
 * does not know is not applied (reported, not guessed at).
 */
export function labBenefitFromPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const pct = Number(raw.discountPct);
  const discountPct = Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0;
  const limit = Number(raw.limitINR);
  let limitINR = Number.isFinite(limit) && limit > 0 ? amount(limit) : 0;
  const declaredPeriod = raw.period === undefined || raw.period === null || raw.period === '' ? 'plan_term' : String(raw.period);
  const period = LAB_BENEFIT_PERIODS.includes(declaredPeriod) ? declaredPeriod : null;
  const unknownPeriod = limitINR > 0 && !period ? declaredPeriod : null;
  if (unknownPeriod) limitINR = 0;
  if (!discountPct && !limitINR) return unknownPeriod ? { discountPct: 0, limitINR: 0, period: null, unknownPeriod } : null;
  return { discountPct, limitINR, period: limitINR ? period : null, ...(unknownPeriod ? { unknownPeriod } : {}) };
}

const ACTIVE_PLANS_SQL = `
  SELECT up.id AS user_plan_id, up."membershipPlanId" AS plan_id,
         mp.name AS plan_name, mp.type AS plan_type, mp."planType" AS plan_kind,
         mp.metadata -> 'coverageDetails' -> 'labTests' AS lab_benefit
    FROM user_plans up
    JOIN membership_plans mp ON mp.id = up."membershipPlanId"
   WHERE up."userId" = $1
     AND up.status = 'active'
     AND (up."startDate" IS NULL OR up."startDate" <= CURRENT_DATE)
     AND (up."endDate" IS NULL OR up."endDate" >= CURRENT_DATE)
   ORDER BY up."createdAt" DESC`;

// appointments has FORCED row-level security: read inside the member's context.
const ALLOWANCE_USED_SQL = `
  SELECT COALESCE(SUM(NULLIF(metadata ->> 'planCoveredAmount', '')::numeric), 0) AS used
    FROM appointments
   WHERE "userId" = $1
     AND type = 'lab'
     AND status <> 'cancelled'
     AND metadata ->> 'planUserPlanId' = $2
     AND ($3 <> 'month'
          OR "createdAt" >= (date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))`;

async function allowanceUsed(userId, userPlanId, period) {
  const used = await withRlsTransaction(pool, { userId, orgId: 0 }, async (client) => {
    const { rows } = await client.query(ALLOWANCE_USED_SQL, [userId, String(userPlanId), period]);
    return rows[0]?.used;
  });
  return amount(used || 0);
}

/**
 * The lab benefit of the user's active, in-window plans. When more than one
 * plan defines one, the plan that takes the most off this subtotal applies
 * (benefits are not stacked across plans).
 *
 * @returns {Promise<{ applied: object|null, reason: string }>}
 */
async function resolvePlanBenefit(userId, subtotal) {
  const uid = Number(userId);
  if (!Number.isSafeInteger(uid) || uid <= 0) return { applied: null, reason: 'no_user' };
  const { rows } = await pool.query(ACTIVE_PLANS_SQL, [uid]);
  if (!rows.length) return { applied: null, reason: 'no_active_plan' };

  let best = null;
  let sawUnknownPeriod = null;
  for (const row of rows) {
    const benefit = labBenefitFromPlan(row.lab_benefit);
    if (!benefit) continue;
    if (benefit.unknownPeriod) sawUnknownPeriod = { planName: row.plan_name, period: benefit.unknownPeriod };
    if (!benefit.discountPct && !benefit.limitINR) continue;
    const planDiscount = benefit.discountPct ? amount((subtotal * benefit.discountPct) / 100) : 0;
    let usedINR = null;
    let remainingINR = null;
    let coveredAmount = 0;
    if (benefit.limitINR) {
      usedINR = await allowanceUsed(uid, row.user_plan_id, benefit.period);
      remainingINR = amount(Math.max(0, benefit.limitINR - usedINR));
      coveredAmount = amount(Math.min(subtotal - planDiscount, remainingINR));
    }
    const candidate = {
      userPlanId: row.user_plan_id,
      planId: row.plan_id,
      planName: row.plan_name,
      planType: row.plan_type ?? null,
      discountPct: benefit.discountPct,
      limitINR: benefit.limitINR,
      period: benefit.period,
      usedINR,
      remainingINR,
      planDiscount,
      coveredAmount,
    };
    if (!best || candidate.planDiscount + candidate.coveredAmount > best.planDiscount + best.coveredAmount) best = candidate;
  }
  if (best) return { applied: best, reason: best.planDiscount + best.coveredAmount > 0 ? 'applied' : 'allowance_exhausted' };
  if (sawUnknownPeriod) {
    console.warn(`[lab-pricing] plan "${sawUnknownPeriod.planName}" labTests.period "${sawUnknownPeriod.period}" is not one of ${LAB_BENEFIT_PERIODS.join(', ')}; its allowance is not applied`);
    return { applied: null, reason: 'plan_lab_benefit_period_unknown' };
  }
  return { applied: null, reason: 'plan_has_no_lab_benefit' };
}

// ── Corporate health-package family price ───────────────────────────────────

const FAMILY_PACKAGE_SQL = `
  SELECT "packageDetails" AS details
    FROM user_health_packages
   WHERE "userId" = $1 AND "packageId" = $2
     AND LOWER(COALESCE(status, 'active')) = 'active'
     AND ("validFrom" IS NULL OR "validFrom" <= NOW())
     AND ("validTo" IS NULL OR "validTo" >= NOW())
   ORDER BY "validTo" DESC NULLS LAST
   LIMIT 1`;

const parseObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * The price a family member pays for the employee's corporate health package,
 * from the employee's own entitlement row — never from the client. Same
 * arithmetic as the Benefits hub (/api/employee/benefits familyPrice): package
 * price less its familyDiscountPercent, in whole rupees. A package without a
 * price or a family discount is not priced by guesswork: it is refused.
 */
async function corporateFamilyPrice(userId, packageId) {
  const { rows } = await pool.query(FAMILY_PACKAGE_SQL, [Number(userId), String(packageId)]);
  const details = parseObject(rows[0]?.details);
  const price = Number(details.price ?? details.cost);
  const rawPct = details.familyDiscountPercent ?? details.familyDiscount;
  const pct = rawPct === null || rawPct === undefined || rawPct === '' ? NaN : Number(rawPct);
  if (!rows.length || !(Number.isFinite(price) && price > 0) || !Number.isFinite(pct)) {
    throw new LabPricingError(
      'A family price has not been set for this health package yet. Please contact your HR team.',
      { errorCode: 'FAMILY_PRICE_NOT_CONFIGURED', statusCode: 409 },
    );
  }
  const familyDiscountPercent = Math.min(100, Math.max(0, pct));
  return {
    packagePrice: amount(price),
    familyDiscountPercent,
    familyPrice: Math.max(0, Math.round((price * (100 - familyDiscountPercent)) / 100)),
  };
}

// ── Booking price ────────────────────────────────────────────────────────────

const identifierOf = (test) => {
  if (test === null || test === undefined) return null;
  if (typeof test !== 'object') return test;
  return test.catalogTestId ?? test.id ?? test.testId ?? null;
};

/** The tests as sent, unpriced — kept on bookings whose price is not a test price. */
const passThroughTests = (tests) => tests
  .filter((test) => test && typeof test === 'object')
  .map((test) => ({ id: test.id ?? null, name: typeof test.name === 'string' ? test.name : '' }));

/**
 * Price a lab booking. Shared by POST /labs/book and POST /labs/book/quote so
 * the quote is exactly what the booking charges.
 *
 * @param {object} input
 * @param {*}       input.labId                  the lab being booked (its price list applies)
 * @param {*}       [input.userId]               the booking account (its plan applies)
 * @param {Array}   input.tests                  [{id, name?, price?}]; `price` is ignored
 * @param {string}  [input.corporateBenefitSource]
 * @param {*}       [input.corporatePackageId]
 * @param {boolean} [input.isFamilyBooking]      a verified family member on the user's list is the patient
 * @returns {Promise<{basis, priceSource, tests, testsSubtotal, planDiscount, coveredAmount,
 *   collectionFee, totalFee, currency, paymentRequired, planBenefit, corporatePackage}>}
 * @throws {LabPricingError} 400 — a test is not bookable at this lab; 409 — no family price set
 */
export async function priceLabBooking({
  labId = null,
  userId = null,
  tests = [],
  corporateBenefitSource = null,
  corporatePackageId = null,
  isFamilyBooking = false,
} = {}) {
  if (!Array.isArray(tests)) throw new LabPricingError('tests must be a list of lab tests.');
  const result = (basis, pricedTests, testsSubtotal, extra = {}) => {
    const subtotal = amount(testsSubtotal);
    const planDiscount = amount(extra.planDiscount || 0);
    const coveredAmount = amount(extra.coveredAmount || 0);
    const total = amount(Math.max(0, subtotal - planDiscount - coveredAmount));
    return {
      basis,
      priceSource: extra.priceSource ?? null,
      tests: pricedTests,
      testsSubtotal: subtotal,
      planDiscount,
      coveredAmount,
      collectionFee: 0,
      totalFee: total,
      currency: 'INR',
      paymentRequired: total > 0,
      planBenefit: extra.planBenefit ?? null,
      corporatePackage: extra.corporatePackage ?? null,
    };
  };

  // Corporate health-package bookings: the employee's own package is prepaid
  // by the employer (free to the employee); a family member pays the package's
  // family price, read from the employee's entitlement (never the client's).
  // The route has already checked the account holds the package.
  if (CORPORATE_BENEFIT_SOURCES.includes(corporateBenefitSource) && corporatePackageId) {
    if (isFamilyBooking) {
      const family = await corporateFamilyPrice(userId, corporatePackageId);
      return result('corporate-family-discount', passThroughTests(tests), family.packagePrice, {
        planDiscount: family.packagePrice - family.familyPrice,
        corporatePackage: { packageId: String(corporatePackageId), ...family },
      });
    }
    return result('corporate-package', passThroughTests(tests), 0, {
      corporatePackage: { packageId: String(corporatePackageId), packagePrice: null, familyDiscountPercent: null, familyPrice: null },
    });
  }

  if (tests.length > MAX_TESTS_PER_BOOKING) {
    throw new LabPricingError(`Select at most ${MAX_TESTS_PER_BOOKING} tests in one booking.`);
  }
  const priceSource = await labPriceSource(labId);
  // A visit booked without tests (the web quick-booking modal) has nothing to
  // price: the lab bills what it performs. No invented fee is added.
  if (!tests.length) return result('no-tests-selected', [], 0, { priceSource });

  const identifiers = tests.map(identifierOf);
  const rowsByIdentifier = await catalogueByIdentifier(identifiers, { labId, priceSource });
  const priced = [];
  const unavailable = [];
  const seen = new Set();
  tests.forEach((test, index) => {
    const identifier = identifiers[index];
    const row = identifier === null || identifier === undefined || identifier === ''
      ? null
      : rowsByIdentifier.get(String(identifier).toLowerCase());
    if (!row) {
      unavailable.push({ id: identifier ?? null, name: typeof test?.name === 'string' ? test.name : '' });
      return;
    }
    // The same test named twice (by id and by code) is booked and billed once.
    if (seen.has(row.test_id)) return;
    seen.add(row.test_id);
    priced.push({
      id: test?.id ?? row.test_id,
      catalogTestId: row.test_id,
      code: row.test_code ?? null,
      name: row.name,
      price: amount(row.price),
      currency: row.currency || 'INR',
      priceSource: priceSourceOf(row),
    });
  });

  if (unavailable.length) {
    throw new LabPricingError(
      priceSource === PRICE_SOURCES.LAB
        ? (unavailable.length === 1 ? 'This lab does not offer this test.' : 'This lab does not offer some of these tests.')
        : (unavailable.length === 1
          ? 'This test is not available for booking right now.'
          : 'Some of these tests are not available for booking right now.'),
      { errorCode: 'TEST_NOT_BOOKABLE', unavailableTests: unavailable },
    );
  }

  const subtotal = amount(priced.reduce((sum, test) => sum + test.price, 0));

  let plan = { applied: null, reason: subtotal > 0 ? 'no_user' : 'nothing_to_discount' };
  if (subtotal > 0) {
    try {
      plan = await resolvePlanBenefit(userId, subtotal);
    } catch (error) {
      // Never block a booking because the plan lookup failed; it is priced
      // without the benefit, and the quote says why.
      console.error('[lab-pricing] plan benefit lookup failed:', error.message);
      plan = { applied: null, reason: 'lookup_failed' };
    }
  }
  const applied = plan.applied;
  const planBenefit = applied
    ? {
      applied: applied.planDiscount + applied.coveredAmount > 0,
      reason: plan.reason,
      appliesTo: isFamilyBooking ? 'family-member' : 'self',
      userPlanId: applied.userPlanId,
      planId: applied.planId,
      planName: applied.planName,
      planType: applied.planType,
      discountPct: applied.discountPct,
      limitINR: applied.limitINR,
      period: applied.period,
      usedINR: applied.usedINR,
      remainingINR: applied.remainingINR,
    }
    : { applied: false, reason: plan.reason };
  const benefitTaken = applied && applied.planDiscount + applied.coveredAmount > 0;

  return result(benefitTaken ? 'plan-benefit' : 'catalog', priced, subtotal, {
    priceSource,
    planDiscount: benefitTaken ? applied.planDiscount : 0,
    coveredAmount: benefitTaken ? applied.coveredAmount : 0,
    planBenefit,
  });
}
