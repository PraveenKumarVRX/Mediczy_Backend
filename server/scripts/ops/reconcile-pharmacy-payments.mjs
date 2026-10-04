#!/usr/bin/env node
/**
 * Reconcile patient_pharmacy_orders against the billing chain + Razorpay.
 *
 * Finds pharmacy orders whose linked payments row is success/captured but whose own
 * payment_status is still 'pending' (orders placed before the payment-propagation fix
 * in billing.route.js, which now updates the pharmacy row when a payment is verified).
 *
 * For each candidate it re-fetches the payment from the Razorpay API and refuses to
 * write unless Razorpay itself reports captured AND the amount matches the pharmacy
 * order total to the paisa.
 *
 * Only payment fields are touched: payment_status -> 'paid' and payment_id -> the
 * Razorpay payment id. The fulfilment `status` is deliberately left alone, because
 * money received is not the same event as a pharmacist dispensing the medicine.
 *
 * Usage:
 *   node scripts/ssm-env-loader.mjs scripts/ops/reconcile-pharmacy-payments.mjs            # dry run
 *   node scripts/ssm-env-loader.mjs scripts/ops/reconcile-pharmacy-payments.mjs --apply    # write
 *   ... --order 38      restrict to one pharmacy order
 */
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const APPLY = process.argv.includes('--apply');
const onlyIdx = process.argv.indexOf('--order');
const ONLY = onlyIdx > -1 ? Number(process.argv[onlyIdx + 1]) : null;

const dbName = (await db.query('SELECT current_database()')).rows[0].current_database;
console.log(`database : ${dbName}`);
console.log(`mode     : ${APPLY ? 'APPLY (writes)' : 'DRY RUN'}${ONLY ? ` | order ${ONLY}` : ''}`);

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
if (!keyId || !keySecret) {
  console.error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — cannot verify, refusing to run.');
  process.exit(1);
}
const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
console.log(`razorpay : ${keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST'} (${keyId.slice(0, 12)}…)\n`);

// orders.metadata->>'pharmacyOrderId' is the only link between the billing chain and
// the pharmacy table; there is no FK.
const { rows: candidates } = await db.query(
  `SELECT ppo.order_id,
          ppo.payment_status,
          ppo.status            AS fulfilment_status,
          ppo.total_amount,
          p.id                  AS payment_row_id,
          p."gatewayPaymentId"  AS gateway_payment_id,
          p.status              AS payment_row_status,
          p.amount              AS payment_amount,
          o.id                  AS order_id_billing
     FROM patient_pharmacy_orders ppo
     JOIN orders o   ON (o.metadata->>'pharmacyOrderId')::int = ppo.order_id
     JOIN payments p ON p."orderId" = o.id
    WHERE ppo.payment_status <> 'paid'
      AND p.status IN ('success', 'captured')
      AND p."gatewayPaymentId" IS NOT NULL
      AND ($1::int IS NULL OR ppo.order_id = $1::int)
    ORDER BY ppo.order_id`,
  [ONLY]
);

if (candidates.length === 0) {
  console.log('No pharmacy orders are out of sync with a successful payment. Nothing to do.');
  process.exit(0);
}
console.log(`${candidates.length} candidate(s) with a successful payment but payment_status != 'paid':\n`);

let applied = 0;
let skipped = 0;

for (const c of candidates) {
  const label = `pharmacy order ${c.order_id} (${c.gateway_payment_id})`;
  const res = await fetch(`https://api.razorpay.com/v1/payments/${c.gateway_payment_id}`, {
    headers: { Authorization: authHeader },
  });
  const pay = await res.json();
  if (!res.ok) {
    console.log(`  ✗ ${label}: Razorpay HTTP ${res.status} ${pay?.error?.description || ''} — skipped`);
    skipped += 1;
    continue;
  }

  const expectedPaise = Math.round(Number(c.total_amount) * 100);
  const captured = pay.status === 'captured' && pay.captured === true;
  const amountMatches = Number(pay.amount) === expectedPaise;

  if (!captured || !amountMatches) {
    console.log(`  ✗ ${label}: razorpay status=${pay.status} captured=${pay.captured} `
      + `amount=${pay.amount} expected=${expectedPaise} — skipped`);
    skipped += 1;
    continue;
  }

  console.log(`  ✓ ${label}: captured ₹${(pay.amount / 100).toFixed(2)} via ${pay.method}`
    + `${pay.acquirer_data?.rrn ? ` RRN ${pay.acquirer_data.rrn}` : ''}`);
  console.log(`      payment_status '${c.payment_status}' -> 'paid', payment_id NULL -> '${c.gateway_payment_id}'`);
  console.log(`      fulfilment status stays '${c.fulfilment_status}' (payment received, not dispensed)`);

  if (!APPLY) continue;

  const event = {
    status: c.fulfilment_status,
    timestamp: new Date().toISOString(),
    note: `Payment reconciled from Razorpay ${c.gateway_payment_id}`
      + `${pay.acquirer_data?.rrn ? ` (RRN ${pay.acquirer_data.rrn})` : ''} — payment_status set to paid`,
  };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE patient_pharmacy_orders
          SET payment_status = 'paid',
              payment_id     = $1,
              status_history = COALESCE(status_history, '[]'::jsonb) || $2::jsonb,
              updated_at     = NOW()
        WHERE order_id = $3
          AND payment_status <> 'paid'`,
      [c.gateway_payment_id, JSON.stringify(event), c.order_id]
    );
    if (upd.rowCount !== 1) {
      throw new Error(`expected to update exactly 1 row, updated ${upd.rowCount}`);
    }
    await client.query('COMMIT');
    applied += 1;
    console.log(`      ✅ committed`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.log(`      ❌ rolled back: ${err.message}`);
    skipped += 1;
  } finally {
    client.release();
  }
}

console.log(`\n${APPLY ? `applied ${applied}` : `would apply ${candidates.length - skipped}`}, skipped ${skipped}`);
if (!APPLY) console.log('Re-run with --apply to write.');
process.exit(0);
