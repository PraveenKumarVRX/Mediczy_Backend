import { buildInventoryLotQuery, normalizeInventoryMovement, normalizeReceiptTrace } from '../services/scm-inventory.service.js';

describe('SCM inventory traceability helpers', () => {
  test('normalizes optional receipt trace fields and rejects malformed values', () => {
    expect(normalizeReceiptTrace({ warehouseId: '2', locationId: 3, batchNumber: ' LOT-1 ', expiryDate: '2027-01-31' }))
      .toEqual({ warehouseId: 2, locationId: 3, batchNumber: 'LOT-1', expiryDate: '2027-01-31' });
    expect(normalizeReceiptTrace({})).toEqual({ warehouseId: null, locationId: null, batchNumber: null, expiryDate: null });
    expect(() => normalizeReceiptTrace({ expiryDate: '31/01/2027' })).toThrow('YYYY-MM-DD');
    expect(() => normalizeReceiptTrace({ batchNumber: 'x'.repeat(81) })).toThrow('80 characters');
  });

  test('builds parameterized lot query with stable filters', () => {
    const query = buildInventoryLotQuery({ itemId: '11', warehouseId: '4', expiringBefore: '2027-02-01' });
    expect(query.values).toEqual([11, 4, '2027-02-01']);
    expect(query.text).toMatch(/l\.item_id = \$1/);
    expect(query.text).toMatch(/l\.warehouse_id = \$2/);
    expect(query.text).toMatch(/l\.expiry_date <= \$3::date/);
    expect(query.text).toMatch(/HAVING SUM\(l\.quantity_delta\) <> 0/);
  });

  test('normalizes idempotent issue movement and supports signed adjustments', () => {
    expect(normalizeInventoryMovement({
      movementType: 'issue', idempotencyKey: 'issue-2026-01', warehouseId: '2',
      lines: [{ itemId: '11', quantity: '3', batchNumber: 'LOT-1' }],
    })).toMatchObject({ movementType: 'issue', idempotencyKey: 'issue-2026-01', sourceWarehouseId: 2,
      lines: [{ itemId: 11, quantity: 3, signedQuantity: 3, batchNumber: 'LOT-1' }] });
    expect(normalizeInventoryMovement({
      movementType: 'adjustment', idempotencyKey: 'adjust-2026', reason: 'Cycle count variance',
      lines: [{ itemId: 11, delta: '-2' }],
    }).lines[0].signedQuantity).toBe(-2);
    expect(() => normalizeInventoryMovement({ movementType: 'issue', idempotencyKey: 'short', lines: [] })).toThrow();
    expect(() => normalizeInventoryMovement({ movementType: 'adjustment', idempotencyKey: 'adjust-2027', lines: [{ itemId: 1, delta: -1 }] })).toThrow('reason');
  });
});
