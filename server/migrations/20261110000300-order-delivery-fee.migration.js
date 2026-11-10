/**
 * Gives `orders` somewhere honest to record a delivery fee.
 *
 * The table had subtotal, tax, discount and total. A flat delivery fee is none of
 * those: putting it in `tax` would misstate tax on every invoice, and leaving it
 * only inside metadata would mean total no longer equalled
 * subtotal - discount + <anything recorded>, so nothing downstream could
 * reconcile an order's total against its parts.
 *
 * Additive and idempotent. Existing rows get 0, which is what they were billed.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS "deliveryFee" NUMERIC(10,2) NOT NULL DEFAULT 0;
  `);
}

export async function down(db = pool) {
  await db.query(`ALTER TABLE orders DROP COLUMN IF EXISTS "deliveryFee";`);
}

if ((process.argv[1] || '').includes('20261110000300-order-delivery-fee')) {
  up().then(() => { console.log('order delivery fee column applied'); process.exit(0); })
      .catch((error) => { console.error(error); process.exit(1); });
}
