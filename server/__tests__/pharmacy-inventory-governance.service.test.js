import { jest } from '@jest/globals';

const sequelize = { query: jest.fn(), transaction: jest.fn() };
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: sequelize }));

// The readiness check reads information_schema through the raw pg pool, not
// Sequelize: Sequelize sniffs any information_schema.tables query, classifies it
// as "show tables" and flattens the result to bare strings whatever `type` is
// passed, so table_name always came back undefined and the check could never
// pass. These tests still mocked Sequelize for it, so the check saw no tables,
// resolved, and the suite proved nothing.
const pgPool = { query: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pgPool }));

const GOVERNANCE_TABLES = [
  'pharmacy_stock_movements', 'pharmacy_controlled_movements',
  'pharmacy_wastage', 'pharmacy_recalls', 'pharmacy_recall_items',
];
const schemaPresent = (tables) => pgPool.query.mockResolvedValueOnce({ rows: tables.map((t) => ({ table_name: t })) });

const governance = await import('../services/pharmacy-inventory-governance.service.js');

describe('pharmacy inventory governance', () => {
  beforeEach(() => jest.clearAllMocks());

  test('readiness fails closed until all governance tables are migrated', async () => {
    schemaPresent(['pharmacy_wastage']);
    await expect(governance.ensurePharmacyGovernanceReady()).rejects.toMatchObject({ code: 'PHARMACY_GOVERNANCE_SCHEMA_NOT_READY', status: 503 });
  });

  test('readiness passes once every governance table is present', async () => {
    schemaPresent(GOVERNANCE_TABLES);
    await expect(governance.ensurePharmacyGovernanceReady()).resolves.toBe(true);
  });

  test('a single missing table is enough to fail closed', async () => {
    for (const omitted of GOVERNANCE_TABLES) {
      schemaPresent(GOVERNANCE_TABLES.filter((t) => t !== omitted));
      await expect(governance.ensurePharmacyGovernanceReady())
        .rejects.toMatchObject({ code: 'PHARMACY_GOVERNANCE_SCHEMA_NOT_READY' });
    }
  });

  test('issueFefo consumes earliest non-expired batches and records a movement per batch', async () => {
    schemaPresent(GOVERNANCE_TABLES);
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
