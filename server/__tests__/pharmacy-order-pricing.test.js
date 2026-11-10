import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackSize, priceLine, packPriceOf, requiresPrescription, resolveUnitMode } from '../utils/pharmacy-pricing.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const med = (over = {}) => ({
  id: 1, name: 'Test Med', brand_name: null, generic_name: null, strength: null, form: null,
  manufacturer: null, mrp: '100.00', unit_price: '100.00', selling_price: '100.00',
  pack_size: 'strip of 10 tablets', schedule: null, cims_id: null, ...over,
});

describe('pack size reading', () => {
  it('splits a counted pack into its sellable units', () => {
    expect(parsePackSize('strip of 10 tablets')).toMatchObject({ sellableUnits: 10, unit: 'tablet', countable: true });
    expect(parsePackSize('strip of 15 tablets')).toMatchObject({ sellableUnits: 15, countable: true });
    expect(parsePackSize('10 tablets')).toMatchObject({ sellableUnits: 10, countable: true });
    expect(parsePackSize('strip of 10 capsule sr')).toMatchObject({ sellableUnits: 10, unit: 'capsule', countable: true });
  });

  it('never splits a measured pack, so syrup is not sold by the millilitre', () => {
    // The old unanchored regex read "bottle of 100 ml Syrup" as 100 units, which
    // offered a 16.22 bottle at 0.16 per ml.
    expect(parsePackSize('bottle of 100 ml Syrup')).toMatchObject({ sellableUnits: 1, unit: 'bottle', countable: false });
    expect(parsePackSize('tube of 15 gm Cream')).toMatchObject({ sellableUnits: 1, unit: 'tube', countable: false });
    expect(parsePackSize('bottle of 5 ml Eye Drop')).toMatchObject({ sellableUnits: 1, countable: false });
    expect(parsePackSize('vial of 2 ml Injection')).toMatchObject({ sellableUnits: 1, countable: false });
  });

  it('treats an unrecognised or absent pack as one whole pack rather than guessing', () => {
    expect(parsePackSize('')).toMatchObject({ sellableUnits: 1, countable: false });
    expect(parsePackSize(undefined)).toMatchObject({ sellableUnits: 1, countable: false });
    expect(parsePackSize('box of 3 widgets')).toMatchObject({ sellableUnits: 1, countable: false });
    expect(parsePackSize('strip of 0 tablets')).toMatchObject({ sellableUnits: 1, countable: false });
  });
});

describe('line pricing', () => {
  it('prices a counted pack per unit and multiplies by quantity', () => {
    const line = priceLine(med({ mrp: '33.23', selling_price: '33.23', pack_size: '10 tablets' }), 2);
    expect(line.unitPrice).toBe(3.32);
    expect(line.lineTotal).toBe(6.64);
    expect(line.soldByPack).toBe(false);
  });

  it('prices a measured pack at the whole pack price', () => {
    const line = priceLine(med({ mrp: '16.22', selling_price: '16.22', pack_size: 'bottle of 100 ml Syrup' }), 2);
    expect(line.unitPrice).toBe(16.22);
    expect(line.lineTotal).toBe(32.44);
    expect(line.soldByPack).toBe(true);
  });

  it('never bills less than one unit, whatever quantity arrives', () => {
    for (const q of [0, -5, null, undefined, 'abc', 0.4]) {
      expect(priceLine(med(), q).quantity).toBe(1);
    }
  });

  it('refuses a medicine with no usable catalogue price instead of billing zero', () => {
    expect(priceLine(med({ mrp: null, unit_price: null, selling_price: null }), 1).error).toBe('no_catalogue_price');
    expect(priceLine(med({ mrp: '0', unit_price: '0', selling_price: '0' }), 1).error).toBe('no_catalogue_price');
  });

  it('prefers selling_price, then mrp, then unit_price', () => {
    expect(packPriceOf({ selling_price: '10', mrp: '20', unit_price: '30' })).toBe(10);
    expect(packPriceOf({ selling_price: null, mrp: '20', unit_price: '30' })).toBe(20);
    expect(packPriceOf({ selling_price: null, mrp: null, unit_price: '30' })).toBe(30);
  });
});

