import { jest } from '@jest/globals';

const sequelize = { query: jest.fn(), transaction: jest.fn() };
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: sequelize }));

const governance = await import('../services/pharmacy-inventory-governance.service.js');

describe('pharmacy inventory governance', () => {
  beforeEach(() => jest.clearAllMocks());

  test('readiness fails closed until all governance tables are migrated', async () => {
    sequelize.query.mockResolvedValueOnce([{ table_name: 'pharmacy_wastage' }]);
    await expect(governance.ensurePharmacyGovernanceReady()).rejects.toMatchObject({ code: 'PHARMACY_GOVERNANCE_SCHEMA_NOT_READY', status: 503 });
  });

  test('issueFefo consumes earliest non-expired batches and records a movement per batch', async () => {
    sequelize.query.mockResolvedValueOnce([
      { table_name: 'pharmacy_stock_movements' },
      { table_name: 'pharmacy_controlled_movements' },
      { table_name: 'pharmacy_wastage' },
      { table_name: 'pharmacy_recalls' },
      { table_name: 'pharmacy_recall_items' },
    ]);
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { id: 11, quantity: 2, reserved_quantity: 0 },
        { id: 12, quantity: 5, reserved_quantity: 0 },
      ] })
      .mockResolvedValueOnce({ rows: [{ quantity: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 101, batch_id: 11, quantity: 2 }] })
      .mockResolvedValueOnce({ rows: [{ quantity: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 102, batch_id: 12, quantity: 1 }] }) };

    const result = await governance.issueFefo(client, {
      pharmacyId: 7,
      medicineId: 42,
      quantity: 3,
      referenceType: 'pharmacy_transaction',
      referenceId: 99,
      actorId: 5,
      idempotencyKey: 'sale-99-42',
    });

    expect(result.replayed).toBe(false);
    expect(result.movements).toHaveLength(2);
    expect(client.query.mock.calls[1][0]).toMatch(/ORDER BY expiry_date NULLS LAST/);
    expect(client.query.mock.calls[2][1]).toEqual([2, 11]);
    expect(client.query.mock.calls[4][1]).toEqual([1, 12]);
  });
});
