import { jest } from '@jest/globals';

const pool = { query: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool }));

const { HRMS_REQUIRED_TABLES, ensureHrmsSchemaReady } = await import('../services/hrms-schema-readiness.service.js');

describe('HRMS schema readiness', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fails closed with the missing migration tables', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ table_name: 'hr_locations' }] });
    await expect(ensureHrmsSchemaReady()).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('information_schema.tables'), [HRMS_REQUIRED_TABLES]);
  });

  test('passes when every migration-owned table is present', async () => {
    pool.query.mockResolvedValueOnce({ rows: HRMS_REQUIRED_TABLES.map((table_name) => ({ table_name })) });
    await expect(ensureHrmsSchemaReady()).resolves.toBeUndefined();
  });
});
