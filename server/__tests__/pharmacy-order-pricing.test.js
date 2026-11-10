import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackSize, priceLine, packPriceOf, requiresPrescription, checkPackConsistency, STALE_UNIT_PRICING,
         computeOrderTotals, DELIVERY_FEE_INR, DISCOUNT_THRESHOLD_INR, MEDICINE_DISCOUNT_PCT } from '../utils/pharmacy-pricing.js';

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
  it('prices a counted pack by the pack and multiplies by the pack count', () => {
    const line = priceLine(med({ mrp: '33.23', selling_price: '33.23', pack_size: '10 tablets' }), 2);
    expect(line.unitPrice).toBe(33.23);
    expect(line.lineTotal).toBe(66.46);
    expect(line.soldByPack).toBe(true);
  });

  it('prices a measured pack at the whole pack price too', () => {
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

describe('medicines are sold by the pack', () => {
  // Decided 2026-11-10: packs only, no loose tablets.
  const strip = med({ mrp: '12.33', selling_price: '12.33', pack_size: 'strip of 10 tablets' });

  it('bills the pack price per pack, never a fraction of it', () => {
    const line = priceLine(strip, 1, { unitMode: 'pack', price: 12.33, packPrice: 12.33 });
    expect(line.unitMode).toBe('pack');
    expect(line.unitPrice).toBe(12.33);
    expect(line.lineTotal).toBe(12.33);
    expect(line.soldByPack).toBe(true);
  });

  it('multiplies by the number of packs', () => {
    expect(priceLine(strip, 3, { unitMode: 'pack' }).lineTotal).toBe(36.99);
  });

  it('names what the pack contains, without pricing it per unit', () => {
    expect(priceLine(strip, 1, { unitMode: 'pack' }).packContains).toBe('10 tablets');
    expect(priceLine(strip, 1, { unitMode: 'pack' }).unit).toBe('pack');
  });

  it('prices a measured pack the same way, by the container', () => {
    const syrup = med({ mrp: '16.22', selling_price: '16.22', pack_size: 'bottle of 100 ml Syrup' });
    expect(priceLine(syrup, 2, { unitMode: 'pack' }).lineTotal).toBe(32.44);
  });

  it('refuses a line priced per tablet instead of billing ten packs for ten tablets', () => {
    // A browser holding the previous bundle still prices per tablet. Reading its
    // tablet count as packs would charge ten times the intended amount, so the
    // line is refused and the customer is asked to reload.
    const stale = priceLine(strip, 10, { unit: 'tablet', price: 1.23, packPrice: 12.33 });
    expect(stale.error).toBe(STALE_UNIT_PRICING);
    expect(stale.lineTotal).toBeUndefined();
  });

  it('accepts a line that identifies itself as packs, however it says so', () => {
    for (const item of [{ unitMode: 'pack' }, { unit: 'pack' }, { price: 12.33 }]) {
      expect(priceLine(strip, 1, item).error).toBeUndefined();
    }
  });

  it('accepts a line with no per-unit signal at all', () => {
    // Only an identifiable per-unit price is the ten-times case.
    expect(priceLine(strip, 1, {}).error).toBeUndefined();
    expect(priceLine(strip, 1, {}).lineTotal).toBe(12.33);
  });

  it('cannot be confused when the pack holds one thing', () => {
    const single = med({ mrp: '50', selling_price: '50', pack_size: 'vial of 1 Injection' });
    expect(checkPackConsistency({ unit: 'injection', price: 50 }, { packPrice: 50, unitsPerPack: 1 }).ok).toBe(true);
    expect(priceLine(single, 2, { unit: 'injection', price: 50 }).lineTotal).toBe(100);
  });

  it('takes the amount from the catalogue, so a tampered price cannot change the bill', () => {
    const honest = priceLine(strip, 2, { unitMode: 'pack', price: 12.33 });
    const tampered = priceLine(strip, 2, { unitMode: 'pack', price: 0.01 });
    expect(tampered.lineTotal).toBe(honest.lineTotal);
    expect(priceLine(strip, 1, { unitMode: 'pack', price: 0 }).lineTotal).toBe(12.33);
  });
});

describe('a stale per-unit basket is refused, not billed', () => {
  it('the billing route answers 409 and names the items to re-add', () => {
    const src = read('routes/billing.route.js');
    expect(src).toContain('STALE_UNIT_PRICING');
    expect(src).toContain('STALE_CLIENT_PRICING');
    expect(src).toContain('status(409)');
    expect(src).toContain('sold by the pack');
  });

  it('the pharmacy route does the same, and keeps it apart from an unpriceable item', () => {
    const src = read('routes/patient-pharmacy-orders.route.js');
    expect(src).toContain('stalePricedItems');
    expect(src).toContain('STALE_CLIENT_PRICING');
    expect(src).toContain('MEDICINE_NOT_IN_CATALOGUE');
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
  // Anchored on the route's own path literal so the slice survives the signature
  // being reformatted (it gained a multer stage and became multi-line).
  const start = source.indexOf("router.post(\n  '/orders',");
  const handler = source.slice(start, source.indexOf('* GET /api/billing/orders', start));

  it('prices from the catalogue rather than the submitted price', () => {
    expect(handler.length).toBeGreaterThan(500);
    expect(handler).toContain('resolveMedicine(sharedPool');
    expect(handler).toContain('priceLine(medicine, item.quantity, item)');
    // The old arithmetic billed parseFloat(item.price) * qty.
    expect(handler).not.toMatch(/parseFloat\(item\.price\)/);
    expect(handler).toContain('computeOrderTotals(priced)');
  });

  it('refuses an item it cannot price instead of substituting another medicine', () => {
    expect(handler).toContain('MEDICINE_NOT_IN_CATALOGUE');
    expect(handler).toContain('unresolved');
  });

  it('gates Schedule H/H1/X, which this path did not check at all', () => {
    expect(handler).toContain('requiresPrescription(line.schedule)');
    expect(handler).toContain('PRESCRIPTION_REQUIRED');
  });

  it('accepts a prescription file and lets one satisfy the gate', () => {
    expect(handler).toContain('prescriptionFileUrl');
    expect(handler).toContain('rxLines.length && !prescriptionFileUrl');
    expect(handler).toContain('uploadToMinio');
    // A storage failure is ours, not the customer's invalid order.
    expect(handler).toContain('PRESCRIPTION_UPLOAD_FAILED');
  });

  it('reads multipart fields, where items is JSON text and a boolean is a string', () => {
    expect(handler).toContain("typeof items === 'string'");
    expect(handler).toContain('JSON.parse(items)');
    // "false" is truthy, so !!value would have read it as true.
    expect(handler).toContain("rawRxRequired.toLowerCase() === 'true'");
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
