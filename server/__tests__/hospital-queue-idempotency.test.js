import { buildQueueCheckInRequestHash, normalizeQueueIdempotencyKey } from '../services/hospital-queue.service.js';

describe('hospital queue check-in idempotency', () => {
  test('accepts stable keys and rejects malformed keys', () => {
    expect(normalizeQueueIdempotencyKey('walkin-20261014-001')).toBe('walkin-20261014-001');
    expect(normalizeQueueIdempotencyKey(undefined)).toBeNull();
    expect(() => normalizeQueueIdempotencyKey('short')).toThrow(/8-128/);
    expect(() => normalizeQueueIdempotencyKey('bad key!!')).toThrow(/A-Za-z0-9/);
  });

  test('hash is stable for equivalent requests and changes on material data', () => {
    const base = { organizationId: 7, department: 'opd', patientId: 42, patientName: 'Asha', metadata: {} };
    expect(buildQueueCheckInRequestHash(base)).toBe(buildQueueCheckInRequestHash({ ...base }));
    expect(buildQueueCheckInRequestHash({ ...base, patientId: 43 })).not.toBe(buildQueueCheckInRequestHash(base));
  });
});

