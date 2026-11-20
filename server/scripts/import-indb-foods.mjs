/**
 * Load the Indian Nutrient Databank (INDB, 2024) recipes into food_items for /api/diet/foods/search.
 *
 * Source: github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- (INDB.xlsx, sheet "Nutrient Data",
 * 1,014 recipes; per-100 g and per-serving values). Paper: Curr Dev Nutr 2024;8(7):103790 (CC BY 4.0
 * article; the data files carry no separate licence; values largely from ICMR-NIN IFCT 2017).
 * Load only with the owner's approval of the data's use.
 *
 * Dry run unless --apply:
 *   node scripts/ssm-env-loader.mjs scripts/import-indb-foods.mjs /path/to/INDB.xlsx [--apply]
 */
import { createRequire } from 'node:module';
import pool from '../db/pgPool.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

export const SOURCE = 'INDB-2024';
export const ATTRIBUTION = 'Indian Nutrient Databank (INDB), Curr Dev Nutr 2024;8(7):103790; values largely from ICMR-NIN Indian Food Composition Tables 2017. Portion values are approximate.';

const value = (cell) => (cell && typeof cell === 'object' && 'result' in cell ? cell.result : cell);
const n = (v, digits = 2) => {
  const x = Number(value(v));
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 10 ** digits) / 10 ** digits : null;
};

/** Parse INDB.xlsx into food_items rows (pure apart from reading the file). */
export async function readIndb(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('Nutrient Data');
  if (!ws) throw new Error('INDB.xlsx has no "Nutrient Data" sheet');
  const head = ws.getRow(1).values.map((h) => String(value(h) ?? '').trim());
  const col = (name) => { const i = head.indexOf(name); if (i < 1) throw new Error(`INDB column missing: ${name}`); return i; };
  const C = Object.fromEntries(['food_code', 'food_name', 'servings_unit', 'energy_kcal', 'carb_g', 'protein_g', 'fat_g',
    'unit_serving_energy_kcal', 'unit_serving_carb_g', 'unit_serving_protein_g', 'unit_serving_fat_g', 'unit_serving_fibre_g',
    'unit_serving_freesugar_g', 'unit_serving_sodium_mg'].map((k) => [k, col(k)]));
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r).values;
    const code = String(value(row[C.food_code]) ?? '').trim();
    const name = String(value(row[C.food_name]) ?? '').trim();
    if (!code || !name) continue;
    rows.push({
      source_code: code, name: name.slice(0, 200), serving_unit: String(value(row[C.servings_unit]) ?? '').trim() || null,
      serving_kcal: n(row[C.unit_serving_energy_kcal]), serving_carb_g: n(row[C.unit_serving_carb_g]), serving_protein_g: n(row[C.unit_serving_protein_g]),
      serving_fat_g: n(row[C.unit_serving_fat_g]), serving_fibre_g: n(row[C.unit_serving_fibre_g]), serving_sugar_g: n(row[C.unit_serving_freesugar_g]),
      serving_sodium_mg: n(row[C.unit_serving_sodium_mg]),
      per100_kcal: n(row[C.energy_kcal]), per100_carb_g: n(row[C.carb_g]), per100_protein_g: n(row[C.protein_g]), per100_fat_g: n(row[C.fat_g]),
    });
  }
  return rows;
}

// Run directly or through scripts/ssm-env-loader.mjs (which shifts the script to argv[2]).
const selfIndex = process.argv.findIndex((a) => a.endsWith('import-indb-foods.mjs'));
if (selfIndex > 0) {
  const path = process.argv.slice(selfIndex + 1).find((a) => !a.startsWith('--'));
  const APPLY = process.argv.includes('--apply');
  if (!path) { console.error('usage: import-indb-foods.mjs /path/to/INDB.xlsx [--apply]'); process.exit(1); }
  const rows = await readIndb(path);
  const usable = rows.filter((r) => r.serving_kcal !== null && r.per100_kcal !== null);
  console.log(`INDB rows: ${rows.length}; with serving + per-100 g energy: ${usable.length}`);
  console.log('samples:', usable.slice(0, 3).map((r) => `${r.source_code} ${r.name} — ${r.serving_kcal} kcal per ${r.serving_unit}`));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const r of usable) {
      await client.query(
        `INSERT INTO food_items (source, source_code, name, serving_unit, serving_kcal, serving_carb_g, serving_protein_g, serving_fat_g, serving_fibre_g,
           serving_sugar_g, serving_sodium_mg, per100_kcal, per100_carb_g, per100_protein_g, per100_fat_g, attribution)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (source, source_code) DO UPDATE SET name = EXCLUDED.name, serving_unit = EXCLUDED.serving_unit,
           serving_kcal = EXCLUDED.serving_kcal, serving_carb_g = EXCLUDED.serving_carb_g, serving_protein_g = EXCLUDED.serving_protein_g,
           serving_fat_g = EXCLUDED.serving_fat_g, serving_fibre_g = EXCLUDED.serving_fibre_g, serving_sugar_g = EXCLUDED.serving_sugar_g,
           serving_sodium_mg = EXCLUDED.serving_sodium_mg, per100_kcal = EXCLUDED.per100_kcal, per100_carb_g = EXCLUDED.per100_carb_g,
           per100_protein_g = EXCLUDED.per100_protein_g, per100_fat_g = EXCLUDED.per100_fat_g, attribution = EXCLUDED.attribution, updated_at = now()`,
        [SOURCE, r.source_code, r.name, r.serving_unit, r.serving_kcal, r.serving_carb_g, r.serving_protein_g, r.serving_fat_g, r.serving_fibre_g,
          r.serving_sugar_g, r.serving_sodium_mg, r.per100_kcal, r.per100_carb_g, r.per100_protein_g, r.per100_fat_g, ATTRIBUTION]);
      n += 1;
    }
    const { rows: [c] } = await client.query(`SELECT count(*)::int n FROM food_items WHERE source = $1`, [SOURCE]);
    await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
    console.log(`${APPLY ? 'APPLIED' : 'DRY RUN — rolled back'}: ${n} upserted; ${c.n} INDB foods ${APPLY ? 'in' : 'would be in'} the catalogue`);
  } catch (e) { await client.query('ROLLBACK'); console.error('FAILED, rolled back:', e.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
