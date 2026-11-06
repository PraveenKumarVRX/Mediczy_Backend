/**
 * One-off: correct the misspelled lab name "Agilus Dignostics" -> "Agilus Diagnostics".
 * Pure data-quality fix (42 rows). Reversible by inverting the strings.
 *
 * Run:  node server/scripts/ssm-env-loader.mjs server/scripts/fix-agilus-name.mjs
 */
import pool from '../db/pgPool.js';

const { rows: before } = await pool.query(`SELECT count(*) n FROM labs WHERE name ILIKE 'Agilus Dignostics%'`);
console.log(`labs with "Agilus Dignostics" (before): ${before[0].n}`);

const res = await pool.query(
  `UPDATE labs SET name = regexp_replace(name, 'Dignostics', 'Diagnostics', 'gi') WHERE name ILIKE '%Dignostics%'`
);
console.log(`lab names corrected: ${res.rowCount}`);

const { rows: after } = await pool.query(`SELECT count(*) n FROM labs WHERE name ILIKE '%Dignostics%'`);
console.log(`labs still misspelled (after, want 0): ${after[0].n}`);

process.exit(0);
