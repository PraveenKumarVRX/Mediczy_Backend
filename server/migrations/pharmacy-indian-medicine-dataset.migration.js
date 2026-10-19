/**
 * Indian Medicine Dataset Seed
 *
 * Downloads junioralive/Indian-Medicine-Dataset (~253k medicines) from GitHub
 * and bulk-upserts into pharmacy_medicines.
 *
 * Source:  https://github.com/junioralive/Indian-Medicine-Dataset
 * License: Verify before commercial use — check repo LICENSE file.
 * Data:    name, price (MRP INR), manufacturer, pack_size, composition, discontinued
 *
 * Strategy:
 *   - INSERT new medicines (not already in DB by name match) with dataset_source='indian_medicine_dataset'
 *   - UPDATE mrp/selling_price only where current price_source is NULL or 'cims'
 *     (NPPA/Jan Aushadhi government data takes priority)
 *   - Skip discontinued medicines (flag them is_discontinued=true instead of deleting)
 *
 * Run once (or re-run to catch new dataset releases):
 *   node --env-file=server/.env server/migrations/pharmacy-indian-medicine-dataset.migration.js
 */

import axios from 'axios';
import { parse as csvParse } from 'csv-parse/sync';
import pool from '../db/pgPool.js';

// Correct URLs confirmed from GitHub API (repo: junioralive/Indian-Medicine-Dataset)
// updated_indian_medicine_data.csv is the larger/more complete file (~45 MB)
const DATASET_URL = process.env.INDIAN_MEDICINE_DATASET_URL ||
  'https://raw.githubusercontent.com/junioralive/Indian-Medicine-Dataset/main/DATA/updated_indian_medicine_data.csv';

const FALLBACK_URLS = [
  'https://raw.githubusercontent.com/junioralive/Indian-Medicine-Dataset/main/DATA/indian_medicine_data.csv',
];

const BATCH_SIZE = 500; // rows per DB transaction

// ── Column extractor ──────────────────────────────────────────────────────────
// Columns confirmed from updated_indian_medicine_data.csv:
//   id, name, price, Is_discontinued, manufacturer_name, type,
//   pack_size_label, short_composition1, short_composition2,
//   salt_composition, medicine_desc, side_effects, drug_interactions
function extractRow(row) {
  const name         = (row['name'] || '').trim();
  const price        = parseFloat(row['price'] || '0');
  const manufacturer = (row['manufacturer_name'] || '').trim();
  const packSize     = (row['pack_size_label'] || '').trim();
  // Prefer full salt_composition; fall back to short_composition1
  const composition  = (row['salt_composition'] || row['short_composition1'] || '').trim();
  const category     = (row['type'] || '').trim();         // 'allopathy' | 'ayurvedic' | etc.
  const indication   = (row['medicine_desc'] || '').slice(0, 500);
  const sideEffects  = (row['side_effects'] || '').slice(0, 300);
  const discontinued = (row['Is_discontinued'] || '').toUpperCase() === 'TRUE';

  return { name, price, manufacturer, packSize, composition, category, indication, sideEffects, discontinued };
}

// ── Download with fallback ────────────────────────────────────────────────────
async function downloadDataset() {
  const urls = [DATASET_URL, ...FALLBACK_URLS];
  let lastErr;
  for (const url of urls) {
    try {
      console.log(`⬇️  Trying: ${url}`);
      const res = await axios.get(url, {
        responseType: 'text',
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Mediczy-DrugDataBot/1.0)' },
      });
      if (res.data && res.data.length > 1000) {
        console.log(`✅ Downloaded ${(res.data.length / 1024 / 1024).toFixed(1)} MB from ${url}`);
        return res.data;
      }
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️  ${url} — ${err.message}`);
    }
  }
  throw new Error(`All dataset URLs failed. Last error: ${lastErr?.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const csvText = await downloadDataset();

let rows;
try {
  rows = csvParse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
} catch (err) {
  throw new Error(`CSV parse failed: ${err.message}`);
}

console.log(`📦 Parsed ${rows.length.toLocaleString()} rows from dataset`);

let inserted = 0;
let priceUpdated = 0;
let skipped = 0;

// Process in batches
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const rawRow of batch) {
      const { name, price, manufacturer, packSize, composition, category, indication, sideEffects, discontinued } = extractRow(rawRow);

      if (!name || name.length < 2) { skipped++; continue; }

      // 1. Insert new medicine if it doesn't exist
      // Use separate JS variables for each price column to avoid pg prepared-statement
      // type-inference errors when the same param appears in COALESCE vs nullable positions.
      const mrpVal         = price > 0 ? price : null;   // mrp          — nullable
      const unitPriceVal   = price > 0 ? price : 0;      // unit_price   — NOT NULL
      const sellingPriceVal = price > 0 ? price : null;  // selling_price — nullable

      // Truncate name to 255 chars to respect VARCHAR(255) and UNIQUE constraint
      const safeName = name.slice(0, 255);
      const insertResult = await client.query(
        `INSERT INTO pharmacy_medicines
           (name, brand_name, generic_name, composition, manufacturer, pack_size,
            category, mrp, unit_price, selling_price, price_source, dataset_source,
            indication, side_effects, in_stock, is_discontinued, created_at, updated_at)
         VALUES ($1, $1, $2, $3, $4, $5, $6,
                 $7, $8, $9,
                 'indian_medicine_dataset', 'indian_medicine_dataset',
                 $10, $11, TRUE, $12, NOW(), NOW())
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [
          safeName,           // $1  name / brand_name
          composition || null,// $2  generic_name
          composition || null,// $3  composition
          manufacturer || null,// $4
          packSize || null,   // $5
          category || null,   // $6
          mrpVal,             // $7  mrp
          unitPriceVal,       // $8  unit_price (NOT NULL)
          sellingPriceVal,    // $9  selling_price
          indication || null, // $10
          sideEffects || null,// $11
          discontinued,       // $12
        ]
      );

      if (insertResult.rowCount > 0) {
        inserted++;
        continue;
      }

      // 2. Existing record — flag discontinued and update price only if we have better data
      if (discontinued) {
        await client.query(
          `UPDATE pharmacy_medicines SET is_discontinued = TRUE, updated_at = NOW()
           WHERE name ILIKE $1 AND is_discontinued = FALSE`,
          [name]
        );
      }

      if (price > 0) {
        const updateResult = await client.query(
          `UPDATE pharmacy_medicines
             SET mrp = $1, unit_price = $1, selling_price = $1,
                 price_source = 'indian_medicine_dataset',
                 dataset_source = 'indian_medicine_dataset',
                 updated_at = NOW()
           WHERE name ILIKE $2
             AND (mrp IS NULL OR mrp = 0 OR price_source IS NULL)
           RETURNING id`,
          [price, name]
        );
        priceUpdated += updateResult.rowCount;
        if (updateResult.rowCount === 0) skipped++;
      } else {
        skipped++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
  } finally {
    client.release();
  }

  if ((i / BATCH_SIZE) % 10 === 0) {
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, rows.length).toLocaleString()} / ${rows.length.toLocaleString()} rows`);
  }
}

// Final count
const countRes = await pool.query('SELECT COUNT(*) FROM pharmacy_medicines');
console.log(`
✅ Indian Medicine Dataset seed complete
   New medicines inserted : ${inserted.toLocaleString()}
   Prices updated         : ${priceUpdated.toLocaleString()}
   Skipped (no name/price): ${skipped.toLocaleString()}
   Total in pharmacy_medicines: ${parseInt(countRes.rows[0].count).toLocaleString()}
`);
