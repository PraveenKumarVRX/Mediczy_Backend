import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();
const transaction = jest.fn(async (callback) => callback({ id: 'tx' }));
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query, transaction } }));

const { enqueueFromAdministration, markDispensed, buildDispenseRequestHash } = await import('../services/emar-pharmacy-bridge.service.js');

describe('eMAR pharmacy dispense bridge', () => {
  beforeEach(() => { query.mockReset(); transaction.mockClear(); });

  const input = { organizationId: 10, admissionId: 20, patientId: 30, medicationOrderId: 40, administrationId: 50, drugName: 'Ceftriaxone', dose: '1 g', route: 'iv' };

  it('creates a retry-safe queue row and replays the same administration', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 40 }]).mockResolvedValueOnce([{ id: 99, request_hash: buildDispenseRequestHash(input), status: 'pending' }]);
    const first = await enqueueFromAdministration(input);
    expect(first.id).toBe(99);
    expect(query.mock.calls[2][0]).toMatch(/ON CONFLICT DO NOTHING/i);

    query.mockReset().mockResolvedValueOnce([{ id: 99, request_hash: buildDispenseRequestHash(input), status: 'pending' }]);
    const replay = await enqueueFromAdministration(input);
    expect(replay.id).toBe(99);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('rejects a reused administration key with a different payload', async () => {
    query.mockResolvedValueOnce([{ id: 99, request_hash: 'different', status: 'pending' }]);
    await expect(enqueueFromAdministration(input)).rejects.toMatchObject({ code: 'idempotency_key_reuse', status: 422 });
  });

  it('does not enqueue refused or held administrations', async () => {
    await expect(enqueueFromAdministration({ ...input, outcome: 'refused' })).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('dispenses pending work atomically and makes a completed retry harmless', async () => {
    query.mockResolvedValueOnce([{ id: 9, status: 'pending' }]).mockResolvedValueOnce([{ id: 9, status: 'dispensed' }]);
    const row = await markDispensed(9, 10, 77);
    expect(row.status).toBe('dispensed');
    expect(query.mock.calls[1][0]).toMatch(/status = 'pending'/i);

    query.mockReset().mockResolvedValueOnce([{ id: 9, status: 'dispensed' }]);
    await expect(markDispensed(9, 10, 77)).resolves.toMatchObject({ status: 'dispensed' });
  });

  it('returns a typed not-found error for another tenant or missing row', async () => {
    query.mockResolvedValueOnce([]);
    await expect(markDispensed(9, 11, 77)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});
