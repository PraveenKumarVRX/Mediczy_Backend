/**
 * Lab price lists — which catalogue tests a lab offers, at what price.
 *
 * Owner decision 2026-11-15: labs set their own test lists and prices. The
 * rows live in `lab_test_prices` (migrations/20261115000200-lab-test-prices);
 * services/lab-booking-pricing.service.js reads them for the listing, cart,
 * quote and booking. This file is the write side, used by:
 *   /api/lab/test-prices           the lab's own staff (lab portal login)
 *   /api/admin/lab-test-prices     admins, for any lab, incl. bulk upload
 *
 * Rules:
 *   - a row names a test that exists in the active `api_lab_tests` catalogue,
 *     by its test_id or test_code; an unknown test is refused, never dropped
 *   - a price is a positive INR amount with at most two decimals
 *   - "removing" a test deactivates it (the row is kept, so the change and who
 *     made it stay visible); a lab with no active rows books from Standard
 *   - a bulk upload is all-or-nothing: one bad row and nothing is written, and
 *     every bad row is reported with its row number
 *   - who last changed a row is stored as their entity uid (lab or user)
 */
import { parse as parseCsvSync } from 'csv-parse/sync';
import pool from '../db/pgPool.js';

export const MAX_PRICE_INR = 1000000;
export const MAX_BULK_ROWS = 2000;

export class LabPriceListError extends Error {
  constructor(message, { status = 400, code = 'LAB_PRICE_INVALID', errors } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    if (errors) this.errors = errors;
  }

  toJSON() {
    return { success: false, code: this.code, message: this.message, ...(this.errors ? { errors: this.errors } : {}) };
  }
}

const notReady = () => new LabPriceListError(
  'Lab price lists are not available yet: the lab_test_prices migration has not been applied.',
  { status: 503, code: 'PRICE_LIST_NOT_READY' },
);
const isMissingTable = (error) => error?.code === '42P01' && /lab_test_prices/.test(String(error?.message || ''));

async function guarded(work) {
  try {
    return await work();
  } catch (error) {
    if (isMissingTable(error)) throw notReady();
    throw error;
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/** A positive INR amount with at most two decimals, or an error message. */
export function parsePrice(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return { error: 'price is required' };
  if (typeof value !== 'number' && typeof value !== 'string') return { error: 'price must be a number' };
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: 'price must be a positive amount in rupees with at most two decimals (no commas or currency symbols)' };
  const n = Number(text);
  if (!(n > 0)) return { error: 'price must be greater than zero' };
  if (n > MAX_PRICE_INR) return { error: `price must not exceed ${MAX_PRICE_INR}` };
  return { value: Math.round(n * 100) / 100 };
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'active']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'inactive']);

/** true/false from a boolean or a word; `undefined` when absent; an error message when unreadable. */
export function parseActive(value) {
  if (value === undefined || value === null || value === '') return { value: undefined };
  if (typeof value === 'boolean') return { value };
  const word = String(value).trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return { value: true };
  if (FALSE_WORDS.has(word)) return { value: false };
  return { error: 'is_active must be true or false' };
}

const pick = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  return null;
};

/** Normalise one input row (JSON or CSV) to { testRef, refKind, price, isActive, currency }. */
function readRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { errors: ['row must be an object'] };
  const errors = [];
  const testId = pick(row, ['test_id', 'testId', 'catalogTestId']);
  const testCode = pick(row, ['test_code', 'testCode', 'code']);
  if (!testId && !testCode) errors.push('test_id or test_code is required');
  const price = parsePrice(row.price);
  if (price.error) errors.push(price.error);
  const active = parseActive(row.is_active ?? row.isActive ?? row.active);
  if (active.error) errors.push(active.error);
  const currency = pick(row, ['currency']);
  if (currency && currency.toUpperCase() !== 'INR') errors.push('currency must be INR');
  return { testId, testCode, price: price.value, isActive: active.value, errors };
}

