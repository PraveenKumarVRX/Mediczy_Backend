/**
 * Migration: Payment integrity (WP-0.4)
 * ================================================================
 *  - hospital_payments: unique (gateway, gateway_payment_id) so one gateway payment can only
 *    ever be posted once, however many times a webhook or callback is delivered.
 *  - payment_gateway_events: UNIQUE (gateway, event_id) for webhook idempotency.
 *  - payroll_runs: unique (tenant_id, month) so a month cannot be run twice.
 *  - scm_ap_payments: unique (invoice_id, payment_ref) idempotency key for vendor payments.
 *  - hospital_payment_refunds / allocations: lookup indexes for the locked refund/allocation checks.
 *
 * Additive. The billing and supply-chain tables are still created lazily by their own
 * services, so each step is skipped (with a notice) when its table does not exist yet;
 * re-run this migration once it does. Each unique index is created only if existing data
 * has no duplicates, otherwise the step is skipped and reported instead of failing.
 */
import pool from '../db/pgPool.js';

async function tableExists(client, name) {
  return Boolean((await client.query(`SELECT to_regclass($1) AS r`, [`public.${name}`])).rows[0].r);
}

async function uniqueIndex(client, { name, table, columns, where = null, dupeSql }) {
  if (!(await tableExists(client, table))) { console.log(`⚠️  ${name}: ${table} does not exist yet — skipped (re-run after first use)`); return; }
  const dupes = (await client.query(dupeSql)).rows;
  if (dupes.length) { console.log(`⚠️  ${name}: ${dupes.length} duplicate group(s) already in ${table} — index NOT created; resolve them, then re-run`); return; }
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${table} (${columns})${where ? ` WHERE ${where}` : ''}`);
  console.log(`✅ ${name}`);
}

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_gateway_events (
        id            BIGSERIAL PRIMARY KEY,
        gateway       VARCHAR(40) NOT NULL,
        event_id      VARCHAR(200) NOT NULL,
        event_type    VARCHAR(80),
        hospital_id   INTEGER,
        received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at  TIMESTAMPTZ,
        outcome       VARCHAR(40),
        UNIQUE (gateway, event_id)
      )
    `);
    console.log('✅ payment_gateway_events');

    await uniqueIndex(client, {
      name: 'uq_hospital_payments_gateway_payment', table: 'hospital_payments', columns: 'gateway, gateway_payment_id', where: 'gateway_payment_id IS NOT NULL',
      dupeSql: `SELECT 1 FROM hospital_payments WHERE gateway_payment_id IS NOT NULL GROUP BY gateway, gateway_payment_id HAVING count(*) > 1`,
    });
    await uniqueIndex(client, {
      name: 'uq_payroll_runs_tenant_month', table: 'payroll_runs', columns: 'tenant_id, month',
      dupeSql: `SELECT 1 FROM payroll_runs GROUP BY tenant_id, month HAVING count(*) > 1`,
    });
    await uniqueIndex(client, {
      name: 'uq_scm_ap_payments_invoice_ref', table: 'scm_ap_payments', columns: 'invoice_id, payment_ref', where: 'payment_ref IS NOT NULL',
      dupeSql: `SELECT 1 FROM scm_ap_payments WHERE payment_ref IS NOT NULL GROUP BY invoice_id, payment_ref HAVING count(*) > 1`,
    });
    for (const [name, table, cols] of [
      ['idx_hospital_payment_refunds_payment', 'hospital_payment_refunds', 'payment_id'],
      ['idx_hospital_payment_allocations_payment', 'hospital_payment_allocations', 'payment_id'],
    ]) {
      if (await tableExists(client, table)) { await client.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`); console.log(`✅ ${name}`); }
    }

    await client.query('COMMIT');
    console.log('✅ Payment integrity migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const i of ['uq_hospital_payments_gateway_payment', 'uq_payroll_runs_tenant_month', 'uq_scm_ap_payments_invoice_ref', 'idx_hospital_payment_refunds_payment', 'idx_hospital_payment_allocations_payment']) {
      await client.query(`DROP INDEX IF EXISTS ${i}`);
    }
    await client.query('DROP TABLE IF EXISTS payment_gateway_events');
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

// Run as standalone: node payments-integrity.migration.js
if (process.argv[1] && process.argv[1].includes('payments-integrity.migration')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
