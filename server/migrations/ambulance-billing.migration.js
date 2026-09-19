/**
 * Migration: Ambulance Trip Billing — additive columns on ambulance_trip
 * =========================================================================
 * Adds fare/payment tracking so the Billing tab in AmbulanceDashboard.tsx
 * can show real invoices instead of mock data. Purely additive (ADD COLUMN
 * IF NOT EXISTS) — does not touch any existing column or query.
 *
 * Safe to run multiple times.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE ambulance_trip
        ADD COLUMN IF NOT EXISTS fare_amount NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (payment_status IN ('pending', 'paid', 'overdue', 'waived')),
        ADD COLUMN IF NOT EXISTS patient_name TEXT,
        ADD COLUMN IF NOT EXISTS patient_phone TEXT,
        ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IN ('Critical', 'High', 'Medium', 'Low'))
    `);
    await client.query('COMMIT');
    console.log('✅ ambulance_trip: billing + urgency/patient-name columns added');
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
    await client.query(`ALTER TABLE ambulance_trip DROP COLUMN IF EXISTS fare_amount, DROP COLUMN IF EXISTS payment_status, DROP COLUMN IF EXISTS patient_name, DROP COLUMN IF EXISTS patient_phone, DROP COLUMN IF EXISTS urgency`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('ambulance-billing')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
