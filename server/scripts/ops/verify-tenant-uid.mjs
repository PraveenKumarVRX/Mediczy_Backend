#!/usr/bin/env node
/**
 * Read-only verifier for the tenant-UID expand phase (migrations/20260926000004-tenant-uid-expand.migration.js).
 * Reports, per imaging table: rows, rows with tenant_uid, rows whose tenant_id is not a lab ("unmapped"), and rows whose
 * tenant_uid disagrees with labs.uid ("mismatched"). Exit 0 only when nothing is unmapped or mismatched — the gate for the
 * contract phase.
 *
 *   NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod node scripts/ssm-env-loader.mjs scripts/ops/verify-tenant-uid.mjs
 */
import pool from '../../db/pgPool.js';
import { IMAGING_TABLES } from '../../migrations/20260926000004-tenant-uid-expand.migration.js';

let bad = 0;
const has = (await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='labs' AND column_name='uid'`)).rowCount;
if (!has) { console.log('FAIL  labs.uid does not exist — expand migration not applied'); process.exit(1); }
const labs = (await pool.query('SELECT count(*)::int n, count(uid)::int with_uid FROM labs')).rows[0];
console.log(`labs: ${labs.n} rows, ${labs.with_uid} with uid`);
if (labs.n !== labs.with_uid) bad++;

for (const table of IMAGING_TABLES) {
  const col = (await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='tenant_uid'`, [table])).rowCount;
  if (!col) { console.log(`SKIP  ${table} (no tenant_uid column)`); continue; }
  const { rows: [r] } = await pool.query(
    `SELECT count(*)::int AS total,
            count(t.tenant_uid)::int AS with_uid,
            count(*) FILTER (WHERE l.id IS NULL)::int AS unmapped,
            count(*) FILTER (WHERE l.id IS NOT NULL AND t.tenant_uid IS DISTINCT FROM l.uid)::int AS mismatched
       FROM ${table} t LEFT JOIN labs l ON l.id = t.tenant_id`);
  const ok = r.unmapped === 0 && r.mismatched === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${table}: ${r.total} rows, ${r.with_uid} with tenant_uid, ${r.unmapped} unmapped, ${r.mismatched} mismatched`);
}
await pool.end?.();
process.exit(bad ? 1 : 0);
