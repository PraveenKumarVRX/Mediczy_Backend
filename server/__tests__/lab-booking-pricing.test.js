/**
 * QA-06 / QA-07 (My SmartHealth app 1.5.2): lab tests listed for a lab must be
 * ones the cart accepts, and POST /labs/book must charge exactly what POST
 * /labs/book/quote says — no invented ₹1,500/₹2,500 fee.
 *
 * Owner decisions 2026-11-15:
 *   1. labs set their own test lists and prices (lab_test_prices); a lab
 *      without one books from the Standard catalogue
 *   2. a member's plan lab benefit applies to the member and the verified
 *      family members on their list; a client-sent family price is ignored
 */
import { jest } from '@jest/globals';

const CATALOGUE = [
  { test_id: 'CBC-001', name: 'Complete Blood Count (CBC)', test_code: 'CBC', category: 'Haematology', sample_type: 'EDTA Blood', turnaround_time_hours: 6, price: '299.00', currency: 'INR', home_collection_charge: '50.00' },
  { test_id: 'LIP-001', name: 'Lipid Profile', test_code: 'LIPID', category: 'Biochemistry', sample_type: 'Serum', turnaround_time_hours: 8, price: '499.50', currency: 'INR', home_collection_charge: '50.00' },
  { test_id: 'RAD-001', name: 'Chest X-Ray', test_code: 'CXR', category: 'Radiology', sample_type: null, turnaround_time_hours: 2, price: '450.00', currency: 'INR', home_collection_charge: null },
];

// lab id -> { test_id: price } (active rows). Lab 78 is standard (no list).
const LAB_PRICES = new Map([[80, { 'CBC-001': '250.00', 'RAD-001': '600.00' }]]);
// user id -> active plans (ACTIVE_PLANS_SQL rows)
const PLANS = new Map();
// user id -> packageId -> packageDetails
const PACKAGES = new Map([[7646, { 12: { price: 2500, familyDiscountPercent: 20 }, 13: { price: null } }]]);
let allowanceUsed = [0];
let priceTableMissing = false;

const wantedOf = (params) => params[0].map((v) => String(v).toLowerCase());
const matchesWanted = (row, wanted) => [row.test_id, row.test_code, row.name].some((k) => wanted.includes(String(k).toLowerCase()));
const standardRow = (r) => ({ ...r, price_source: 'standard' });
const labRows = (labId) => Object.entries(LAB_PRICES.get(Number(labId)) || {}).map(([testId, price]) => {
  const t = CATALOGUE.find((c) => c.test_id === testId);
  return { ...t, price, currency: 'INR', home_collection_charge: null, price_source: 'lab' };
});

const mockQuery = jest.fn(async (sql, params = []) => {
  if (/FROM lab_test_prices WHERE lab_id = \$1 AND is_active LIMIT 1/.test(sql)) {
    if (priceTableMissing) throw Object.assign(new Error('relation "lab_test_prices" does not exist'), { code: '42P01' });
    return { rows: LAB_PRICES.has(Number(params[0])) ? [{ '?column?': 1 }] : [] };
  }
  if (/FROM lab_test_prices p/.test(sql)) {
    const labId = /ANY\(\$1/.test(sql) ? params[1] : params[0];
    const rows = labRows(labId);
    return { rows: /ANY\(\$1/.test(sql) ? rows.filter((r) => matchesWanted(r, wantedOf(params))) : rows };
  }
  if (/FROM user_plans up/.test(sql)) return { rows: PLANS.get(Number(params[0])) || [] };
  if (/FROM user_health_packages/.test(sql)) {
    const details = PACKAGES.get(Number(params[0]))?.[params[1]];
    return { rows: details ? [{ details }] : [] };
  }
  if (/ANY\(\$1/.test(sql)) return { rows: CATALOGUE.filter((r) => matchesWanted(r, wantedOf(params))).map(standardRow) };
  return { rows: CATALOGUE.map(standardRow) };
});
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

// The allowance read runs inside the member's RLS context.
const rlsContexts = [];
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  withRlsTransaction: jest.fn(async (pool, context, work) => {
    rlsContexts.push(context);
    const used = allowanceUsed.length > 1 ? allowanceUsed.shift() : allowanceUsed[0];
    return work({ query: async () => ({ rows: [{ used: String(used) }] }) });
  }),
}));

