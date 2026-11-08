/**
 * POST /api/users/data/erasure — the account-deletion endpoint the mobile app's
 * "Delete my account" flow calls (Play requires one for any app that can
 * create accounts).
 *
 * The route erases immediately and irreversibly, so these tests pin the two
 * guards it gained when it stopped being unreachable from any client: an
 * explicit confirmation, and a refusal for managed service accounts — the
 * app-store reviewer login is an ordinary patient row, so without that guard a
 * reviewer tapping Delete account would destroy the credentials every future
 * store review depends on.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockQuery = jest.fn();
const executeErasure = jest.fn();

jest.unstable_mockModule('../db/postgres.js', () => ({ getPool: () => ({ query: mockQuery }) }));
jest.unstable_mockModule('../services/data-export.service.js', () => ({
  requestDataExport: jest.fn(),
  getExportDownloadUrl: jest.fn(),
  executeErasure,
}));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, _res, next) => { req.user = { id: 7639, organization_id: 11 }; next(); },
}));

const router = (await import('../routes/data-export.route.js')).default;

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/users/data', router);
  return instance;
}

/** metadata the guard reads, then the INSERT that records the request. */
function pgReturning(metadata) {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ metadata }] })
    .mockResolvedValueOnce({ rows: [{ id: 501, deadline_at: null }] });
}

describe('account erasure guards', () => {
  beforeEach(() => { mockQuery.mockReset(); executeErasure.mockReset(); });

  test('an unconfirmed request erases nothing', async () => {
    const res = await request(app()).post('/api/users/data/erasure').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('erasure_not_confirmed');
    expect(executeErasure).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('a wrong confirmation string erases nothing', async () => {
    const res = await request(app()).post('/api/users/data/erasure').send({ confirm: 'yes' });
    expect(res.status).toBe(400);
    expect(executeErasure).not.toHaveBeenCalled();
  });

  test('a managed account is refused, and no deletion request is even recorded', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ metadata: { purpose: 'app-store-review', doNotDelete: true } }] });
    const res = await request(app()).post('/api/users/data/erasure').send({ confirm: 'ERASE' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('account_protected');
    expect(executeErasure).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('doNotDelete alone is enough to protect an account', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ metadata: { doNotDelete: true } }] });
    const res = await request(app()).post('/api/users/data/erasure').send({ confirm: 'ERASE' });
    expect(res.status).toBe(403);
    expect(executeErasure).not.toHaveBeenCalled();
  });

  test('an ordinary confirmed account is erased for the authenticated user only', async () => {
    pgReturning({ some: 'metadata' });
    const res = await request(app()).post('/api/users/data/erasure').send({ confirm: 'ERASE' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    // The user id comes from the token, never from the request body.
    expect(executeErasure).toHaveBeenCalledWith(7639, 501);
    expect(mockQuery.mock.calls[1][1]).toEqual([7639, 11]);
    expect(mockQuery.mock.calls[1][0]).toMatch(/'erasure'/);
  });

  test('an account with no metadata row is treated as ordinary, not as protected', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 502, deadline_at: null }] });
    const res = await request(app()).post('/api/users/data/erasure').send({ confirm: 'ERASE' });
    expect(res.status).toBe(200);
    expect(executeErasure).toHaveBeenCalledWith(7639, 502);
  });
});
