/**
 * QA-06 / QA-07 (My SmartHealth app 1.5.2): lab tests listed for a lab must be
 * ones the cart accepts, and POST /labs/book must charge exactly what POST
 * /labs/book/quote says — catalogue prices, no invented ₹1,500/₹2,500 fee.
 */
import { jest } from '@jest/globals';

const CATALOGUE = [
  { test_id: 'CBC-001', name: 'Complete Blood Count (CBC)', test_code: 'CBC', category: 'Haematology', sample_type: 'EDTA Blood', turnaround_time_hours: 6, price: '299.00', currency: 'INR', home_collection_charge: '50.00' },
  { test_id: 'LIP-001', name: 'Lipid Profile', test_code: 'LIPID', category: 'Biochemistry', sample_type: 'Serum', turnaround_time_hours: 8, price: '499.50', currency: 'INR', home_collection_charge: '50.00' },
  { test_id: 'RAD-001', name: 'Chest X-Ray', test_code: 'CXR', category: 'Radiology', sample_type: null, turnaround_time_hours: 2, price: '450.00', currency: 'INR', home_collection_charge: null },
];

const mockQuery = jest.fn(async (sql, params = []) => {
  if (/ANY\(\$1/.test(sql)) {
    const wanted = params[0].map((v) => String(v).toLowerCase());
    return { rows: CATALOGUE.filter((r) => [r.test_id, r.test_code, r.name].some((k) => wanted.includes(String(k).toLowerCase()))) };
  }
  return { rows: CATALOGUE };
});
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const activeLab = { id: 78, name: 'MEDALL LABS', address: { city: 'Chennai' }, phone: '044' };
const Lab = {
  findByPk: jest.fn(async (id) => (Number(id) === 78 ? activeLab : null)),
  findOne: jest.fn(async ({ where }) => (Number(where.id) === 78 ? activeLab : null)),
};
jest.unstable_mockModule('../models/postgres/lab.model.postgres.js', () => ({ default: Lab }));
// user_health_packages entitlement lookup: the employee holds package 12 only.
const entitledPackages = new Set(['12']);
const familyTx = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
jest.unstable_mockModule('../models/postgres/family-member.model.postgres.js', () => ({ default: {
  findOne: jest.fn(async () => null),
  sequelize: {
    transaction: jest.fn(async () => familyTx),
    query: jest.fn(async (sql, opts = {}) => (/user_health_packages/.test(sql) && entitledPackages.has(String(opts.replacements?.pid)) ? [{ '?column?': 1 }] : [])),
  },
} }));

const appointmentCreate = jest.fn(async (values) => ({ id: 501, ...values }));
const transaction = { commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}) };
jest.unstable_mockModule('../models/index.js', () => ({
  Appointment: { create: appointmentCreate, sequelize: { transaction: jest.fn(async () => transaction), query: jest.fn(async () => []) } },
  LabTest: {},
}));
jest.unstable_mockModule('../services/lab-appointment-history.service.js', () => ({
  ensureLabAppointmentHistory: jest.fn(async () => ({ id: 901 })),
}));
const orderCreate = jest.fn(async (values) => ({ id: 77, ...values }));
jest.unstable_mockModule('../models/billing.model.intelligent.js', () => ({ Order: { create: orderCreate } }));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser: (req, res, next) => next() }));
jest.unstable_mockModule('../db/orchestrator.js', () => ({ orchestrator: {} }));

const { priceLabBooking, listBookableLabTests } = await import('../services/lab-booking-pricing.service.js');
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

beforeEach(() => {
  appointmentCreate.mockClear();
  orderCreate.mockClear();
});

describe('QA-06: GET /labs/:labId/tests lists only tests the cart accepts', () => {
  test('every listed test is added to the cart, at the listed price', async () => {
    const res = reply();
    await handler(labRouter, 'get', '/:labId/tests')({ params: { labId: '78' }, query: {} }, res);
    expect(res.statusCode).toBe(200);
    const ids = res.body.tests.map((t) => t.id);
    expect(ids).toEqual(['CBC-001', 'LIP-001', 'RAD-001']);
    // The eight hardcoded sample tests (ids 1-8) are gone.
    expect(ids).not.toContain(1);

    for (const test of res.body.tests) {
      const added = reply();
      await handler(cartRouter, 'post', '/add')({ user: { id: 6001 }, body: { test: { ...test, price: 1 }, quantity: 1 } }, added);
      expect(added.statusCode).toBe(200);
      expect(added.body.cart.at(-1).test.price).toBe(test.price);
    }
  });

  test('serviceType narrows checkup vs diagnostic by catalogue category', async () => {
    expect((await listBookableLabTests({ serviceType: 'diagnostic' })).map((t) => t.id)).toEqual(['RAD-001']);
    expect((await listBookableLabTests({ serviceType: 'checkup' })).map((t) => t.id)).toEqual(['CBC-001', 'LIP-001']);
  });

  test('an unknown lab is a 404, not a list of invented tests', async () => {
    const res = reply();
    await handler(labRouter, 'get', '/:labId/tests')({ params: { labId: '999999' }, query: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.tests).toBeUndefined();
  });
});

describe('QA-07: POST /labs/book charges what POST /labs/book/quote quotes', () => {
  test('quote is the sum of catalogue prices; no base fee, client prices ignored', async () => {
    const res = reply();
    await handler(labRouter, 'post', '/book/quote')({ user, body: bookingBody({ appointmentDate: undefined, appointmentTime: undefined }) }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.quote).toMatchObject({
      labId: 78, currency: 'INR', testsSubtotal: 798.5, collectionFee: 0, totalFee: 798.5, paymentRequired: true, basis: 'catalog',
    });
    expect(res.body.quote.tests.map((t) => t.price)).toEqual([299, 499.5]);
    expect(appointmentCreate).not.toHaveBeenCalled();
    expect(orderCreate).not.toHaveBeenCalled();
  });

  test('booking records and bills exactly the quoted total', async () => {
    const quoted = reply();
    await handler(labRouter, 'post', '/book/quote')({ user, body: bookingBody() }, quoted);

    const booked = reply();
    await handler(labRouter, 'post', '/book')({ user, body: bookingBody() }, booked);
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
    for (const path of ['/book/quote', '/book']) {
      const res = reply();
      await handler(labRouter, 'post', path)({ user, body }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ success: false, errorCode: 'TEST_NOT_BOOKABLE', unavailableTests: [{ id: 1, name: 'Complete Blood Count (CBC)' }] });
    }
    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  test('the employer-prepaid corporate package stays free to the employee', async () => {
    const body = bookingBody({ corporateBenefitSource: 'corporate-benefit', corporatePackageId: 12, tests: [{ id: 12, name: 'AHC Package', price: 2500 }] });
    const res = reply();
    await handler(labRouter, 'post', '/book')({ user, body }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.appointment.totalFee).toBe(0);
    expect(res.body.payment).toMatchObject({ required: false, amount: 0 });
    expect(res.body.quote.basis).toBe('corporate-package');
    expect(orderCreate).not.toHaveBeenCalled();
  });

  test('a corporate-package claim for a package the account does not hold is refused, not booked free', async () => {
    for (const corporatePackageId of [99, null]) {
      const body = bookingBody({ corporateBenefitSource: 'corporate-benefit', corporatePackageId, tests: [{ id: 'CBC-001' }] });
      const res = reply();
      await handler(labRouter, 'post', '/book')({ user, body }, res);
      expect(res.statusCode).toBe(403);
      expect(res.body.errorCode).toBe('PACKAGE_NOT_ENTITLED');
    }
    expect(appointmentCreate).not.toHaveBeenCalled();
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
