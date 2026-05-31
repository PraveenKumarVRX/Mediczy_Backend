/**
 * Drug Price Sync Service
 *
 * Sources (in priority order):
 *  1. NPPA Ceiling Prices  — Government of India, free, monthly Excel
 *  2. Jan Aushadhi CSV     — PMBI generic drug list, free, quarterly
 *  3. Built-in corrections — Curated reference data for known CIMS pricing errors
 *
 * Runs automatically via cron (daily at 2:30 AM).
 * Admin can also trigger a manual sync via POST /api/admin/drug-price-sync/run
 */

import cron from 'node-cron';
import axios from 'axios';
import XLSX from '../utils/excel-compat.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharedPool from '../db/pgPool.js';
import { tick, tickError } from '../utils/cronRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = path.join(__dirname, '../tmp/price-sync');

// ─── Built-in reference corrections ──────────────────────────────────────────
// Format: { generic_name, strength, form, pack_size, market_mrp, source }
// These override CIMS values identified as incorrect in April 2026 audit.
const BUILTIN_CORRECTIONS = [
  // Azithromycin — CIMS priced per-strip; real market is much higher per 10 tabs
  { generic_name: 'Azithromycin', strength: '250mg', form: 'Tablet', pack_size: '10 tablets', market_mrp: 85.00, source: 'builtin_correction' },
  { generic_name: 'Azithromycin', strength: '500mg', form: 'Tablet', pack_size: '10 tablets', market_mrp: 165.00, source: 'builtin_correction' },
  // Atorvastatin — CIMS high-dose prices inflated beyond real market
  { generic_name: 'Atorvastatin', strength: '20mg', form: 'Tablet', pack_size: '10 tablets', market_mrp: 155.00, source: 'builtin_correction' },
  { generic_name: 'Atorvastatin', strength: '40mg', form: 'Tablet', pack_size: '10 tablets', market_mrp: 260.00, source: 'builtin_correction' },
  { generic_name: 'Atorvastatin', strength: '80mg', form: 'Tablet', pack_size: '10 tablets', market_mrp: 490.00, source: 'builtin_correction' },
  // Rosuvastatin 40mg slightly inflated
  { generic_name: 'Rosuvastatin', strength: '40mg', form: 'Tablet', pack_size: '10 tablets', market_mrp: 410.00, source: 'builtin_correction' },
];

// ─── NPPA ceiling-price config ────────────────────────────────────────────────
// NPPA updates this Excel monthly. URL pattern changes slightly each year.
// Configure via env NPPA_EXCEL_URL to override.
const NPPA_URL = process.env.NPPA_EXCEL_URL ||
  'https://www.nppaindia.nic.in/wp-content/uploads/DPCO_Ceiling_Prices.xlsx';

// Jan Aushadhi product list CSV (PMBI quarterly)
const JAN_AUSHADHI_URL = process.env.JAN_AUSHADHI_URL ||
  'https://janaushadhi.gov.in/downloadfile/ProductList.xlsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

async function downloadFile(url, filename) {
  ensureCacheDir();
  const dest = path.join(CACHE_DIR, filename);
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Mediczy-PriceSyncBot/1.0)' },
  });
  writeFileSync(dest, res.data);
  return dest;
}

// Normalize drug name for fuzzy matching
function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── NPPA sync ────────────────────────────────────────────────────────────────
async function syncFromNPPA() {
  const log = [];
  try {
    log.push('Downloading NPPA ceiling prices...');
    const filePath = await downloadFile(NPPA_URL, 'nppa_ceiling.xlsx');
    const wb = await XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let updated = 0;
    for (const row of rows) {
      // NPPA columns vary by year — try multiple common column name patterns
      const drugName    = row['Drug Name'] || row['Medicine Name'] || row['Generic Name'] || row['DRUG NAME'] || '';
      const ceilingPrice = parseFloat(row['Ceiling Price'] || row['MRP'] || row['Price'] || 0);
      const strength    = row['Strength'] || row['STRENGTH'] || '';

      if (!drugName || !ceilingPrice || ceilingPrice <= 0) continue;

      const result = await sharedPool.query(
        `UPDATE pharmacy_medicines
         SET mrp = $1, unit_price = $1, price_source = 'nppa', updated_at = NOW()
         WHERE generic_name ILIKE $2
           AND ($3 = '' OR strength ILIKE $3)
           AND (mrp IS NULL OR mrp = 0 OR price_source IN ('cims','builtin_correction','nppa'))
         RETURNING id`,
        [ceilingPrice, `%${drugName}%`, strength]
      );
      updated += result.rowCount;
    }

    log.push(`NPPA: updated ${updated} drug records`);
    return { source: 'nppa', updated, log };
  } catch (err) {
    log.push(`NPPA fetch failed: ${err.message}`);
    return { source: 'nppa', updated: 0, log, error: err.message };
  }
}