describe('pack-vs-unit mode resolution', () => {
  // Two client generations are live: one sends `unit: 'pack'` with the pack price
  // and quantity 1, the other sends a per-tablet price with quantity in tablets.
  // Reading one as the other is a tenfold error in the customer's bill.
  const strip = med({ mrp: '12.33', selling_price: '12.33', pack_size: 'strip of 10 tablets' });

  it('bills a pack when the client says pack', () => {
    const line = priceLine(strip, 1, { unit: 'pack', price: 12.33, packPrice: 12.33 });
    expect(line.unitMode).toBe('pack');
    expect(line.lineTotal).toBe(12.33);
  });

  it('bills per tablet when the client priced per tablet', () => {
    const line = priceLine(strip, 10, { unit: 'tablet', price: 1.23, packPrice: 12.33 });
    expect(line.unitMode).toBe('unit');
    expect(line.lineTotal).toBe(12.3);
  });

  it('honours an explicit unitMode over any inferred signal', () => {
    expect(priceLine(strip, 1, { unitMode: 'pack', unit: 'tablet', price: 1.23 }).unitMode).toBe('pack');
    expect(priceLine(strip, 1, { unitMode: 'unit', unit: 'pack', price: 12.33 }).unitMode).toBe('unit');
  });

  it('assumes per unit when nothing identifies the mode, so it cannot overcharge', () => {
    const line = priceLine(strip, 1, {});
    expect(line.unitMode).toBe('unit');
    expect(line.lineTotal).toBeLessThan(12.33);
  });

  it('always bills a measured pack as one whole pack', () => {
    const syrup = med({ mrp: '16.22', selling_price: '16.22', pack_size: 'bottle of 100 ml Syrup' });
    for (const item of [{}, { unit: 'ml', price: 0.16 }, { unitMode: 'unit' }]) {
      expect(priceLine(syrup, 1, item).lineTotal).toBe(16.22);
    }
  });

  it('takes the amount from the catalogue, so a tampered price cannot change the bill', () => {
    const honest = priceLine(strip, 10, { unit: 'tablet', price: 1.23, packPrice: 12.33 });
    const tampered = priceLine(strip, 10, { unit: 'tablet', price: 0.01, packPrice: 0.01 });
    // A price the server does not recognise only loses the mode hint; it can
    // never set the amount, which still comes from the catalogue.
    expect(tampered.lineTotal).toBe(honest.lineTotal);
    expect(priceLine(strip, 1, { price: 0 }).lineTotal).toBeGreaterThan(0);
  });
});

describe('prescription schedules', () => {
  it('requires a prescription for H, H1 and X only', () => {
    for (const s of ['H', 'H1', 'X', 'h', ' x ']) expect(requiresPrescription(s)).toBe(true);
    for (const s of ['OTC', 'G', '', null, undefined]) expect(requiresPrescription(s)).toBe(false);
  });
});

describe('POST /api/billing/orders no longer trusts the browser', () => {
  const source = read('routes/billing.route.js');
  const handler = source.slice(
    source.indexOf("router.post('/orders', authUser"),
    source.indexOf("* GET /api/billing/orders")
  );

  it('prices from the catalogue rather than the submitted price', () => {
    expect(handler.length).toBeGreaterThan(500);
    expect(handler).toContain('resolveMedicine(sharedPool');
    expect(handler).toContain('priceLine(medicine, item.quantity, item)');
    // The old arithmetic billed parseFloat(item.price) * qty.
    expect(handler).not.toMatch(/parseFloat\(item\.price\)/);
    expect(handler).toContain('priced.reduce((sum, line) => sum + line.lineTotal, 0)');
  });

  it('refuses an item it cannot price instead of substituting another medicine', () => {
    expect(handler).toContain('MEDICINE_NOT_IN_CATALOGUE');
    expect(handler).toContain('unresolved');
  });

  it('gates Schedule H/H1/X, which this path did not check at all', () => {
    expect(handler).toContain('requiresPrescription(line.schedule)');
    expect(handler).toContain('PRESCRIPTION_REQUIRED');
  });

  it('persists what was billed, keeping the submitted lines only for audit', () => {
    expect(handler).toContain('items: priced');
    expect(handler).toContain('clientSubmittedItems: items');
  });
});

describe('medicine resolution is exact', () => {
  const source = read('utils/pharmacy-pricing.js');

  it('matches on id, cims_id or a whole name, never a substring', () => {
    // "Augmentin 625" matched "CipAugmentin 625mg" under ILIKE '%name%' and
    // ORDER BY mrp ASC picked it because it was cheaper. Assert against the code
    // with comments stripped, since the comments quote the pattern they replaced.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('LOWER(name) = LOWER($3)');
    expect(code).not.toContain('ILIKE');
    expect(code).not.toMatch(/ORDER BY[\s\S]*mrp ASC/);
  });

  it('does not let the companion route keep its cheapest-substring lookup', () => {
    const companion = read('routes/patient-pharmacy-orders.route.js');
    expect(companion).not.toMatch(/name ILIKE \$1 OR brand_name ILIKE \$1[\s\S]{0,400}mrp ASC LIMIT 1/);
  });
});
