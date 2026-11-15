/**
 * Lab booking pricing — the one place a lab test's price is decided.
 *
 * Every lab surface the patient apps use reads it:
 *   GET  /api/labs/:labId/tests   lists the bookable tests       (listBookableLabTests)
 *   POST /api/cart/add|sync, GET  re-prices the cart              (catalogueByIdentifier)
 *   POST /api/labs/book/quote     prices a booking before it is made (priceLabBooking)
 *   POST /api/labs/book           prices the booking it creates   (priceLabBooking)
 *
 * The price source is the active `api_lab_tests` catalogue (W-LAB-2 / D-8),
 * the same table /api/lab-tests/checkout bills from. A client-sent price is
 * never used.
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
 * the catalogue prices. The /labs/book flow books a visit to the lab (it
 * has no home-collection step), so the per-test home_collection_charge does
 * not apply here; it is returned per test for a future home-collection flow.
 */
import pool from '../db/pgPool.js';

export const CORPORATE_BENEFIT_SOURCES = Object.freeze(['corporate-benefit', 'corporate-family-benefit']);

// Categories booked as "diagnostic" (imaging / cardiac) rather than "checkup".
const DIAGNOSTIC_CATEGORIES = new Set(['radiology', 'cardiology', 'cardiac']);

const MAX_TESTS_PER_BOOKING = 30;

const CATALOGUE_COLUMNS = `test_id, name, test_code, category, sample_type, turnaround_time_hours,
       price, currency, home_collection_charge`;

// A row is bookable only with a confirmed, finite, non-negative INR price.
const BOOKABLE = `status = 'active' AND price IS NOT NULL AND price::numeric >= 0
     AND (currency IS NULL OR currency = 'INR')`;

const CATALOGUE_BY_IDENTIFIER_SQL = `
  SELECT ${CATALOGUE_COLUMNS}
    FROM api_lab_tests
   WHERE ${BOOKABLE}
     AND (
       test_id::text = ANY($1::text[])
       OR LOWER(test_code) IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)
       OR LOWER(name)      IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)
     )`;

const CATALOGUE_LIST_SQL = `
  SELECT ${CATALOGUE_COLUMNS}
    FROM api_lab_tests
   WHERE ${BOOKABLE}
   ORDER BY category, name`;

const amount = (value) => Math.round(Number(value) * 100) / 100;
const optionalAmount = (value) => (value === null || value === undefined ? null : amount(value));

/**
 * Catalogue rows for the given identifiers (test_id, test_code or name),
 * keyed by each of those three in lowercase.
 */
export async function catalogueByIdentifier(identifiers) {
  const ids = [...new Set((identifiers || []).filter((v) => v !== null && v !== undefined && v !== '').map(String))];
  const map = new Map();
  if (!ids.length) return map;
  const { rows } = await pool.query(CATALOGUE_BY_IDENTIFIER_SQL, [ids]);
  for (const row of rows) {
    for (const key of [row.test_id, row.test_code, row.name]) {
      if (key !== null && key !== undefined) map.set(String(key).toLowerCase(), row);
    }
  }
  return map;
}

/** A catalogue row as a test a patient can pick: `id` is what the cart and booking accept. */
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
    priceSource: 'catalog',
  };
}

const isDiagnosticRow = (row) => DIAGNOSTIC_CATEGORIES.has(String(row.category || '').trim().toLowerCase());

/**
 * The tests a lab can be booked for, priced as the cart and the booking will
 * price them. `serviceType` narrows to checkup or diagnostic tests; if that
 * leaves nothing, every test is returned (as the old listing did).
 */
export async function listBookableLabTests({ serviceType } = {}) {
  const { rows } = await pool.query(CATALOGUE_LIST_SQL);
  let chosen = rows;
  if (serviceType === 'checkup' || serviceType === 'diagnostic') {
    const wantDiagnostic = serviceType === 'diagnostic';
    const narrowed = rows.filter((row) => isDiagnosticRow(row) === wantDiagnostic);
    if (narrowed.length) chosen = narrowed;
  }
  return chosen.map(bookableTestFromRow);
}