// ─── Jan Aushadhi sync ────────────────────────────────────────────────────────
async function syncFromJanAushadhi() {
  const log = [];
  try {
    log.push('Downloading Jan Aushadhi product list...');
    const filePath = await downloadFile(JAN_AUSHADHI_URL, 'jan_aushadhi.xlsx');
    const wb = await XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let updated = 0;
    for (const row of rows) {
      const name  = row['Product Name'] || row['Medicine Name'] || row['Drug Name'] || '';
      const price = parseFloat(row['MRP'] || row['Price'] || row['Rate'] || 0);
      if (!name || !price || price <= 0) continue;

      const result = await sharedPool.query(
        `UPDATE pharmacy_medicines
         SET mrp = $1, unit_price = $1, price_source = 'jan_aushadhi', updated_at = NOW()
         WHERE (generic_name ILIKE $2 OR name ILIKE $2 OR brand_name ILIKE $2)
           AND (mrp IS NULL OR mrp = 0 OR price_source IN ('cims'))
         RETURNING id`,
        [price, `%${name}%`]
      );
      updated += result.rowCount;
    }

    log.push(`Jan Aushadhi: updated ${updated} drug records`);
    return { source: 'jan_aushadhi', updated, log };
  } catch (err) {
    log.push(`Jan Aushadhi fetch failed: ${err.message}`);
    return { source: 'jan_aushadhi', updated: 0, log, error: err.message };
  }
}

// ─── Built-in corrections sync ────────────────────────────────────────────────
async function applyBuiltinCorrections() {
  const log = [];
  let updated = 0;

  for (const c of BUILTIN_CORRECTIONS) {
    try {
      const result = await sharedPool.query(
        `UPDATE pharmacy_medicines
         SET mrp = $1, unit_price = $1, price_source = 'builtin_correction', updated_at = NOW()
         WHERE generic_name ILIKE $2
           AND strength ILIKE $3
           AND form ILIKE $4
           AND pack_size ILIKE $5
         RETURNING id`,
        [c.market_mrp, c.generic_name, c.strength, c.form, c.pack_size]
      );
      updated += result.rowCount;
      log.push(`  ${c.generic_name} ${c.strength}: corrected ${result.rowCount} records → ₹${c.market_mrp}`);
    } catch (err) {
      log.push(`  ${c.generic_name} ${c.strength}: ERROR — ${err.message}`);
    }
  }

  log.unshift(`Built-in corrections: updated ${updated} drug records`);
  return { source: 'builtin_correction', updated, log };
}

// ─── Sync from uploaded file (for admin manual upload) ────────────────────────
export async function syncFromUploadedFile(buffer, originalName) {
  const log = [];
  let updated = 0;

  try {
    const wb = await XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    log.push(`Loaded ${rows.length} rows from "${originalName}"`);
    log.push(`Columns: ${Object.keys(rows[0] || {}).join(', ')}`);

    for (const row of rows) {
      // Accept flexible column names
      const genericName = row['generic_name'] || row['Generic Name'] || row['Drug Name'] || row['drug_name'] || '';
      const brandName   = row['brand_name']   || row['Brand Name']   || row['name']       || '';
      const strength    = row['strength']      || row['Strength']     || '';
      const mrp         = parseFloat(row['mrp'] || row['MRP'] || row['Price'] || row['price'] || 0);

      if (mrp <= 0) continue;

      let result;
      if (genericName) {
        result = await sharedPool.query(
          `UPDATE pharmacy_medicines
           SET mrp = $1, unit_price = $1, price_source = 'manual_upload', updated_at = NOW()
           WHERE generic_name ILIKE $2
             AND ($3 = '' OR strength ILIKE $3)
           RETURNING id`,
          [mrp, `%${genericName}%`, strength]
        );
      } else if (brandName) {
        result = await sharedPool.query(
          `UPDATE pharmacy_medicines
           SET mrp = $1, unit_price = $1, price_source = 'manual_upload', updated_at = NOW()
           WHERE name ILIKE $2 OR brand_name ILIKE $2
           RETURNING id`,
          [mrp, `%${brandName}%`]
        );
      }
      if (result) updated += result.rowCount;
    }

    log.push(`Manual upload: updated ${updated} drug records`);
    return { source: 'manual_upload', updated, log };
  } catch (err) {
    return { source: 'manual_upload', updated: 0, log, error: err.message };
  }
}

