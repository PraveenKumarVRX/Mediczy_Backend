/**
 * Lab price-list maintenance (owner decision 2026-11-15: labs set their own
 * test lists and prices). The SQL itself was exercised against PostgreSQL 16
 * with the real entity-uid trigger functions; these tests pin the rules and
 * who may edit which lab:
 *   - the lab portal edits the signed-in lab only, never a lab in the request
 *   - admins edit any lab by id or uid, behind authUser + requireRole('admin')
 *   - unknown tests and bad prices are refused per row; a bulk upload with one
 *     bad row writes nothing
 */
import { jest } from '@jest/globals';

const LABS = [{ id: 80, uid: 'LZ8M4T', name: 'Orange Health', status: 'active' }, { id: 78, uid: 'LQ7K2P', name: 'Medall', status: 'active' }];
const CATALOGUE = [
  { test_id: 'CBC-001', test_code: 'CBC', name: 'Complete Blood Count (CBC)' },
  { test_id: 'RAD-001', test_code: 'CXR', name: 'Chest X-Ray' },
];
let store; // `${labId}:${testId}` -> { price, is_active, updated_by_uid }
let tableMissing = false;
const executed = [];

const missing = () => Object.assign(new Error('relation "lab_test_prices" does not exist'), { code: '42P01' });

async function run(sql, params = []) {
  executed.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };
  if (/FROM labs WHERE/.test(sql)) {
    const lab = /WHERE id = \$1/.test(sql) ? LABS.find((l) => l.id === params[0]) : LABS.find((l) => l.uid === params[0]);
    return { rows: lab ? [lab] : [] };
  }
  if (/JOIN entity_registry/.test(sql)) return { rows: [{ uid: /FROM labs/.test(sql) ? LABS.find((l) => l.id === params[0])?.uid : 'RADM01' }] };
  if (/FROM api_lab_tests\s+WHERE status = 'active'\s+AND \(test_id = ANY/.test(sql)) {
    return { rows: CATALOGUE.filter((t) => params[0].includes(t.test_id) || params[1].includes(t.test_code.toLowerCase())) };
  }
  if (/INSERT INTO lab_test_prices/.test(sql)) {
    if (tableMissing) throw missing();
    const [labId, testId, price, isActive, uid] = params;
    const key = `${labId}:${testId}`;
    const created = !store.has(key);
    store.set(key, { price, is_active: isActive ?? (created ? true : store.get(key).is_active), updated_by_uid: uid });
    return { rows: [{ test_id: testId, price: String(price), is_active: store.get(key).is_active, created }] };
  }
  if (/COUNT\(\*\) FILTER/.test(sql)) {
    if (tableMissing) throw missing();
    const rows = [...store.entries()].filter(([k]) => k.startsWith(`${params[0]}:`));
    return { rows: [{ active: rows.filter(([, v]) => v.is_active).length, total: rows.length }] };
  }
  if (/FROM lab_test_prices p/.test(sql)) {
    if (tableMissing) throw missing();
    const rows = [...store.entries()]
      .filter(([k]) => k.startsWith(`${params[0]}:`) && (params[1] === undefined || k.endsWith(`:${params[1]}`)))
      .map(([k, v]) => {
        const t = CATALOGUE.find((c) => c.test_id === k.split(':')[1]);
        return { test_id: t.test_id, test_code: t.test_code, name: t.name, price: v.price, is_active: v.is_active, catalogue_status: 'active', lab_uid: 'LZ8M4T', updated_by_uid: v.updated_by_uid };
      });
    return { rows: /AND p\.is_active/.test(sql) ? rows.filter((r) => r.is_active) : rows };
  }
  if (/SELECT test_id FROM api_lab_tests WHERE test_id = \$1 OR/.test(sql)) {
    const t = CATALOGUE.find((c) => c.test_id === params[0] || c.test_code.toLowerCase() === String(params[0]).toLowerCase());
    return { rows: t ? [{ test_id: t.test_id }] : [] };
  }
  if (/UPDATE lab_test_prices/.test(sql)) {
    const [labId, testId] = params.slice(-2);
    const key = `${labId}:${testId}`;
    if (!store.has(key)) return { rows: [] };
    const row = store.get(key);
    if (/price = \$1/.test(sql)) row.price = params[0];
    const activeAt = sql.match(/is_active = \$(\d+)/);
    if (activeAt) row.is_active = params[Number(activeAt[1]) - 1];
    return { rows: [{ test_id: testId }] };
  }
  if (/FROM api_lab_tests/.test(sql)) return { rows: CATALOGUE.map((t) => ({ ...t, category: null, price: '299' })) };
  throw new Error(`unexpected SQL: ${sql}`);
}

