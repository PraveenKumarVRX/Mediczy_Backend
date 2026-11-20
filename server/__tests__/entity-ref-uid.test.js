/**
 * App API entity references accept the 6-character UID (preferred) or the legacy numeric id; a
 * UID must belong to the table the endpoint expects (owner decision 2026-11-20).
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
const { resolveEntityRef, entityParam, looksLikeUid } = await import('../utils/entity-ref.js');

const REGISTRY = {
  L7K2PX: { source_table: 'labs', source_id: '81', retired_at: null },
  C9TV9Y: { source_table: 'corporates', source_id: '5', retired_at: null },
  UOLD01: { source_table: 'users', source_id: '6911', retired_at: new Date() },
};
beforeEach(() => query.mockReset().mockImplementation(async (_sql, [uid]) => ({ rows: REGISTRY[uid] ? [REGISTRY[uid]] : [] })));

describe('resolveEntityRef', () => {
  test('a numeric id passes through untouched, without a lookup', async () => {
    expect(await resolveEntityRef('81', 'labs')).toEqual({ id: 81 });
    expect(query).not.toHaveBeenCalled();
  });
  test('a UID resolves to the numeric id of the expected table, any case', async () => {
    expect(await resolveEntityRef('L7K2PX', 'labs')).toEqual({ id: 81 });
    expect(await resolveEntityRef('l7k2px', 'labs')).toEqual({ id: 81 });
  });
  test('a UID of another kind is refused, so a corporate is never read as a lab', async () => {
    expect(await resolveEntityRef('C9TV9Y', 'labs')).toMatchObject({ status: 400, code: 'WRONG_ENTITY_KIND' });
  });
  test('unknown or retired UIDs are 404, malformed input 400', async () => {
    expect(await resolveEntityRef('ZZZZZZ', 'labs')).toMatchObject({ status: 404 });
    expect(await resolveEntityRef('UOLD01', 'users')).toMatchObject({ status: 404 });
    expect(await resolveEntityRef('81; drop', 'labs')).toMatchObject({ status: 400, code: 'INVALID_ENTITY_REF' });
    expect(looksLikeUid('L7K2P')).toBe(false);
  });
});

describe('entityParam', () => {
  const run = async (value) => {
    const req = { params: { labId: value } }; const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    const next = jest.fn();
    await entityParam('labs')(req, res, next, value, 'labId');
    return { req, res, next };
  };
  test('rewrites a UID in the path to the numeric id before the handler runs', async () => {
    const { req, next } = await run('L7K2PX');
    expect(req.params.labId).toBe('81');
    expect(next).toHaveBeenCalledWith();
  });
  test('answers the wrong kind itself and never calls the handler', async () => {
    const { res, next } = await run('C9TV9Y');
    expect(res.code).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });
  test('is wired on the app-facing lab and corporate routes', () => {
    expect(readFileSync(new URL('../routes/lab.route.enhanced.js', import.meta.url), 'utf8')).toContain("router.param('labId', entityParam('labs'));");
    expect(readFileSync(new URL('../routes/membership-plans.route.js', import.meta.url), 'utf8')).toContain("router.param('corporateId', entityParam('corporates'));");
  });
});

test('sign-in, OTP sign-in, sign-up and Apple responses carry the member uid', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  expect(read('../controller/user.controller.js')).toContain('uid: user.unique_id || user.dataValues?.unique_id || null');
  const route = read('../routes/user.route.js');
  expect(route.match(/uid: (user|newUser)\.unique_id/g)).toHaveLength(2);
  expect(read('../controller/apple-auth.controller.js')).toContain('uid: user.unique_id || user.dataValues?.unique_id || null');
});
