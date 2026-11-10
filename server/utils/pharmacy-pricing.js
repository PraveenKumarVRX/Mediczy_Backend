/**
 * The single authority for what a pharmacy line costs and whether it may be sold.
 *
 * Why this exists: POST /api/billing/orders used to bill `item.price` exactly as
 * the browser sent it. The patient Pharmacy page derives that figure by dividing
 * the pack price by a pack count it parses itself, so a 10-tablet strip priced at
 * 33.23 arrived as 3.32 and the order was billed at 3.32. Across the 17 medicine
 * orders placed that way, 13 lines were billed below the price displayed and
 * 2,115.96 was never collected. A client-supplied price is also a tampering hole:
 * nothing stopped a crafted request setting price to 0.
 *
 * The companion route (patient-pharmacy-orders) re-priced server side but resolved
 * the medicine with `name ILIKE '%...%' ORDER BY mrp ASC LIMIT 1` — the cheapest
 * substring match. "Augmentin 625" resolved to "CipAugmentin 625mg" at 110.83: a
 * different manufacturer's product, and the Schedule read off that same wrong row,
 * so the prescription gate judged a drug the customer had not ordered. Resolution
 * here is exact only, and never silently picks a different medicine.
 */

/** Schedules that cannot lawfully be supplied without a prescription (Drugs and Cosmetics Rules). */
export const RX_REQUIRED_SCHEDULES = new Set(['H', 'H1', 'X']);

export const requiresPrescription = (schedule) =>
  Boolean(schedule) && RX_REQUIRED_SCHEDULES.has(String(schedule).toUpperCase().trim());

/**
 * Units that are a measure of a single container, not a count of sellable items.
 * A 100 ml bottle of syrup is one sellable bottle; it is not 100 units of syrup,
 * and no pharmacy dispenses 1 ml for 16 paise.
 */
const MEASURE_UNITS = new Set([
  'ml', 'l', 'litre', 'liter', 'g', 'gm', 'gms', 'gram', 'mg', 'mcg', 'kg',
  'iu', '%', 'unit/ml',
]);

/** Dosage forms that are genuinely countable, so a pack of N can be split into N. */
const COUNTABLE_UNITS = new Set([
  'tablet', 'capsule', 'injection', 'sachet', 'suppository', 'pessary',
  'lozenge', 'chewable', 'patch', 'ampoule', 'vial', 'piece', 'pen',
  'applicator', 'suspension', 'wafer', 'granule', 'strip', 'kit', 'unit',
]);

