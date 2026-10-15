/** Pure SCM inventory helpers shared by routes and contract tests. */

export function normalizeReceiptTrace(input = {}) {
  const toPositiveInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const batchNumber = input.batchNumber === null || input.batchNumber === undefined || input.batchNumber === ''
    ? null : String(input.batchNumber).trim();
  const expiryDate = input.expiryDate === null || input.expiryDate === undefined || input.expiryDate === ''
    ? null : String(input.expiryDate).trim();
  if (batchNumber && batchNumber.length > 80) {
    const error = new Error('batchNumber must be 80 characters or fewer');
    error.code = 'VALIDATION_FAILED';
    error.status = 400;
    throw error;
  }
  if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    const error = new Error('expiryDate must use YYYY-MM-DD');
    error.code = 'VALIDATION_FAILED';
    error.status = 400;
    throw error;
  }
  return {
    warehouseId: toPositiveInt(input.warehouseId),
    locationId: toPositiveInt(input.locationId),
    batchNumber: batchNumber || null,
    expiryDate: expiryDate || null,
  };
}

export function normalizeInventoryMovement(input = {}) {
  const movementType = String(input.movementType || '').trim().toLowerCase();
  const allowed = new Set(['issue', 'return', 'transfer', 'adjustment']);
  if (!allowed.has(movementType)) {
    const error = new Error('movementType must be issue, return, transfer, or adjustment');
    error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
  }
  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (!lines.length) { const error = new Error('At least one movement line is required'); error.code = 'VALIDATION_FAILED'; error.status = 400; throw error; }
  const normalized = lines.map((line) => {
    const itemId = Number(line.itemId);
    const rawQuantity = movementType === 'adjustment' && line.delta !== undefined ? Number(line.delta) : Number(line.quantity);
    const quantity = movementType === 'adjustment' ? Math.abs(rawQuantity) : rawQuantity;
    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(rawQuantity) || rawQuantity === 0 || quantity <= 0) {
      const error = new Error('Each movement line requires a positive itemId and quantity');
      error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
    }
    const trace = normalizeReceiptTrace(line);
    const unitCost = line.unitCost === null || line.unitCost === undefined || line.unitCost === '' ? null : Number(line.unitCost);
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      const error = new Error('unitCost must be a non-negative number');
      error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
    }
    return { itemId, quantity, signedQuantity: movementType === 'adjustment' ? rawQuantity : quantity, unitCost, ...trace, notes: line.notes ? String(line.notes).slice(0, 500) : null };
  });
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    const error = new Error('idempotencyKey must be 8–128 characters from A-Z, a-z, 0-9, dot, underscore, colon, or hyphen');
    error.code = 'VALIDATION_FAILED'; error.status = 400; throw error;
  }
  const reason = input.reason === null || input.reason === undefined ? null : String(input.reason).trim().slice(0, 500);
  if (movementType === 'adjustment' && !reason) { const error = new Error('reason is required for an adjustment'); error.code = 'VALIDATION_FAILED'; error.status = 400; throw error; }
  return {
    movementType, idempotencyKey, lines: normalized,
    sourceWarehouseId: normalizeReceiptTrace(input).warehouseId,
    sourceLocationId: normalizeReceiptTrace(input).locationId,
    destinationWarehouseId: Number.isInteger(Number(input.destinationWarehouseId)) && Number(input.destinationWarehouseId) > 0 ? Number(input.destinationWarehouseId) : null,
    destinationLocationId: Number.isInteger(Number(input.destinationLocationId)) && Number(input.destinationLocationId) > 0 ? Number(input.destinationLocationId) : null,
    referenceType: input.referenceType ? String(input.referenceType).slice(0, 64) : null,
    referenceId: Number.isInteger(Number(input.referenceId)) && Number(input.referenceId) > 0 ? Number(input.referenceId) : null,
    reason,
  };
}

export function buildInventoryLotQuery(filters = {}) {
  const values = [];
  const where = [];
  const add = (sql, value) => { values.push(value); where.push(sql.replace('$VALUE', `$${values.length}`)); };
  if (filters.itemId) add('l.item_id = $VALUE', Number(filters.itemId));
  if (filters.warehouseId) add('l.warehouse_id = $VALUE', Number(filters.warehouseId));
  if (filters.expiringBefore) add('l.expiry_date <= $VALUE::date', String(filters.expiringBefore));
  return {
    values,
    text: `
      SELECT l.item_id, i.item_code, i.name, l.warehouse_id, w.code AS warehouse_code,
             l.location_id, loc.code AS location_code, l.batch_number, l.expiry_date,
             SUM(l.quantity_delta)::numeric AS quantity_on_hand,
             CASE WHEN l.expiry_date IS NOT NULL AND l.expiry_date < CURRENT_DATE THEN 'expired'
                  WHEN l.expiry_date IS NOT NULL AND l.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                  ELSE 'ok' END AS expiry_status
      FROM scm_inventory_ledger l
      LEFT JOIN scm_items i ON i.id = l.item_id
      LEFT JOIN scm_warehouses w ON w.id = l.warehouse_id
      LEFT JOIN scm_locations loc ON loc.id = l.location_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY l.item_id, i.item_code, i.name, l.warehouse_id, w.code, l.location_id, loc.code, l.batch_number, l.expiry_date
      HAVING SUM(l.quantity_delta) <> 0
      ORDER BY l.expiry_date NULLS LAST, i.name, l.batch_number NULLS LAST
    `,
  };
}
