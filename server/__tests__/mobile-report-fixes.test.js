/**
 * Backend defects found from the 1.3.0 mobile-app test report.
 *
 * Each test names the report row it pins, so a regression points straight back
 * at the behaviour QA observed on the device.
 */
import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: mockQuery } }));

const { joinAddressParts } = await import('../services/nearby-places.service.js');
const cartRouter = (await import('../routes/cart.route.js')).default;

/** Pull a route handler out of the router so it can be called directly. */
function handler(method, path) {
  const layer = cartRouter.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`no ${method.toUpperCase()} ${path} on cart router`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function reply() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

const catalogueRow = (id, name, code, price) => ({
  test_id: id, name, test_code: code, price, currency: 'INR', home_collection_charge: null,
});

describe('lab/hospital address formatting (report row 134)', () => {
  test('a part already present in the address is not repeated', () => {
    // QA: "AGILUS address still messy: 'ITPL, bengalrur 560037, Itpl, Bengalrur'"
    expect(joinAddressParts(['ITPL, bengalrur 560037', 'Itpl', 'Bengalrur']))
      .toBe('ITPL, bengalrur 560037');
  });

  test('city and state are dropped when the stored address already ends with them', () => {
    expect(joinAddressParts(['123 MG Road, Bangalore, Karnataka', 'Bangalore', 'Karnataka', '560001']))
      .toBe('123 MG Road, Bangalore, Karnataka, 560001');
  });

  test('genuinely distinct parts are all kept, in order', () => {
    expect(joinAddressParts(['14 Residency Road', 'Bengaluru', 'Karnataka', '560025']))
      .toBe('14 Residency Road, Bengaluru, Karnataka, 560025');
  });

  test('blank, null and whitespace parts are skipped without leaving stray commas', () => {
    expect(joinAddressParts([null, '  ', 'Indiranagar', undefined, 'Bengaluru', '']))
      .toBe('Indiranagar, Bengaluru');
    expect(joinAddressParts([])).toBe('');
  });
});

describe('lab test cart (report rows 115, 116)', () => {
  beforeEach(() => mockQuery.mockReset());

  const addToCart = async (user, body) => {
    const res = reply();
    mockQuery.mockResolvedValue({ rows: [catalogueRow(501, 'Complete Blood Count', 'CBC', '450.00')] });
    await handler('post', '/add')({ user, body }, res);
    return res;
  };

  test('the same test added under a second identifier merges instead of duplicating', async () => {
    const user = { id: 9001 };
    // QA added CBC twice and got 2 items. The two adds name the same catalogue
    // row by different identifiers — numeric id, then test code — which is what
    // CATALOGUE_SQL accepts and what the old dedupe compared literally.
    const first = await addToCart(user, { test: { id: 501, name: 'Complete Blood Count' } });
    expect(first.body.itemCount).toBe(1);

    const second = await addToCart(user, { test: { id: 'CBC', name: 'Complete Blood Count' } });
    expect(second.body.itemCount).toBe(1);
    expect(second.body.cart[0].quantity).toBe(2);
  });

  test('removing one of two identical items leaves the other (did not empty the cart)', async () => {
    const user = { id: 9002 };
    mockQuery.mockResolvedValue({ rows: [catalogueRow(501, 'Complete Blood Count', 'CBC', '450.00')] });
    await handler('post', '/add')({ user, body: { test: { id: 501 } } }, reply());
    mockQuery.mockResolvedValue({ rows: [catalogueRow(777, 'Lipid Profile', 'LIPID', '800.00')] });
    await handler('post', '/add')({ user, body: { test: { id: 777 } } }, reply());

    const res = reply();
    await handler('delete', '/remove/:testId')({ user, params: { testId: '501' } }, res);
    expect(res.body.itemCount).toBe(1);
    expect(res.body.cart[0].test.catalogTestId).toBe(777);
  });

  test('an item can be removed by test code or name, not only by id', async () => {
    const user = { id: 9003 };
    mockQuery.mockResolvedValue({ rows: [catalogueRow(501, 'Complete Blood Count', 'CBC', '450.00')] });
    await handler('post', '/add')({ user, body: { test: { id: 501 } } }, reply());

    const res = reply();
    await handler('delete', '/remove/:testId')({ user, params: { testId: 'cbc' } }, res);
    expect(res.body.itemCount).toBe(0);
  });

  test('removing something that is not in the cart leaves it untouched', async () => {
    const user = { id: 9004 };
    mockQuery.mockResolvedValue({ rows: [catalogueRow(501, 'Complete Blood Count', 'CBC', '450.00')] });
    await handler('post', '/add')({ user, body: { test: { id: 501 } } }, reply());

    const res = reply();
    await handler('delete', '/remove/:testId')({ user, params: { testId: '999999' } }, res);
    expect(res.body.itemCount).toBe(1);
  });

  test('a test missing from the catalogue is still refused, with its own code', async () => {
    const res = reply();
    mockQuery.mockResolvedValue({ rows: [] });
    await handler('post', '/add')({ user: { id: 9005 }, body: { test: { id: 404404 } } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.errorCode).toBe('TEST_NOT_BOOKABLE');
  });
});
