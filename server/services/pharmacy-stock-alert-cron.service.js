/**
 * Pharmacy Low-Stock / Near-Expiry Alert Cron
 *
 * Daily scan of every pharmacy's real stock/batches against that pharmacy's own
 * thresholds (pharmacies.metadata.lowStockThreshold / expiryAlertDays, settable via
 * the existing PUT /api/pharmacy/profile endpoint). Auto-creates rows in the
 * existing pharmacy_stock_alerts table — the table/route already supported manual
 * alert creation; this is what makes it automatic.
 */

import cron from 'node-cron';
import sharedPool from '../db/pgPool.js';
import { withCron } from '../utils/cronRegistry.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 50;
const DEFAULT_EXPIRY_ALERT_DAYS = 30;

async function scanPharmacy(pharmacy) {
  const metadata = pharmacy.metadata || {};
  const lowStockThreshold = Number(metadata.lowStockThreshold) || DEFAULT_LOW_STOCK_THRESHOLD;
  const expiryAlertDays = Number(metadata.expiryAlertDays) || DEFAULT_EXPIRY_ALERT_DAYS;
  let created = 0;

  // Low stock: quantity at/below this pharmacy's own threshold, skip medicines that
  // already have an open (pending) alert to avoid duplicate noise.
  const lowStock = await sharedPool.query(
    `SELECT ps.medicine_id, pm.name, ps.quantity
     FROM pharmacy_stock ps
     JOIN pharmacy_medicines pm ON pm.id = ps.medicine_id
     WHERE ps.pharmacy_id = $1 AND ps.quantity <= $2
       AND NOT EXISTS (
         SELECT 1 FROM pharmacy_stock_alerts a
         WHERE a.pharmacy_id = ps.pharmacy_id AND a.medicine_id = ps.medicine_id AND a.status = 'pending'
       )`,
    [pharmacy.id, lowStockThreshold]
  );
  for (const row of lowStock.rows) {
    await sharedPool.query(
      `INSERT INTO pharmacy_stock_alerts (pharmacy_id, medicine_id, quantity, priority, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'normal', 'pending', $4, NOW(), NOW())`,
      [pharmacy.id, row.medicine_id, row.quantity, `Auto-generated: stock at ${row.quantity}, below threshold of ${lowStockThreshold}`]
    );
    created++;
  }

  // Near-expiry: batches expiring within this pharmacy's own alert window.
  const expiring = await sharedPool.query(
    `SELECT b.medicine_id, pm.name, b.quantity, b.expiry_date
     FROM pharmacy_batches b
     JOIN pharmacy_medicines pm ON pm.id = b.medicine_id
     WHERE b.pharmacy_id = $1 AND b.quantity > 0
       AND b.expiry_date IS NOT NULL
       AND b.expiry_date <= (CURRENT_DATE + $2 * INTERVAL '1 day')
       AND NOT EXISTS (
         SELECT 1 FROM pharmacy_stock_alerts a
         WHERE a.pharmacy_id = b.pharmacy_id AND a.medicine_id = b.medicine_id AND a.status = 'pending'
           AND a.notes ILIKE 'Auto-generated: expiring%'
       )`,
    [pharmacy.id, expiryAlertDays]
  );
  for (const row of expiring.rows) {
    await sharedPool.query(
      `INSERT INTO pharmacy_stock_alerts (pharmacy_id, medicine_id, quantity, priority, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'high', 'pending', $4, NOW(), NOW())`,
      [pharmacy.id, row.medicine_id, row.quantity, `Auto-generated: expiring ${row.expiry_date?.toISOString?.().slice(0, 10) || row.expiry_date}`]
    );
    created++;
  }

  return created;
}

export async function runStockAlertScan() {
  const pharmacies = await sharedPool.query(`SELECT id, metadata FROM pharmacies WHERE status = 'active'`);
  let totalCreated = 0;
  for (const pharmacy of pharmacies.rows) {
    totalCreated += await scanPharmacy(pharmacy);
  }
  return { pharmaciesScanned: pharmacies.rows.length, alertsCreated: totalCreated };
}

class PharmacyStockAlertCronService {
  constructor() {
    this.isRunning = false;
    this._job = null;
  }

  start() {
    if (this.isRunning) return;
    // Daily at 5 AM — after the 12:15 AM price sync has settled, before pharmacy opening hours.
    this._job = cron.schedule('0 5 * * *', async () => {
      try {
        const result = await withCron('pharmacy_stock_alerts', runStockAlertScan);
        if (!result?.skipped) {
          console.log(`💊 [pharmacy-stock-alerts] Scanned ${result.pharmaciesScanned} pharmacies, created ${result.alertsCreated} alerts`);
        }
      } catch (err) {
        console.error('💊 [pharmacy-stock-alerts] Error:', err.message);
      }
    });
    this.isRunning = true;
    console.log('💊 Pharmacy stock alert scan started (runs daily at 5:00 AM)');
  }

  stop() {
    if (this._job) {
      this._job.destroy();
      this._job = null;
    }
    this.isRunning = false;
  }
}

export default new PharmacyStockAlertCronService();
