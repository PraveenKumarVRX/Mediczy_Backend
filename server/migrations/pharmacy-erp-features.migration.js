/**
 * Pharmacy ERP Features — schema additions
 *
 * Adds, in one idempotent pass:
 *  - pharmacy_transactions.prescription_id — links a POS sale back to a prescription
 *  - pharmacy_suppliers (+ pharmacy_purchase_orders.supplier_id FK, non-breaking)
 *  - pharmacy_credit_ledger (+ pharmacy_customers credit_limit/credit_balance)
 *  - hsn_code/gst_rate on pharmacy_medicines; cgst/sgst/igst on pharmacy_invoices
 *  - pharmacy_supplier_returns + pharmacy_supplier_return_items
 *
 * Safe to re-run: every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 *
 * Run: node --env-file=server/.env server/migrations/pharmacy-erp-features.migration.js
 */

import pool from '../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // ── Prescription linkage on POS sales ────────────────────────────────────
  await client.query(`
    ALTER TABLE pharmacy_transactions
      ADD COLUMN IF NOT EXISTS prescription_id INTEGER REFERENCES pharmacy_prescriptions(id)
  `);

  // ── Supplier master ───────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_suppliers (
      id SERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255),
      phone VARCHAR(20),
      email VARCHAR(255),
      gstin VARCHAR(20),
      payment_terms VARCHAR(100),
      outstanding_payable DECIMAL(12,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pharmacy_suppliers_pharmacy_id ON pharmacy_suppliers(pharmacy_id)`);
  await client.query(`
    ALTER TABLE pharmacy_purchase_orders
      ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES pharmacy_suppliers(id)
  `);

  // ── Customer credit ledger ────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE pharmacy_customers
      ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(12,2) DEFAULT 0
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_credit_ledger (
      id SERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES pharmacy_customers(id),
      transaction_id INTEGER REFERENCES pharmacy_transactions(id),
      amount DECIMAL(12,2) NOT NULL,
      entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('charge', 'payment')),
      balance_after DECIMAL(12,2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pharmacy_credit_ledger_customer_id ON pharmacy_credit_ledger(customer_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pharmacy_credit_ledger_pharmacy_id ON pharmacy_credit_ledger(pharmacy_id)`);

  // ── GST / HSN compliance ──────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE pharmacy_medicines
      ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 12.00
  `);
  await client.query(`
    ALTER TABLE pharmacy_invoices
      ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(10,2) DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE pharmacy_invoice_items
      ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0
  `);

  // ── Supplier returns ───────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_supplier_returns (
      id SERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      supplier_id INTEGER REFERENCES pharmacy_suppliers(id),
      supplier_name VARCHAR(255),
      reason TEXT,
      total_amount DECIMAL(12,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'completed',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_supplier_return_items (
      id SERIAL PRIMARY KEY,
      supplier_return_id INTEGER NOT NULL REFERENCES pharmacy_supplier_returns(id),
      medicine_id INTEGER NOT NULL REFERENCES pharmacy_medicines(id),
      batch_id INTEGER REFERENCES pharmacy_batches(id),
      quantity INTEGER NOT NULL,
      cost_price DECIMAL(10,2),
      subtotal DECIMAL(12,2) NOT NULL
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pharmacy_supplier_returns_pharmacy_id ON pharmacy_supplier_returns(pharmacy_id)`);

  await client.query('COMMIT');
  console.log('✅ pharmacy-erp-features migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ pharmacy-erp-features migration failed:', err.message);
  throw err;
} finally {
  client.release();
}