const client = { query: jest.fn(run), release: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(run), connect: jest.fn(async () => client) } }));
const authLab = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../middleware/authLab.middleware.js', () => ({ authLab }));
const authUser = jest.fn((req, res, next) => next());
const requireRole = jest.fn(() => function requireAdmin(req, res, next) { next(); });
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({ authUser, requireRole }));

const service = await import('../services/lab-test-prices.service.js');
const { labPortalTestPricesRouter, adminLabTestPricesRouter } = await import('../routes/lab/test-prices.route.js');

function handler(router, method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`no ${method.toUpperCase()} ${path}`);
  return layer.route.stack.at(-1).handle;
}
function reply() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
}
async function call(router, method, path, req) {
  const res = reply();
  await handler(router, method, path)({ params: {}, query: {}, body: {}, ...req }, res);
  return res;
}

beforeEach(() => {
  store = new Map();
  tableMissing = false;
  executed.length = 0;
});

describe('parsing', () => {
  test('a price is a positive INR amount with at most two decimals', () => {
    expect(service.parsePrice('250')).toEqual({ value: 250 });
    expect(service.parsePrice(600.5)).toEqual({ value: 600.5 });
    for (const bad of [0, '0', -5, '12,00', '₹100', '1.234', 'abc', '', null, 1e7]) expect(service.parsePrice(bad).error).toBeTruthy();
  });

  test('is_active reads words; absent is undefined; nonsense is an error', () => {
    expect(service.parseActive('yes')).toEqual({ value: true });
    expect(service.parseActive('inactive')).toEqual({ value: false });
    expect(service.parseActive(undefined)).toEqual({ value: undefined });
    expect(service.parseActive('maybe').error).toBeTruthy();
  });

  test('CSV with a header row becomes rows keyed by lowercase column', () => {
    expect(service.parseCsv('Test_Code, Price ,is_active\nCBC,250,yes\n\nCXR,"600.50",\n')).toEqual([
      { test_code: 'CBC', price: '250', is_active: 'yes' }, { test_code: 'CXR', price: '600.50', is_active: '' },
    ]);
    expect(() => service.parseCsv('')).toThrow(/empty/);
  });
});

