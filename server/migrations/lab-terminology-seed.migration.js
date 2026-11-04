/**
 * Migration: Seed HyperGrid (hg_code_map) with lab terminology from lab_parameter_catalog
 * =======================================================================================
 * Makes HyperGrid the RUNTIME terminology authority for labs (per CTO review), seeded from the
 * human-editable `lab_parameter_catalog`. Each catalog alias + canonical name becomes an
 * hg_code_map row (local_system='lab-name', canonical_system='LOINC', loinc_code from the catalog).
 *
 * Platform-wide rows use tenant_id = NULL. The table's UNIQUE(tenant_id, local_code, local_system)
 * does NOT dedupe NULL tenant_id (SQL NULLs are distinct), so inserts are guarded with NOT EXISTS.
 *
 * Idempotent. `--dry-run` runs in a txn and ROLLs BACK; `--down` removes the seeded lab rows.
 */

import pool from '../db/pgPool.js';

export async function up(options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Expand catalog (canonical_name + each alias) into normalized local_code → LOINC rows.
    const inserted = await client.query(`
      WITH names AS (
        SELECT lower(trim(canonical_name)) AS local_code, canonical_name AS display, NULLIF(loinc_code,'') AS loinc
          FROM lab_parameter_catalog
        UNION
        SELECT lower(trim(alias)) AS local_code, canonical_name AS display, NULLIF(loinc_code,'') AS loinc
          FROM lab_parameter_catalog, unnest(aliases) AS alias
      )
      INSERT INTO hg_code_map (tenant_id, local_code, local_system, canonical_code, canonical_system, display, loinc_code, active)
      SELECT NULL, n.local_code, 'lab-name', n.loinc, 'LOINC', n.display, n.loinc, true
        FROM names n
       WHERE n.local_code <> ''
         AND NOT EXISTS (
           SELECT 1 FROM hg_code_map m
            WHERE m.tenant_id IS NULL AND m.local_system = 'lab-name' AND m.local_code = n.local_code
         )
      RETURNING id
    `);
    console.log(`✅ hg_code_map: ${inserted.rowCount} lab terminology rows inserted`);

    const { rows } = await client.query(`SELECT count(*) AS n FROM hg_code_map WHERE local_system='lab-name'`);
    console.log(`   hg_code_map lab-name rows total: ${rows[0].n}`);

    if (dryRun) { await client.query('ROLLBACK'); console.log('\n🧪 DRY RUN — rolled back.'); }
    else { await client.query('COMMIT'); console.log('\n✅ Lab terminology seed committed.'); }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lab terminology seed failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM hg_code_map WHERE local_system='lab-name' AND tenant_id IS NULL`);
    await client.query('COMMIT');
    console.log('✅ Lab terminology seed removed.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv.some((a) => a && a.includes('lab-terminology-seed'))) {
  const flags = process.argv.slice(2);
  const run = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  run.then(() => process.exit(0)).catch(() => process.exit(1));
}
