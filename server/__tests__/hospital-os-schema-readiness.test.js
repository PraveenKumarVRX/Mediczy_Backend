import { jest } from '@jest/globals';
import { ensureHospitalOsSchema, hospitalOsRequiredTables } from '../services/hospital-os/schema-readiness.service.js';

describe('Hospital OS schema readiness', () => {
  test('fails closed when a required table is missing', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    await expect(ensureHospitalOsSchema(db)).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('requires the event envelope columns after all tables exist', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: hospitalOsRequiredTables.map((table_name) => ({ table_name })) })
        .mockResolvedValueOnce({ rows: [
          { table_name: 'hospital_os_events', column_name: 'event_id' },
          { table_name: 'hospital_os_events', column_name: 'facility_id' },
          { table_name: 'hospital_os_events', column_name: 'correlation_id' },
          { table_name: 'hospital_os_events', column_name: 'schema_version' },
        ] }),
    };
    await expect(ensureHospitalOsSchema(db)).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});