const activeLab = { id: 78, unique_id: 'LQ7K2P', name: 'MEDALL LABS', address: { city: 'Chennai' }, phone: '044' };
const pricedLab = { id: 80, unique_id: 'LZ8M4T', name: 'ORANGE HEALTH', address: { city: 'Chennai' }, phone: '044' };
const labsById = new Map([[78, activeLab], [80, pricedLab]]);
const Lab = {
  findByPk: jest.fn(async (id) => labsById.get(Number(id)) || null),
  findOne: jest.fn(async ({ where }) => labsById.get(Number(where.id)) || null),
};
jest.unstable_mockModule('../models/postgres/lab.model.postgres.js', () => ({ default: Lab }));
// user_health_packages entitlement lookup: the employee holds packages 12 and 13.
const entitledPackages = new Set(['12', '13']);
const familyTx = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
const familyMember = { id: 55, userId: 7646, firstName: 'Asha', lastName: 'Employee', relationship: 'spouse', phoneNumber: '9' };
jest.unstable_mockModule('../models/postgres/family-member.model.postgres.js', () => ({ default: {
  findOne: jest.fn(async ({ where }) => (Number(where.id) === 55 && Number(where.userId) === 7646 ? familyMember : null)),
  sequelize: {
    transaction: jest.fn(async () => familyTx),
    query: jest.fn(async (sql, opts = {}) => (/user_health_packages/.test(sql) && entitledPackages.has(String(opts.replacements?.pid)) ? [{ '?column?': 1 }] : [])),
  },
} }));

const appointmentCreate = jest.fn(async (values) => ({ id: 501, ...values }));
const transaction = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
const appointmentQuery = jest.fn(async () => []);
jest.unstable_mockModule('../models/index.js', () => ({
  Appointment: { create: appointmentCreate, sequelize: { transaction: jest.fn(async () => transaction), query: appointmentQuery } },
  LabTest: {},
}));
jest.unstable_mockModule('../services/lab-appointment-history.service.js', () => ({
  ensureLabAppointmentHistory: jest.fn(async () => ({ id: 901 })),
}));
const orderCreate = jest.fn(async (values) => ({ id: 77, ...values }));
jest.unstable_mockModule('../models/billing.model.intelligent.js', () => ({ Order: { create: orderCreate } }));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser: (req, res, next) => next() }));
jest.unstable_mockModule('../db/orchestrator.js', () => ({ orchestrator: {} }));

const { priceLabBooking, listBookableLabTests, labBenefitFromPlan } = await import('../services/lab-booking-pricing.service.js');
const labRouter = (await import('../routes/lab.route.enhanced.js')).default;
const cartRouter = (await import('../routes/cart.route.js')).default;