/** CSV text -> row objects. The header row names the columns (test_id or test_code, price, is_active). */
export function parseCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new LabPriceListError('csv is empty', { code: 'CSV_EMPTY' });
  try {
    return parseCsvSync(text, {
      columns: (header) => header.map((h) => String(h).trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (error) {
    throw new LabPriceListError(`csv could not be read: ${error.message}`, { code: 'CSV_INVALID' });
  }
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/** A lab by numeric id or by its entity uid. */
export async function resolveLab(labRef) {
  const ref = String(labRef ?? '').trim();
  if (!ref) return null;
  const byId = /^\d+$/.test(ref);
  if (!byId && !/^[A-Za-z0-9]{6}$/.test(ref)) return null;
  const { rows } = await pool.query(
    `SELECT id, unique_id AS uid, name, status FROM labs WHERE ${byId ? 'id = $1' : 'unique_id = $1'} LIMIT 1`,
    [byId ? Number(ref) : ref.toUpperCase()],
  );
  return rows[0] || null;
}

/** The registered uid of whoever is making a change, or null. */
export async function actorUid({ labId = null, userId = null } = {}) {
  const [table, id] = labId ? ['labs', labId] : userId ? ['users', userId] : [null, null];
  if (!table) return null;
  const { rows } = await pool.query(
    `SELECT a.unique_id AS uid
       FROM ${table} a
       JOIN entity_registry r ON r.uid = a.unique_id AND r.retired_at IS NULL
      WHERE a.id = $1`,
    [Number(id)],
  );
  return rows[0]?.uid ?? null;
}

const CATALOGUE_SQL = `
  SELECT test_id, test_code, name, category, sample_type, turnaround_time_hours, price
    FROM api_lab_tests
   WHERE status = 'active'
   ORDER BY category, name`;

/** The platform catalogue a lab picks its tests from, with the Standard price for reference. */
export async function listCatalogue() {
  const { rows } = await pool.query(CATALOGUE_SQL);
  return rows.map((row) => ({
    testId: row.test_id,
    code: row.test_code ?? null,
    name: row.name,
    category: row.category ?? null,
    sampleType: row.sample_type ?? null,
    turnaroundHours: row.turnaround_time_hours ?? null,
    standardPrice: row.price === null || row.price === undefined ? null : Number(row.price),
  }));
}

async function activeCatalogueByRef(client, ids, codes) {
  const { rows } = await client.query(
    `SELECT test_id, test_code, name
       FROM api_lab_tests
      WHERE status = 'active'
        AND (test_id = ANY($1::text[]) OR LOWER(test_code) = ANY($2::text[]))`,
    [ids, codes.map((c) => c.toLowerCase())],
  );
  const byId = new Map();
  const byCode = new Map();
  for (const row of rows) {
    byId.set(row.test_id, row);
    if (row.test_code) byCode.set(String(row.test_code).toLowerCase(), row);
  }
  return { byId, byCode };
}

const PRICE_ROW_SQL = `
  SELECT p.test_id, p.price, p.currency, p.is_active, p.lab_uid, p.updated_by_uid, p.updated_at, p.created_at,
         t.test_code, t.name, t.category, t.sample_type, t.price AS standard_price, t.status AS catalogue_status
    FROM lab_test_prices p
    JOIN api_lab_tests t ON t.test_id = p.test_id`;

const priceRow = (row) => ({
  testId: row.test_id,
  code: row.test_code ?? null,
  name: row.name,
  category: row.category ?? null,
  sampleType: row.sample_type ?? null,
  price: Number(row.price),
  currency: row.currency || 'INR',
  isActive: Boolean(row.is_active),
  // A lab price for a test the platform has withdrawn is kept but not bookable.
  bookable: Boolean(row.is_active) && row.catalogue_status === 'active',
  standardPrice: row.standard_price === null || row.standard_price === undefined ? null : Number(row.standard_price),
  labUid: row.lab_uid ?? null,
  updatedByUid: row.updated_by_uid ?? null,
  updatedAt: row.updated_at ?? null,
  createdAt: row.created_at ?? null,
});

/** A lab's price list and whether booking uses it. */
export async function listLabPrices(lab, { includeInactive = false } = {}) {
  return guarded(async () => {
    const { rows } = await pool.query(
      `${PRICE_ROW_SQL}
        WHERE p.lab_id = $1 ${includeInactive ? '' : 'AND p.is_active'}
        ORDER BY t.category, t.name`,
      [lab.id],
    );
    const { rows: [counts] } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*)::int AS total
         FROM lab_test_prices WHERE lab_id = $1`,
      [lab.id],
    );
    const active = counts?.active ?? 0;
    return {
      lab: { id: lab.id, uid: lab.uid ?? null, name: lab.name },
      // What GET /api/labs/:labId/tests, the cart and booking use for this lab.
      priceSource: active > 0 ? 'lab' : 'standard',
      activeCount: active,
      totalCount: counts?.total ?? 0,
      prices: rows.map(priceRow),
    };
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Add or update prices for one lab. All-or-nothing: if any row is invalid
 * (unknown test, bad price, a test named twice) nothing is written and every
 * error is reported with its 1-based row number.
 *
 * @param {object} lab           { id, uid }
 * @param {object[]} inputRows   [{ test_id | test_code, price, is_active? }]
 * @param {object} options       { actorUid, dryRun }
 */
export async function upsertLabPrices(lab, inputRows, { actorUid: updatedBy = null, dryRun = false } = {}) {
  if (!Array.isArray(inputRows) || !inputRows.length) {
    throw new LabPriceListError('Send at least one price row.', { code: 'NO_ROWS' });
  }
  if (inputRows.length > MAX_BULK_ROWS) {
    throw new LabPriceListError(`Send at most ${MAX_BULK_ROWS} rows in one upload.`, { code: 'TOO_MANY_ROWS' });
  }
  const parsed = inputRows.map(readRow);

  return guarded(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = parsed.map((r) => r.testId).filter(Boolean);
      const codes = parsed.map((r) => r.testCode).filter(Boolean);
      const catalogue = await activeCatalogueByRef(client, ids, codes);

      const errors = [];
      const resolved = [];
      const seen = new Map();
      parsed.forEach((row, index) => {
        const rowNumber = index + 1;
        const rowErrors = [...(row.errors || [])];
        let test = null;
        if (row.testId || row.testCode) {
          const byId = row.testId ? catalogue.byId.get(row.testId) : null;
          const byCode = row.testCode ? catalogue.byCode.get(row.testCode.toLowerCase()) : null;
          if (row.testId && !byId) rowErrors.push(`test_id "${row.testId}" is not an active catalogue test`);
          if (row.testCode && !byCode) rowErrors.push(`test_code "${row.testCode}" is not an active catalogue test`);
          if (byId && byCode && byId.test_id !== byCode.test_id) rowErrors.push(`test_id "${row.testId}" and test_code "${row.testCode}" name different tests`);
          test = byId || byCode;
          if (test && !rowErrors.length) {
            if (seen.has(test.test_id)) rowErrors.push(`test "${test.test_id}" is already on row ${seen.get(test.test_id)}`);
            else seen.set(test.test_id, rowNumber);
          }
        }
        if (rowErrors.length) {
          errors.push({ row: rowNumber, testId: row.testId ?? null, testCode: row.testCode ?? null, errors: rowErrors });
        } else {
          resolved.push({ row: rowNumber, test, price: row.price, isActive: row.isActive });
        }
      });

      if (errors.length) {
        await client.query('ROLLBACK');
        throw new LabPriceListError(
          `${errors.length} of ${parsed.length} row(s) are invalid; nothing was saved.`,
          { status: 422, code: 'INVALID_ROWS', errors },
        );
      }

      const results = [];
      for (const item of resolved) {
        // A row that leaves is_active out keeps an existing row's state and
        // makes a new row active.
        const { rows: [saved] } = await client.query(
          `INSERT INTO lab_test_prices (lab_id, test_id, price, currency, is_active, updated_by_uid)
           VALUES ($1, $2, $3, 'INR', COALESCE($4, TRUE), $5)
           ON CONFLICT (lab_id, test_id) DO UPDATE
             SET price = EXCLUDED.price,
                 is_active = COALESCE($4, lab_test_prices.is_active),
                 updated_by_uid = EXCLUDED.updated_by_uid,
                 updated_at = NOW()
           RETURNING test_id, price, is_active, (xmax = 0) AS created`,
          [lab.id, item.test.test_id, item.price, item.isActive ?? null, updatedBy],
        );
        results.push({
          row: item.row,
          testId: saved.test_id,
          code: item.test.test_code ?? null,
          name: item.test.name,
          price: Number(saved.price),
          isActive: Boolean(saved.is_active),
          action: saved.created ? 'created' : 'updated',
        });
      }

      await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
      return {
        dryRun: Boolean(dryRun),
        saved: dryRun ? 0 : results.length,
        created: results.filter((r) => r.action === 'created').length,
        updated: results.filter((r) => r.action === 'updated').length,
        results,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

async function resolveTestRef(testRef) {
  const ref = String(testRef ?? '').trim();
  if (!ref) return null;
  const { rows } = await pool.query(
    'SELECT test_id FROM api_lab_tests WHERE test_id = $1 OR LOWER(test_code) = LOWER($1) ORDER BY (test_id = $1) DESC LIMIT 1',
    [ref],
  );
  return rows[0]?.test_id ?? null;
}

/** Change the price and/or active flag of a test already on the lab's list. */
export async function updateLabPrice(lab, testRef, changes = {}, { actorUid: updatedBy = null } = {}) {
  const sets = [];
  const params = [];
  const errors = [];
  if (changes.price !== undefined) {
    const price = parsePrice(changes.price);
    if (price.error) errors.push(price.error);
    else { params.push(price.value); sets.push(`price = $${params.length}`); }
  }
  const activeInput = changes.isActive ?? changes.is_active ?? changes.active;
  if (activeInput !== undefined) {
    const active = parseActive(activeInput);
    if (active.error || active.value === undefined) errors.push(active.error || 'is_active must be true or false');
    else { params.push(active.value); sets.push(`is_active = $${params.length}`); }
  }
  if (errors.length) throw new LabPriceListError(errors.join('; '), { status: 422, code: 'INVALID_PRICE' });
  if (!sets.length) throw new LabPriceListError('Send a price and/or isActive to change.', { code: 'NO_CHANGES' });

  return guarded(async () => {
    const testId = await resolveTestRef(testRef);
    if (!testId) throw new LabPriceListError('This test is not in the catalogue.', { status: 404, code: 'TEST_NOT_FOUND' });
    params.push(updatedBy, lab.id, testId);
    const { rows } = await pool.query(
      `UPDATE lab_test_prices
          SET ${sets.join(', ')}, updated_by_uid = $${params.length - 2}, updated_at = NOW()
        WHERE lab_id = $${params.length - 1} AND test_id = $${params.length}
        RETURNING test_id`,
      params,
    );
    if (!rows.length) throw new LabPriceListError('This test is not on the lab\'s price list.', { status: 404, code: 'PRICE_NOT_FOUND' });
    const { rows: [row] } = await pool.query(`${PRICE_ROW_SQL} WHERE p.lab_id = $1 AND p.test_id = $2`, [lab.id, testId]);
    return priceRow(row);
  });
}

/** Stop offering a test (the row is kept, inactive). */
export async function deactivateLabPrice(lab, testRef, options = {}) {
  return updateLabPrice(lab, testRef, { isActive: false }, options);
}

export default {
  parsePrice, parseActive, parseCsv, resolveLab, actorUid, listCatalogue, listLabPrices,
  upsertLabPrices, updateLabPrice, deactivateLabPrice, LabPriceListError,
};