const singular = (word) => {
  const w = String(word || '').trim().toLowerCase();
  if (w.length > 2 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/**
 * Reads "strip of 10 tablets" -> 10 countable tablets, and
 * "bottle of 100 ml Syrup" -> one bottle (NOT 100 units).
 *
 * `sellableUnits` is how many separately priceable items one pack contains.
 * It is 1 whenever the pack is measured rather than counted, which is what keeps
 * a syrup, cream, gel or drop from being offered per millilitre.
 */
export const parsePackSize = (packSize) => {
  const raw = String(packSize || '').trim();
  const fallback = { sellableUnits: 1, unit: 'pack', countable: false, packLabel: raw || null };
  if (!raw) return fallback;

  // "<container> of <N> <unit...>" or a bare "<N> <unit...>"
  const match = raw.match(/(?:^|\bof\s+)(\d+(?:\.\d+)?)\s+([^\d]+)$/i) || raw.match(/^(\d+(?:\.\d+)?)\s+([^\d]+)$/i);
  if (!match) return fallback;

  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return fallback;

  // The unit is the first word after the number: "ml Syrup" -> ml, "tablet dt" -> tablet.
  const firstWord = singular(String(match[2]).trim().split(/\s+/)[0] || '');

  if (MEASURE_UNITS.has(firstWord)) {
    // Measured pack: the container is the only sellable thing.
    const container = singular(raw.split(/\s+of\s+/i)[0] || 'pack');
    return { sellableUnits: 1, unit: container || 'pack', countable: false, packLabel: raw };
  }

  if (COUNTABLE_UNITS.has(firstWord)) {
    return { sellableUnits: Math.floor(count), unit: firstWord, countable: true, packLabel: raw };
  }

  // An unrecognised unit is treated as a whole pack rather than guessed at, so an
  // unfamiliar dosage form can never be sold at a fraction of its price.
  return fallback;
};

/** The catalogue price of one whole pack. */
export const packPriceOf = (medicine) => {
  const candidates = [medicine?.selling_price, medicine?.mrp, medicine?.unit_price];
  for (const value of candidates) {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/**
 * Resolves the medicine a line refers to, exactly — by numeric id, then CIMS id,
 * then an exact (case-insensitive) name. Never a substring, so an order is either
 * priced as the medicine the customer chose or refused.
 */
export const resolveMedicine = async (pool, { medicineId, name } = {}) => {
  const idRaw = medicineId === undefined || medicineId === null ? '' : String(medicineId).trim();
  const asInt = /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  const exactName = String(name || '').trim();

  if (asInt === null && !idRaw && !exactName) return null;

  const { rows } = await pool.query(
    `SELECT id, name, brand_name, generic_name, strength, form, manufacturer,
            mrp, unit_price, selling_price, pack_size, schedule, cims_id
       FROM pharmacy_medicines
      WHERE ($1::int IS NOT NULL AND id = $1::int)
         OR ($2 <> '' AND cims_id = $2)
         OR ($3 <> '' AND (LOWER(name) = LOWER($3) OR LOWER(brand_name) = LOWER($3)))
      ORDER BY CASE
                 WHEN $1::int IS NOT NULL AND id = $1::int THEN 0
                 WHEN $2 <> '' AND cims_id = $2 THEN 1
                 WHEN $3 <> '' AND LOWER(name) = LOWER($3) THEN 2
                 ELSE 3
               END
      LIMIT 1`,
    [asInt, idRaw, exactName]
  );
  return rows[0] || null;
};

/**
 * Decides whether a line's `quantity` counts whole packs or individual units.
 *
 * Two client generations are live and they disagree. Orders from 6-9 Nov carry
 * `unit: 'pack'` with `price` equal to the pack price and `quantity: 1`, i.e. one
 * strip for 12.33. Earlier orders carry `unit: 'tablet'` with `price` equal to the
 * pack price divided by the pack count and `quantity` counting tablets, i.e.
 * 3.32 x 10 = 33.20. Both were internally consistent, so neither can be called
 * wrong, but reading one as the other is a tenfold error.
 *
 * The mode is therefore taken from what the client itself says, in this order:
 * an explicit `unitMode`, then its `unit` label, then which of the two prices its
 * `price` matches. When nothing identifies the mode, per-unit is assumed: that is
 * the lower of the two amounts, so an unrecognised client can only ever
 * under-bill, never charge a customer ten times what they expected.
 *
 * `price` only selects the interpretation; the amount always comes from the
 * catalogue, so a tampered price cannot raise or lower the total.
 */
export const resolveUnitMode = (item, { packPrice, unitsPerPack }) => {
  const declared = String(item?.unitMode || '').toLowerCase();
  if (declared === 'pack' || declared === 'unit') return { mode: declared, basis: 'declared' };

  if (unitsPerPack <= 1) return { mode: 'pack', basis: 'single-unit pack' };

  const unitLabel = String(item?.unit || '').toLowerCase().trim();
  if (unitLabel === 'pack') return { mode: 'pack', basis: 'unit label' };

  const sent = parseFloat(item?.price);
  if (Number.isFinite(sent) && sent > 0) {
    const perUnit = packPrice / unitsPerPack;
    if (Math.abs(sent - packPrice) <= 0.01) return { mode: 'pack', basis: 'price matches the pack' };
    if (Math.abs(sent - perUnit) <= 0.02) return { mode: 'unit', basis: 'price matches one unit' };
  }

  return { mode: 'unit', basis: 'undetermined, assumed per unit' };
};

/**
 * Prices one line from the catalogue. `quantity` counts whole packs or individual
 * units depending on the mode resolved from the line (see resolveUnitMode).
 * A measured pack — a 100 ml bottle, a 15 gm tube — is always one sellable thing.
 */
export const priceLine = (medicine, requestedQuantity, item = {}) => {
  const packPrice = packPriceOf(medicine);
  if (packPrice === null) {
    return { error: 'no_catalogue_price', medicineName: medicine?.name || null };
  }
  const pack = parsePackSize(medicine?.pack_size);
  const quantity = Math.max(1, Math.floor(Number(requestedQuantity) || 1));

  const { mode, basis } = resolveUnitMode(item, { packPrice, unitsPerPack: pack.sellableUnits });
  const unitPrice = mode === 'pack'
    ? packPrice
    : Number((packPrice / pack.sellableUnits).toFixed(2));
  const lineTotal = Number((unitPrice * quantity).toFixed(2));

  return {
    unitMode: mode,
    unitModeBasis: basis,
    medicineId: medicine.id,
    medicineName: medicine.name,
    brandName: medicine.brand_name || null,
    genericName: medicine.generic_name || null,
    manufacturer: medicine.manufacturer || null,
    strength: medicine.strength || null,
    form: medicine.form || null,
    schedule: medicine.schedule || null,
    packSize: medicine.pack_size || null,
    packPrice,
    unit: pack.unit,
    unitsPerPack: pack.sellableUnits,
    soldByPack: !pack.countable,
    quantity,
    unitPrice,
    lineTotal,
  };
};

/* ── Order-level pricing policy ──────────────────────────────────────────────
 * Decided 2026-11-10: 15% off a medicine order whose value is above 2,000, and a
 * flat 40 delivery fee on every order including the discounted ones.
 *
 * The threshold is tested on the catalogue-priced subtotal, before the discount
 * and before delivery, so adding the fee can never tip an order over the line and
 * the discount can never pull it back under. The discount applies to the medicines
 * only and never to the delivery fee.
 */
export const DELIVERY_FEE_INR = 40;
export const DISCOUNT_THRESHOLD_INR = 2000;
export const MEDICINE_DISCOUNT_PCT = 15;

const money = (n) => Number(Number(n).toFixed(2));

/**
 * Turns priced lines into the amounts an order is actually billed.
 * "Above 2,000" is strictly above, so a subtotal of exactly 2,000 does not qualify.
 */
export const computeOrderTotals = (lines, { deliveryFee = DELIVERY_FEE_INR } = {}) => {
  // A non-numeric lineTotal must not poison the sum: Number('x') is NaN, and a NaN
  // subtotal would be written to the order as its total. priceLine always yields a
  // finite figure, so this only guards a caller that bypassed it.
  const subtotal = money((lines || []).reduce((sum, l) => {
    const n = Number(l?.lineTotal);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0));
  const discountApplies = subtotal > DISCOUNT_THRESHOLD_INR;
  const discount = discountApplies ? money((subtotal * MEDICINE_DISCOUNT_PCT) / 100) : 0;
  const delivery = money(deliveryFee);
  const total = money(subtotal - discount + delivery);
  return {
    subtotal,
    discount,
    discountPct: discountApplies ? MEDICINE_DISCOUNT_PCT : 0,
    discountApplies,
    discountThreshold: DISCOUNT_THRESHOLD_INR,
    deliveryFee: delivery,
    total,
  };
};

export default {
  RX_REQUIRED_SCHEDULES, requiresPrescription, parsePackSize, packPriceOf,
  resolveMedicine, resolveUnitMode, priceLine, computeOrderTotals,
  DELIVERY_FEE_INR, DISCOUNT_THRESHOLD_INR, MEDICINE_DISCOUNT_PCT,
};