function handler(router, method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`no ${method.toUpperCase()} ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function reply() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const user = { id: 7646, organization_id: 4 };
const bookingBody = (overrides = {}) => ({
  labId: 78,
  appointmentDate: '2026-12-01',
  appointmentTime: '09:00',
  serviceType: 'checkup',
  testType: 'Health Checkup',
  // The client's prices are wrong on purpose: the server must ignore them.
  tests: [{ id: 'CBC-001', name: 'CBC', price: 500 }, { id: 'LIP-001', name: 'Lipid', price: 1 }],
  patientName: 'QA Employee',
  bookingFor: 'self',
  familyMemberId: null,
  corporateBenefitSource: null,
  corporatePackageId: null,
  ...overrides,
});

const plan = (overrides = {}) => ({
  user_plan_id: 901, plan_id: 9, plan_name: 'Corporate Basic Plus', plan_type: 'corporate', plan_kind: 'health_checkup', lab_benefit: null, ...overrides,
});

async function quote(body, who = user) {
  const res = reply();
  await handler(labRouter, 'post', '/book/quote')({ user: who, body }, res);
  return res;
}
async function book(body, who = user) {
  const res = reply();
  await handler(labRouter, 'post', '/book')({ user: who, body }, res);
  return res;
}

beforeEach(() => {
  appointmentCreate.mockClear();
  orderCreate.mockClear();
  appointmentQuery.mockClear();
  PLANS.clear();
  allowanceUsed = [0];
  priceTableMissing = false;
  rlsContexts.length = 0;
});

describe('QA-06: GET /labs/:labId/tests lists only tests the cart accepts', () => {
  test('every listed test is added to the cart, at the listed price', async () => {
    const res = reply();
    await handler(labRouter, 'get', '/:labId/tests')({ params: { labId: '78' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.priceSource).toBe('standard');
    const ids = res.body.tests.map((t) => t.id);
    expect(ids).toEqual(['CBC-001', 'LIP-001', 'RAD-001']);
    // The eight hardcoded sample tests (ids 1-8) are gone.
    expect(ids).not.toContain(1);

    for (const test of res.body.tests) {
      const added = reply();
      await handler(cartRouter, 'post', '/add')({ user: { id: 6001 }, body: { test: { ...test, price: 1 }, labId: 78, quantity: 1 } }, added);
      expect(added.statusCode).toBe(200);
      expect(added.body.cart.at(-1).test.price).toBe(test.price);
      expect(added.body.cart.at(-1).test.priceSource).toBe('standard');
    }
  });

  test('serviceType narrows checkup vs diagnostic by catalogue category', async () => {
    expect((await listBookableLabTests({ serviceType: 'diagnostic' })).tests.map((t) => t.id)).toEqual(['RAD-001']);
    expect((await listBookableLabTests({ serviceType: 'checkup' })).tests.map((t) => t.id)).toEqual(['CBC-001', 'LIP-001']);
  });

  test('an unknown lab is a 404, not a list of invented tests', async () => {
    const res = reply();
    await handler(labRouter, 'get', '/:labId/tests')({ params: { labId: '999999' }, query: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.tests).toBeUndefined();
  });
});

describe('Decision 1: a lab with its own price list offers only those tests, at those prices', () => {
  test('the listing is the lab’s list, marked priceSource lab', async () => {
    const res = reply();
    await handler(labRouter, 'get', '/:labId/tests')({ params: { labId: '80' }, query: {} }, res);
    expect(res.body).toMatchObject({ priceSource: 'lab', labUid: 'LZ8M4T' });
    expect(res.body.tests.map((t) => [t.id, t.price, t.priceSource])).toEqual([['CBC-001', 250, 'lab'], ['RAD-001', 600, 'lab']]);
  });

  test('cart: the lab price applies; a test the lab does not offer is refused; no lab = Standard', async () => {
    const atLab = reply();
    await handler(cartRouter, 'post', '/add')({ user: { id: 6002 }, body: { test: { id: 'CBC-001', price: 1 }, labId: 80 } }, atLab);
    expect(atLab.body.cart[0]).toMatchObject({ labId: 80, test: { price: 250, priceSource: 'lab' } });

    const notOffered = reply();
    await handler(cartRouter, 'post', '/add')({ user: { id: 6002 }, body: { test: { id: 'LIP-001' }, labId: 80 } }, notOffered);
    expect(notOffered.statusCode).toBe(400);
    expect(notOffered.body.errorCode).toBe('TEST_NOT_BOOKABLE');

    // The shipped app sends no lab: Standard price, and a separate line from the lab's.
    const noLab = reply();
    await handler(cartRouter, 'post', '/add')({ user: { id: 6002 }, body: { test: { id: 'CBC-001' } } }, noLab);
    expect(noLab.body.cart.map((i) => [i.labId, i.test.price, i.test.priceSource])).toEqual([[80, 250, 'lab'], [null, 299, 'standard']]);
  });

  test('cart sync prices each item at its own lab', async () => {
    const res = reply();
    await handler(cartRouter, 'post', '/sync')({ user: { id: 6003 }, body: { items: [
      { id: 'CBC-001', labInfo: { id: 80 } }, { test: { id: 'CBC-001', labId: 78 } }, { test: { id: 'LIP-001', labId: 80 } },
    ] } }, res);
    expect(res.body.cart.map((i) => [i.labId, i.test.price])).toEqual([[80, 250], [78, 299]]);
    expect(res.body.removedUnavailable).toEqual(['LIP-001']);
  });

  test('quote and booking charge the lab’s price; a test it does not offer is refused by both', async () => {
    const body = bookingBody({ labId: 80, tests: [{ id: 'CBC-001', price: 1 }, { id: 'cxr' }] });
    const quoted = await quote(body);
    expect(quoted.body.quote).toMatchObject({ priceSource: 'lab', labUid: 'LZ8M4T', testsSubtotal: 850, totalFee: 850, basis: 'catalog' });
    const booked = await book(body);
    expect(booked.body.payment.amount).toBe(850);
    expect(booked.body.quote).toEqual(quoted.body.quote);
    expect(appointmentCreate.mock.calls[0][0].metadata).toMatchObject({ priceSource: 'lab', totalFee: 850 });
    expect(appointmentCreate.mock.calls[0][0].doctorDetails).toMatchObject({ labId: 80, labUid: 'LZ8M4T' });

    for (const fn of [quote, book]) {
      const res = await fn(bookingBody({ labId: 80, tests: [{ id: 'LIP-001', name: 'Lipid' }] }));
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ errorCode: 'TEST_NOT_BOOKABLE', unavailableTests: [{ id: 'LIP-001', name: 'Lipid' }] });
    }
  });

  test('before the lab_test_prices migration is applied, every lab is Standard', async () => {
    priceTableMissing = true;
    const listing = await listBookableLabTests({ labId: 80 });
    expect(listing.priceSource).toBe('standard');
    expect(listing.tests).toHaveLength(3);
  });
});

describe('QA-07: POST /labs/book charges what POST /labs/book/quote quotes', () => {
  test('quote is the sum of catalogue prices; no base fee, client prices ignored', async () => {
    const res = await quote(bookingBody({ appointmentDate: undefined, appointmentTime: undefined }));
    expect(res.statusCode).toBe(200);
    expect(res.body.quote).toMatchObject({
      labId: 78, currency: 'INR', priceSource: 'standard', testsSubtotal: 798.5, planDiscount: 0, coveredAmount: 0,
      collectionFee: 0, totalFee: 798.5, paymentRequired: true, basis: 'catalog',
      planBenefit: { applied: false, reason: 'no_active_plan' },
    });
    expect(res.body.quote.tests.map((t) => t.price)).toEqual([299, 499.5]);
    expect(appointmentCreate).not.toHaveBeenCalled();
    expect(orderCreate).not.toHaveBeenCalled();
  });

  test('booking records and bills exactly the quoted total', async () => {
    const quoted = await quote(bookingBody());
    const booked = await book(bookingBody());
    expect(booked.statusCode).toBe(201);
    const total = quoted.body.quote.totalFee;
    expect(booked.body.appointment.totalFee).toBe(total);
    expect(booked.body.payment).toMatchObject({ required: true, amount: total, orderId: 77 });
    expect(booked.body.quote).toEqual(quoted.body.quote);
    expect(appointmentCreate.mock.calls[0][0].metadata).toMatchObject({ totalFee: total, testFees: total, collectionFee: 0, pricingBasis: 'catalog' });
    expect(appointmentCreate.mock.calls[0][0].metadata.baseFee).toBeUndefined();
    expect(orderCreate.mock.calls[0][0]).toMatchObject({ subtotal: total, total });
  });

  test('a test outside the catalogue is refused by quote and booking alike, and nothing is created', async () => {
    const body = bookingBody({ tests: [{ id: 1, name: 'Complete Blood Count (CBC)', price: 500 }] });
    for (const fn of [quote, book]) {
      const res = await fn(body);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ success: false, errorCode: 'TEST_NOT_BOOKABLE', unavailableTests: [{ id: 1, name: 'Complete Blood Count (CBC)' }] });
    }
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  test('the employer-prepaid corporate package stays free to the employee', async () => {
    const res = await book(bookingBody({ corporateBenefitSource: 'corporate-benefit', corporatePackageId: 12, tests: [{ id: 12, name: 'AHC Package', price: 2500 }] }));
    expect(res.statusCode).toBe(201);
    expect(res.body.appointment.totalFee).toBe(0);
    expect(res.body.payment).toMatchObject({ required: false, amount: 0 });
    expect(res.body.quote.basis).toBe('corporate-package');
    expect(orderCreate).not.toHaveBeenCalled();
  });

  test('a corporate-package claim for a package the account does not hold is refused, not booked free', async () => {
    for (const corporatePackageId of [99, null]) {
      const res = await book(bookingBody({ corporateBenefitSource: 'corporate-benefit', corporatePackageId, tests: [{ id: 'CBC-001' }] }));
      expect(res.statusCode).toBe(403);
      expect(res.body.errorCode).toBe('PACKAGE_NOT_ENTITLED');
    }
    expect(appointmentCreate).not.toHaveBeenCalled();
  });
});

describe('Decision 2: the member’s plan lab benefit, decided by the server', () => {
  test('a plan percentage discount: quote shows the breakdown and booking charges it', async () => {
    PLANS.set(7646, [plan({ lab_benefit: { limitINR: 0, discountPct: 20 } })]);
    const quoted = await quote(bookingBody());
    expect(quoted.body.quote).toMatchObject({
      testsSubtotal: 798.5, planDiscount: 159.7, coveredAmount: 0, totalFee: 638.8, basis: 'plan-benefit',
      planBenefit: { applied: true, reason: 'applied', appliesTo: 'self', planId: 9, planName: 'Corporate Basic Plus', discountPct: 20, limitINR: 0 },
    });
    const booked = await book(bookingBody());
    expect(booked.body.quote).toEqual(quoted.body.quote);
    expect(booked.body.payment.amount).toBe(638.8);
    expect(appointmentCreate.mock.calls[0][0].metadata).toMatchObject({ testFees: 798.5, totalFee: 638.8, planDiscount: 159.7, planCoveredAmount: 0, planUserPlanId: 901, planId: 9 });
  });

  test('100% discount makes the booking free, with no payment order', async () => {
    PLANS.set(7646, [plan({ lab_benefit: { discountPct: 100 } })]);
    const booked = await book(bookingBody());
    expect(booked.body.quote).toMatchObject({ totalFee: 0, paymentRequired: false, basis: 'plan-benefit' });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  test('a plan with no lab benefit is inert: full price, and the quote says why', async () => {
    // The real Ninjacart plan: coverageDetails has onlineConsult only.
    PLANS.set(7646, [plan({ lab_benefit: null })]);
    const res = await quote(bookingBody());
    expect(res.body.quote).toMatchObject({ totalFee: 798.5, planDiscount: 0, basis: 'catalog', planBenefit: { applied: false, reason: 'plan_has_no_lab_benefit' } });
    // A plan's type or price never implies a lab benefit; limitINR 0 is none.
    PLANS.set(7646, [plan({ lab_benefit: { limitINR: 0 } })]);
    expect((await quote(bookingBody())).body.quote.totalFee).toBe(798.5);
  });

  test('an allowance pays up to what is left of it, read in the member’s RLS context', async () => {
    PLANS.set(7646, [plan({ lab_benefit: { limitINR: 1000, period: 'month' } })]);
    allowanceUsed = [400];
    const res = await quote(bookingBody());
    expect(res.body.quote).toMatchObject({
      testsSubtotal: 798.5, planDiscount: 0, coveredAmount: 600, totalFee: 198.5, basis: 'plan-benefit',
      planBenefit: { limitINR: 1000, period: 'month', usedINR: 400, remainingINR: 600 },
    });
    expect(rlsContexts.at(-1)).toEqual({ userId: 7646, orgId: 0 });
  });

  test('booking takes the allowance lock, re-checks, and records what the allowance paid', async () => {
    PLANS.set(7646, [plan({ lab_benefit: { limitINR: 1000 } })]);
    allowanceUsed = [400];
    const booked = await book(bookingBody());
    expect(booked.statusCode).toBe(201);
    expect(appointmentQuery.mock.calls.some(([sql, opts]) => /pg_advisory_xact_lock/.test(sql) && opts.replacements.key === 'lab-plan-allowance:901')).toBe(true);
    expect(appointmentCreate.mock.calls[0][0].metadata).toMatchObject({ planCoveredAmount: 600, totalFee: 198.5, planUserPlanId: 901 });
  });

  test('if the allowance was spent in between, nothing is booked and the new quote is returned', async () => {
    PLANS.set(7646, [plan({ lab_benefit: { limitINR: 1000 } })]);
    allowanceUsed = [400, 1000]; // priced with 600 left; another booking spent it before the lock
    const booked = await book(bookingBody());
    expect(booked.statusCode).toBe(409);
    expect(booked.body).toMatchObject({ errorCode: 'QUOTE_CHANGED', quote: { coveredAmount: 0, totalFee: 798.5 } });
    expect(appointmentCreate).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  test('the plan covers a verified family member on the member’s list', async () => {
    PLANS.set(7646, [plan({ lab_benefit: { discountPct: 30 } })]);
    const res = await quote(bookingBody({ bookingFor: 'family', familyMemberId: 55 }));
    expect(res.body.quote).toMatchObject({ planDiscount: 239.55, totalFee: 558.95, planBenefit: { applied: true, appliesTo: 'family-member' } });
    // Someone not on the list is refused before pricing.
    const stranger = await quote(bookingBody({ bookingFor: 'family', familyMemberId: 56 }));
    expect(stranger.statusCode).toBe(400);
  });

  test('when several plans give a lab benefit, the one worth most applies (not stacked)', async () => {
    PLANS.set(7646, [plan({ user_plan_id: 1, plan_id: 5, plan_name: 'Silver', lab_benefit: { discountPct: 20 } }), plan({ user_plan_id: 2, plan_id: 6, plan_name: 'Gold', lab_benefit: { discountPct: 30 } })]);
    const res = await quote(bookingBody());
    expect(res.body.quote).toMatchObject({ planDiscount: 239.55, planBenefit: { planName: 'Gold' } });
  });

  test('family health-package price comes from the employee’s entitlement; the client figure is ignored', async () => {
    const body = bookingBody({ bookingFor: 'family', familyMemberId: 55, corporateBenefitSource: 'corporate-family-benefit', corporatePackageId: 12, familyDiscountedPrice: 1, tests: [{ id: 12, name: 'AHC' }] });
    const quoted = await quote(body);
    expect(quoted.body.quote).toMatchObject({
      basis: 'corporate-family-discount', testsSubtotal: 2500, planDiscount: 500, totalFee: 2000,
      corporatePackage: { packageId: '12', packagePrice: 2500, familyDiscountPercent: 20, familyPrice: 2000 },
    });
    const booked = await book(body);
    expect(booked.body.payment.amount).toBe(2000);
    expect(appointmentCreate.mock.calls[0][0].metadata).toMatchObject({ familyDiscountedPrice: 2000, familyDiscountPercent: 20, corporatePackagePrice: 2500 });
  });

  test('a package with no family price configured is refused, not priced by guesswork', async () => {
    const res = await quote(bookingBody({ bookingFor: 'family', familyMemberId: 55, corporateBenefitSource: 'corporate-family-benefit', corporatePackageId: 13, familyDiscountedPrice: 1, tests: [{ id: 13 }] }));
    expect(res.statusCode).toBe(409);
    expect(res.body.errorCode).toBe('FAMILY_PRICE_NOT_CONFIGURED');
  });
});

describe('labBenefitFromPlan', () => {
  test('reads discountPct and limitINR; nothing defined is no benefit', () => {
    expect(labBenefitFromPlan(null)).toBeNull();
    expect(labBenefitFromPlan({ limitINR: 0 })).toBeNull();
    expect(labBenefitFromPlan({ limitINR: 0, discountPct: 20 })).toEqual({ discountPct: 20, limitINR: 0, period: null });
    expect(labBenefitFromPlan({ limitINR: 2000 })).toEqual({ discountPct: 0, limitINR: 2000, period: 'plan_term' });
    expect(labBenefitFromPlan({ discountPct: 150 }).discountPct).toBe(100);
  });

  test('an allowance with an unknown period is not applied', () => {
    expect(labBenefitFromPlan({ limitINR: 1000, period: 'fortnight' })).toEqual({ discountPct: 0, limitINR: 0, period: null, unknownPeriod: 'fortnight' });
  });
});

describe('priceLabBooking', () => {
  test('the same test named by id and by code is billed once', async () => {
    const pricing = await priceLabBooking({ tests: [{ id: 'CBC-001' }, { id: 'cbc' }] });
    expect(pricing.tests).toHaveLength(1);
    expect(pricing.totalFee).toBe(299);
  });

  test('no tests selected adds no fee of its own', async () => {
    const pricing = await priceLabBooking({ tests: [] });
    expect(pricing).toMatchObject({ basis: 'no-tests-selected', totalFee: 0, paymentRequired: false });
  });

  test('a non-list tests value is a 400, not a crash', async () => {
    await expect(priceLabBooking({ tests: 'CBC' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
