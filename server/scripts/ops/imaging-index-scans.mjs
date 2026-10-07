#!/usr/bin/env node
/**
 * Read-only: scan counters of the imaging tenant_uid and lab_uid indexes (pg_stat_user_indexes).
 *   node scripts/ssm-env-loader.mjs scripts/ops/imaging-index-scans.mjs [--save file.json] [--compare file.json]
 * Used around the imaging contract: before the lab_uid code is deployed, record; afterwards compare. A tenant_uid index whose
 * idx_scan stops growing while the lab_uid indexes' counters grow means nothing reads the UUID twin any more.
 */
import fs from 'node:fs';
import pool from '../../db/pgPool.js';
const db = pool.pool || pool.default || pool;
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const rows = (await db.query(
  `SELECT s.relname AS tbl, s.indexrelname AS idx, s.idx_scan::bigint AS scans, now() AS at,
          (pg_get_indexdef(s.indexrelid) ~ '[(, ]tenant_uid[,) ]') AS on_uuid_twin
     FROM pg_stat_user_indexes s
    WHERE s.relname IN ('hg_dicom_studies','hg_dicom_instances','hg_dicom_worklist','hg_dicom_reports','hg_dicom_access_log','ris_studies')
      AND (pg_get_indexdef(s.indexrelid) ~ '[(, ]tenant_uid[,) ]' OR pg_get_indexdef(s.indexrelid) ~ '[(, ]lab_uid[,) ]')
    ORDER BY 1, 2`)).rows.map((r) => ({ tbl: r.tbl, idx: r.idx, scans: Number(r.scans), at: r.at, old: r.on_uuid_twin }));
// Classified by what the index is ON, not by its name: uq_hg_dicom_study_tenant_uid is on (tenant_id, study_instance_uid).
const before = arg('--compare') ? Object.fromEntries(JSON.parse(fs.readFileSync(arg('--compare'), 'utf8')).map((r) => [r.idx, r])) : null;
console.log(`database: ${(await db.query('SELECT current_database() d')).rows[0].d}   at ${new Date().toISOString()}`);
for (const r of rows) {
  const old = r.old;
  const d = before?.[r.idx] ? ` (+${r.scans - before[r.idx].scans} since ${new Date(before[r.idx].at).toISOString()})` : '';
  console.log(`${old ? 'OLD UUID' : 'lab_uid '}  ${r.tbl.padEnd(20)} ${r.idx.padEnd(42)} ${String(r.scans).padStart(10)}${d}`);
}
if (arg('--save')) { fs.writeFileSync(arg('--save'), JSON.stringify(rows)); console.log(`saved ${rows.length} counters to ${arg('--save')}`); }
process.exit(0);