export class LabPricingError extends Error {
  constructor(message, { errorCode = 'LAB_PRICING_INVALID', unavailableTests } = {}) {
    super(message);
    this.statusCode = 400;
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

const identifierOf = (test) => {
  if (test === null || test === undefined) return null;
  if (typeof test !== 'object') return test;
  return test.catalogTestId ?? test.id ?? test.testId ?? null;
};

/** The tests as sent, unpriced — kept on bookings whose price is not the catalogue's. */
const passThroughTests = (tests) => tests
  .filter((test) => test && typeof test === 'object')
  .map((test) => ({ id: test.id ?? null, name: typeof test.name === 'string' ? test.name : '' }));

/**
 * Price a lab booking. Shared by POST /labs/book and POST /labs/book/quote so
 * the quote is exactly what the booking charges.
 *
 * @param {object} input
 * @param {Array}   input.tests                  [{id, name?, price?}]; `price` is ignored
 * @param {string}  [input.corporateBenefitSource]
 * @param {*}       [input.corporatePackageId]
 * @param {boolean} [input.isFamilyBooking]      a verified family member is the patient
 * @param {*}       [input.familyDiscountedPrice]
 * @returns {Promise<{basis, tests, testsSubtotal, collectionFee, totalFee, currency, paymentRequired}>}
 * @throws {LabPricingError} 400 — a test is not in the bookable catalogue
 */
export async function priceLabBooking({
  tests = [],
  corporateBenefitSource = null,
  corporatePackageId = null,
  isFamilyBooking = false,
  familyDiscountedPrice = null,
} = {}) {
  if (!Array.isArray(tests)) throw new LabPricingError('tests must be a list of lab tests.');
  const result = (basis, pricedTests, testsSubtotal) => {
    const subtotal = amount(testsSubtotal);
    return {
      basis,
      tests: pricedTests,
      testsSubtotal: subtotal,
      collectionFee: 0,
      totalFee: subtotal,
      currency: 'INR',
      paymentRequired: subtotal > 0,
    };
  };

  // Corporate benefit bookings keep their existing rules: the employee's own
  // corporate package is prepaid by the employer (free to the employee); a
  // family member's discounted package is the price the benefit set.
  if (CORPORATE_BENEFIT_SOURCES.includes(corporateBenefitSource)) {
    const discounted = Number(familyDiscountedPrice);
    const safeDiscounted = familyDiscountedPrice !== null && familyDiscountedPrice !== undefined && familyDiscountedPrice !== ''
      && Number.isFinite(discounted) && discounted >= 0 ? discounted : null;
    if (isFamilyBooking && safeDiscounted !== null) {
      return result('corporate-family-discount', passThroughTests(tests), safeDiscounted);
    }
    if (corporatePackageId) {
      return result('corporate-package', passThroughTests(tests), 0);
    }
  }

  if (tests.length > MAX_TESTS_PER_BOOKING) {
    throw new LabPricingError(`Select at most ${MAX_TESTS_PER_BOOKING} tests in one booking.`);
  }
  // A visit booked without tests (the web quick-booking modal) has nothing to
  // price: the lab bills what it performs. No invented fee is added.
  if (!tests.length) return result('no-tests-selected', [], 0);

  const identifiers = tests.map(identifierOf);
  const catalogue = await catalogueByIdentifier(identifiers);
  const priced = [];
  const unavailable = [];
  const seen = new Set();
  tests.forEach((test, index) => {
    const identifier = identifiers[index];
    const row = identifier === null || identifier === undefined || identifier === ''
      ? null
      : catalogue.get(String(identifier).toLowerCase());
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
    });
  });

  if (unavailable.length) {
    throw new LabPricingError(
      unavailable.length === 1
        ? 'This test is not available for booking right now.'
        : 'Some of these tests are not available for booking right now.',
      { errorCode: 'TEST_NOT_BOOKABLE', unavailableTests: unavailable },
    );
  }

  return result('catalog', priced, priced.reduce((sum, test) => sum + test.price, 0));
}
