import { jest } from '@jest/globals';

const pool = { query: jest.fn(), connect: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool }));

const infection = await import('../services/infection-control.service.js');
const mortuary = await import('../services/mortuary.service.js');

describe('department workflow safety primitives', () => {
  beforeEach(() => jest.clearAllMocks());

  test('idempotency keys reject malformed or ambiguous values', () => {
    expect(infection.normalizeKey('valid-key_01')).toBe('valid-key_01');
    expect(() => infection.normalizeKey('short')).toThrow(/Idempotency-Key/);
    expect(() => infection.normalizeKey('bad key 123')).toThrow(/Idempotency-Key/);
    expect(() => mortuary.normalizeKey('x'.repeat(129))).toThrow(/Idempotency-Key/);
  });

  test('request hashes are deterministic and change when workflow input changes', () => {
    const first = infection.hashRequest({ org: 7, patientId: 12, organism: 'MRSA' });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(infection.hashRequest({ org: 7, patientId: 12, organism: 'MRSA' })).toBe(first);
    expect(infection.hashRequest({ org: 7, patientId: 12, organism: 'MSSA' })).not.toBe(first);
    expect(mortuary.hashRequest({ org: 7, deathType: 'medicolegal' })).not.toBe(mortuary.hashRequest({ org: 7, deathType: 'clinical' }));
  });

  test('workflow errors retain machine-readable code and status', () => {
    const error = mortuary.workflowError('legal hold', 'legal_hold_active', 409);
    expect(error).toMatchObject({ message: 'legal hold', code: 'legal_hold_active', status: 409 });
  });

  test('readiness fails closed when migration tables are absent', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(infection.ensureInfectionControlReady()).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(mortuary.ensureMortuaryReady()).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 });
  });
});
