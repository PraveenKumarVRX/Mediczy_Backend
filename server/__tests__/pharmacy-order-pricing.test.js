import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackSize, priceLine, packPriceOf, requiresPrescription, resolveUnitMode,
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

describe('order totals: 15% over 2,000 and a flat 40 delivery fee', () => {
  const lines = (...totals) => totals.map((lineTotal) => ({ lineTotal }));

  it('uses the agreed policy figures', () => {
    expect(DELIVERY_FEE_INR).toBe(40);
    expect(DISCOUNT_THRESHOLD_INR).toBe(2000);
    expect(MEDICINE_DISCOUNT_PCT).toBe(15);
  });

  it('charges the delivery fee on every order, discounted or not', () => {
    expect(computeOrderTotals(lines(100)).deliveryFee).toBe(40);
    expect(computeOrderTotals(lines(5000)).deliveryFee).toBe(40);
    expect(computeOrderTotals(lines(100)).total).toBe(140);
  });

  it('discounts an order above the threshold', () => {
    const t = computeOrderTotals(lines(2500));
    expect(t.subtotal).toBe(2500);
    expect(t.discount).toBe(375);      // 15% of 2500
    expect(t.deliveryFee).toBe(40);
    expect(t.total).toBe(2165);        // 2500 - 375 + 40
    expect(t.discountApplies).toBe(true);
  });

  it('treats "above 2,000" as strictly above, so exactly 2,000 does not qualify', () => {
    expect(computeOrderTotals(lines(2000)).discount).toBe(0);
    expect(computeOrderTotals(lines(2000)).total).toBe(2040);
    expect(computeOrderTotals(lines(2000.01)).discountApplies).toBe(true);
  });

  it('measures the threshold before the fee, so delivery cannot tip an order over it', () => {
    // 1,980 + 40 delivery is 2,020, but the basket is still under the threshold.
    const t = computeOrderTotals(lines(1980));
    expect(t.discount).toBe(0);
    expect(t.total).toBe(2020);
  });

  it('measures the threshold before the discount, so the discount cannot pull it back under', () => {
    const t = computeOrderTotals(lines(2100));
    expect(t.discount).toBe(315);
    expect(t.subtotal - t.discount).toBeLessThan(DISCOUNT_THRESHOLD_INR);
    expect(t.discountApplies).toBe(true);
  });

  it('never discounts the delivery fee itself', () => {
    const t = computeOrderTotals(lines(4000));
    expect(t.discount).toBe(600);                       // 15% of 4000, not of 4040
    expect(t.total).toBe(4000 - 600 + 40);
  });

  it('sums many lines and rounds to paise', () => {
    const t = computeOrderTotals(lines(1000.005, 1000.005, 500.33));
    expect(t.subtotal).toBe(2500.34);
    expect(Number.isInteger(Math.round(t.total * 100))).toBe(true);
  });

  it('is safe on an empty or malformed basket', () => {
    expect(computeOrderTotals([]).subtotal).toBe(0);
    expect(computeOrderTotals(undefined).subtotal).toBe(0);
    expect(computeOrderTotals(lines(null, undefined, 'x', 50)).subtotal).toBe(50);
  });
});

describe('both order routes bill the one policy', () => {
  it('the billing route takes its totals from computeOrderTotals', () => {
    const src = read('routes/billing.route.js');
    expect(src).toContain('computeOrderTotals(priced)');
    expect(src).toContain('deliveryFee: totals.deliveryFee');
    expect(src).toContain('discount: totals.discount');
    expect(src).toContain('total: totals.total');
  });

  it('the pharmacy route takes delivery and discount from the policy, not the request', () => {
    const src = read('routes/patient-pharmacy-orders.route.js');
    expect(src).toContain('computeOrderTotals(enrichedItems.map');
    expect(src).toContain('const deliveryChargeVal = policy.deliveryFee');
    // delivery_charge and discount used to be whatever the caller sent.
    expect(src).not.toContain('parseFloat(delivery_charge) || 0');
    expect(src).not.toContain('discountVal = parseFloat(discount) || 0');
  });

  it('offers do not stack, and a losing coupon is not consumed', () => {
    const src = read('routes/patient-pharmacy-orders.route.js');
    expect(src).toContain('const usedCoupon = discountVal > automaticDiscount');
    expect(src).toContain('if (usedCoupon && couponValidation?.coupon)');
  });

  it('still places the order if the deliveryFee column has not been migrated yet', () => {
    // PM2 runs from the working tree, so a restart can load this code before the
    // migration has run. Writing a column Postgres does not have fails the INSERT
    // with 42703, which would stop every medicine order.
    const src = read('routes/billing.route.js');
    expect(src).toContain("=== '42703'");
    expect(src).toContain('deliveryFeeUnmigrated');
    expect(src).toContain('20261110000300-order-delivery-fee');
    // The customer is billed correctly either way, because total already includes it.
    expect(src).toContain('total: totals.total');
  });

  it('Order declares deliveryFee, or Sequelize would drop it from the INSERT', () => {
    expect(read('models/billing.model.intelligent.js')).toMatch(/deliveryFee:\s*\{[\s\S]{0,160}DECIMAL\(10, 2\)/);
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