describe('who can edit which lab', () => {
  test('the lab portal router authenticates as a lab; the admin router needs the admin role', () => {
    expect(labPortalTestPricesRouter.stack[0].handle).toBe(authLab);
    expect(adminLabTestPricesRouter.stack[0].handle).toBe(authUser);
    expect(adminLabTestPricesRouter.stack[1].handle.name).toBe('requireAdmin');
    expect(requireRole).toHaveBeenCalledWith(['admin']);
  });

  test('the lab portal edits the signed-in lab, whatever lab the request names', async () => {
    const res = await call(labPortalTestPricesRouter, 'post', '/', { lab: { id: 80 }, params: { labRef: '78' }, body: { testCode: 'cbc', price: '250', labId: 78 } });
    expect(res.statusCode).toBe(201);
    expect([...store.keys()]).toEqual(['80:CBC-001']);
    expect(store.get('80:CBC-001').updated_by_uid).toBe('LZ8M4T');
  });

  test('an admin edits any lab, by uid or id, and is recorded as the editor', async () => {
    const res = await call(adminLabTestPricesRouter, 'post', '/:labRef', { user: { id: 1 }, params: { labRef: 'LQ7K2P' }, body: { testId: 'RAD-001', price: 450 } });
    expect(res.statusCode).toBe(201);
    expect(store.get('78:RAD-001')).toMatchObject({ price: 450, updated_by_uid: 'RADM01' });
    const listed = await call(adminLabTestPricesRouter, 'get', '/:labRef', { user: { id: 1 }, params: { labRef: '78' } });
    expect(listed.body).toMatchObject({ priceSource: 'lab', activeCount: 1, lab: { id: 78, uid: 'LQ7K2P' } });
    const unknown = await call(adminLabTestPricesRouter, 'get', '/:labRef', { user: { id: 1 }, params: { labRef: '99999' } });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('writing a price list', () => {
  test('a bulk upload with a bad row writes nothing and reports every bad row (CSV with file line numbers)', async () => {
    const csv = 'test_code,price\nCBC,250\nNOPE,100\nCXR,0\nCBC,260\n';
    const res = await call(labPortalTestPricesRouter, 'post', '/bulk', { lab: { id: 80 }, body: { csv } });
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('INVALID_ROWS');
    expect(res.body.errors.map((e) => [e.row, e.line])).toEqual([[2, 3], [3, 4], [4, 5]]);
    expect(res.body.errors[0].errors[0]).toMatch(/NOPE.*not an active catalogue test/);
    expect(res.body.errors[2].errors[0]).toMatch(/already on row 1/);
    expect(store.size).toBe(0);
    expect(executed).toContain('ROLLBACK');
  });

  test('a valid bulk upload creates and updates; dryRun saves nothing', async () => {
    const dry = await call(adminLabTestPricesRouter, 'post', '/:labRef/bulk', { user: { id: 1 }, params: { labRef: '80' }, body: { rows: [{ test_code: 'CBC', price: 250 }], dryRun: true } });
    expect(dry.body).toMatchObject({ success: true, dryRun: true, saved: 0 });
    store.clear(); // the in-memory store has no transactions; dryRun ended in ROLLBACK
    expect(executed.at(-1)).toBe('ROLLBACK');

    await call(adminLabTestPricesRouter, 'post', '/:labRef/bulk', { user: { id: 1 }, params: { labRef: '80' }, body: { rows: [{ test_code: 'CBC', price: 250 }] } });
    const second = await call(adminLabTestPricesRouter, 'post', '/:labRef/bulk', { user: { id: 1 }, params: { labRef: '80' }, body: { rows: [{ test_id: 'CBC-001', price: '260' }, { test_code: 'CXR', price: '600.50', is_active: 'no' }] } });
    expect(second.body).toMatchObject({ saved: 2, created: 1, updated: 1 });
    expect(store.get('80:RAD-001')).toMatchObject({ price: 600.5, is_active: false });
  });

  test('update and deactivate a test on the list; a test not on it is a 404', async () => {
    await service.upsertLabPrices(LABS[0], [{ test_code: 'CBC', price: 250 }]);
    const updated = await call(labPortalTestPricesRouter, 'patch', '/:testId', { lab: { id: 80 }, params: { testId: 'CBC' }, body: { price: '275.25' } });
    expect(updated.body.price).toMatchObject({ testId: 'CBC-001', price: 275.25, isActive: true });
    const gone = await call(labPortalTestPricesRouter, 'delete', '/:testId', { lab: { id: 80 }, params: { testId: 'CBC-001' } });
    expect(gone.body.price.isActive).toBe(false);
    const notOnList = await call(labPortalTestPricesRouter, 'patch', '/:testId', { lab: { id: 80 }, params: { testId: 'CXR' }, body: { price: 10 } });
    expect(notOnList.statusCode).toBe(404);
    const bad = await call(labPortalTestPricesRouter, 'patch', '/:testId', { lab: { id: 80 }, params: { testId: 'CBC' }, body: { price: -1 } });
    expect(bad.statusCode).toBe(422);
  });

  test('before the migration is applied the endpoints say so (503), not 500', async () => {
    tableMissing = true;
    const res = await call(labPortalTestPricesRouter, 'get', '/', { lab: { id: 80 } });
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('PRICE_LIST_NOT_READY');
  });
});
