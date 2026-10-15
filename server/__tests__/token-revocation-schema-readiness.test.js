import { jest } from '@jest/globals';

const pool = { query: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool }));

const revocation = await import('../services/token-revocation.service.js');

describe('token revocation schema readiness', () => {
  beforeEach(() => jest.clearAllMocks());

  test('does not create tables at request time and fails closed before migration', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ table_name: 'portal_refresh_tokens' }] });
    await expect(revocation.issuePortalTokenPair({ id: 7 }, { portal: 'doctor' })).rejects.toMatchObject({ code: 'AUTH_SCHEMA_NOT_READY', status: 503 });
    expect(pool.query.mock.calls[0][0]).toMatch(/information_schema\.tables/);
    expect(pool.query.mock.calls[0][0]).not.toMatch(/CREATE\s+TABLE/i);
  });

  test('revocation lookup denies when the readiness check or database fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(revocation.isTokenRevoked('jti-1')).resolves.toBe(true);
  });
});
