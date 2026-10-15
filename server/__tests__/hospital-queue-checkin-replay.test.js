import { beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.NODE_ENV = 'test';

const poolQuery = jest.fn();
const poolConnect = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: {
    query: (...args) => poolQuery(...args),
    connect: (...args) => poolConnect(...args),
  },
}));
jest.unstable_mockModule('../services/display-sse-broker.service.js', () => ({
  pushQueueEvent: jest.fn(),
  pushToZone: jest.fn(),
}));
jest.unstable_mockModule('../services/queue-notify.service.js', () => ({
  notifyQueueCheckIn: jest.fn().mockResolvedValue(undefined),
  notifyTokenCalled: jest.fn().mockResolvedValue(undefined),
  refreshPositionNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../services/green-channel.service.js', () => ({
  default: { resolveForPatient: jest.fn().mockResolvedValue(null), logApplication: jest.fn() },
}));
jest.unstable_mockModule('../services/hospital-branch.service.js', () => ({
  default: { resolveBranchId: jest.fn().mockResolvedValue(null) },
}));

const { checkIn, buildQueueCheckInRequestHash } = await import('../services/hospital-queue.service.js');

function mockClient() {
  return {
    query: jest.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) return { rows: [] };
      if (text.includes('hospital_queue_journey_sequences')) return { rows: [{ last_seq: 9 }] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
}

describe('hospital queue check-in replay', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    poolConnect.mockReset().mockResolvedValue(mockClient());
  });

  it('returns the original entry for a retry and rejects key reuse with another body', async () => {
    const entry = {
      id: 91,
      organization_id: 7,
      department: 'opd',
      token_number: 'T-009',
      journey_token: 'T-009',
      journey_id: '11111111-1111-1111-1111-111111111111',
      queue_zone: 'opd-waiting',
      patient_id: 42,
      patient_name: 'Asha',
      queue_type: 'walk_in',
      priority_score: 50,
      status: 'waiting',
      metadata: {},
      step_order: 1,
    };
    let persisted = false;
    poolQuery.mockImplementation(async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('information_schema.tables')) return undefined;
      if (text.includes('idempotency_key = $2')) return { rows: persisted ? [entry] : [] };
      if (text.includes('SELECT counter_id')) return { rows: [] };
      if (text.includes('COUNT(*)::int AS c')) return { rows: [{ c: 0 }] };
      if (text.includes('PERCENTILE_CONT')) return { rows: [{ p50: 15, p90: 22, sample_size: 0 }] };
      if (text.includes('INSERT INTO hospital_queue_entries')) {
        persisted = true;
        entry.request_hash = params[23];
        return { rows: [entry] };
      }
      if (text.includes('FROM hospital_queue_entries WHERE organization_id = $1 AND check_in_at')) return { rows: [entry] };
      return { rows: [] };
    });

    const input = { organizationId: 7, department: 'opd', queueZone: 'opd-waiting', patientId: 42, patientName: 'Asha', idempotencyKey: 'walkin-20261014-001' };
    const first = await checkIn(input);
    expect(first.id).toBe(91);
    expect(entry.request_hash).toBe(buildQueueCheckInRequestHash(input));

    const second = await checkIn(input);
    expect(second.id).toBe(first.id);
    expect(poolConnect).toHaveBeenCalledTimes(1);

    await expect(checkIn({ ...input, patientId: 43 })).rejects.toMatchObject({ code: 'idempotency_key_reuse', status: 422 });
  });
});