// ─── Main sync runner ─────────────────────────────────────────────────────────
let lastSyncResult = null;
let isSyncing = false;

export async function runFullSync({ sources = ['builtin', 'nppa', 'janaushadhi'] } = {}) {
  if (isSyncing) {
    return { success: false, message: 'Sync already in progress' };
  }

  isSyncing = true;
  const startedAt = new Date().toISOString();
  const results = [];

  try {
    // 1. Built-in corrections always run first (highest priority known fixes)
    if (sources.includes('builtin')) {
      results.push(await applyBuiltinCorrections());
    }

    // 2. NPPA (government ceiling prices — authoritative for scheduled drugs)
    if (sources.includes('nppa')) {
      results.push(await syncFromNPPA());
    }

    // 3. Jan Aushadhi (generic drug prices)
    if (sources.includes('janaushadhi')) {
      results.push(await syncFromJanAushadhi());
    }

    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    lastSyncResult = {
      success: true,
      startedAt,
      completedAt: new Date().toISOString(),
      totalUpdated,
      sources: results,
    };

    // Record to DB for audit trail
    await sharedPool.query(
      `INSERT INTO cron_sync_log (job_name, started_at, completed_at, records_updated, result, created_at)
       VALUES ('drug_price_sync', $1, $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [startedAt, lastSyncResult.completedAt, totalUpdated, JSON.stringify(lastSyncResult)]
    ).catch(() => {}); // Non-critical — table may not exist

    return lastSyncResult;
  } catch (err) {
    lastSyncResult = {
      success: false,
      startedAt,
      completedAt: new Date().toISOString(),
      error: err.message,
      sources: results,
    };
    return lastSyncResult;
  } finally {
    isSyncing = false;
  }
}

export function getLastSyncResult() {
  return lastSyncResult;
}

export function getSyncStatus() {
  return { isSyncing, lastSyncResult };
}

// ─── Cron service class ───────────────────────────────────────────────────────
class DrugPriceSyncService {
  constructor() {
    this.isRunning = false;
    this._job = null;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Drug price sync service already running');
      return;
    }

    // Run daily at 2:30 AM (stagger from other 2 AM crons)
    this._job = cron.schedule('30 2 * * *', async () => {
      console.log('💊 [drug-price-sync] Starting daily price sync...');
      try {
        tick('drug_price_sync');
        const result = await runFullSync();
        console.log(`💊 [drug-price-sync] Done — updated ${result.totalUpdated} records`);
        tick('drug_price_sync');
      } catch (err) {
        tickError('drug_price_sync', err);
        console.error('💊 [drug-price-sync] Error:', err.message);
      }
    });

    this.isRunning = true;
    console.log('💊 Drug price sync service started (runs daily at 2:30 AM)');

    // Run built-in corrections immediately on startup (non-blocking, low-priority)
    setTimeout(async () => {
      console.log('💊 [drug-price-sync] Applying startup price corrections...');
      try {
        const result = await applyBuiltinCorrections();
        console.log(`💊 [drug-price-sync] Startup corrections done — updated ${result.updated} records`);
      } catch (err) {
        console.warn('💊 [drug-price-sync] Startup corrections failed:', err.message);
      }
    }, 10000); // 10s delay after server start
  }

  stop() {
    if (this._job) {
      this._job.destroy();
      this._job = null;
    }
    this.isRunning = false;
    console.log('💊 Drug price sync service stopped');
  }
}

export default new DrugPriceSyncService();
