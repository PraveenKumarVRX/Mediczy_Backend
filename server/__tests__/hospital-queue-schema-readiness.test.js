import { jest } from '@jest/globals';
import { ensureHospitalQueueSchema, hospitalQueueRequiredTables } from '../services/hospital-queue/schema-readiness.service.js';

describe('Hospital queue schema readiness', () => {
  test('fails closed when queue migrations have not run', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(ensureHospitalQueueSchema(db)).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
  });

  test('accepts all queue tables after migration', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce({ rows: hospitalQueueRequiredTables.map((table_name) => ({ table_name })) })
      .mockResolvedValueOnce({ rows: [
        { table_name: 'hospital_queue_entries', column_name: 'idempotency_key' },
        { table_name: 'hospital_queue_entries', column_name: 'request_hash' },
      ] }) };
    await expect(ensureHospitalQueueSchema(db)).resolves.toBe(true);
  });
});

