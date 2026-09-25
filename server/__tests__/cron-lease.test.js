import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
const { acquireCronLease } = await import('../services/cron-lease.service.js');

beforeEach(() => query.mockReset());

describe('durable cron leases', () => {
  it('reports acquired when the database grants the lease', async () => {
    query.mockResolvedValue({ rows: [{ job_key: 'job', owner_id: 'owner' }] });
    await expect(acquireCronLease('job')).resolves.toMatchObject({ acquired: true, job_key: 'job' });
  });

  it('reports contention when another live owner holds the lease', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(acquireCronLease('job')).resolves.toMatchObject({ acquired: false, reason: 'lease_held' });
  });
});
