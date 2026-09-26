#!/usr/bin/env node
/**
 * Read-only verifier for the imaging tenant registry (migrations/20260926000005-imaging-tenant-registry.migration.js).
 * Exit 0 only when every check passes — this is the GATE for the contract phase (docs/deployment/TENANT_UID_ROLLOUT.md).
 *
 *   NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod \
 *     node scripts/ssm-env-loader.mjs scripts/ops/verify-tenant-uid.mjs
 */
import pool from '../../db/pgPool.js';
import { IMAGING_TABLES } from '../../migrations/20260926000005-imaging-tenant-registry.migration.js';

let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

const hasUid = await one(`SELECT 1 AS x FROM information_schema.columns WHERE table_name='labs' AND column_name='uid'`);
if (!hasUid || !(await one(`SELECT to_regclass('public.imaging_tenants') AS r`)).r) { console.log('FAIL  labs.uid / imaging_tenants missing — migration not applied'); process.exit(1); }

const labs = await one('SELECT count(*)::int n, count(uid)::int with_uid, count(DISTINCT uid)::int distinct_uid FROM labs');
check(labs.n === labs.with_uid && labs.n === labs.distinct_uid, `labs: ${labs.n} rows, ${labs.with_uid} with uid, ${labs.distinct_uid} distinct`);

const reg = await one(`SELECT count(*)::int n,
   count(*) FILTER (WHERE kind = 'lab' AND (source_uid IS DISTINCT FROM (SELECT uid FROM labs WHERE id = source_id) OR uid IS DISTINCT FROM source_uid))::int AS stale
   FROM imaging_tenants`);
check(reg.stale === 0, `imaging_tenants: ${reg.n} rows, ${reg.stale} disagreeing with labs.uid (a lab's registry uid must equal labs.uid)`);

for (const [table, col] of IMAGING_TABLES) {
  if (!(await one(`SELECT to_regclass($1) AS r`, [`public.${table}`])).r) { console.log(`SKIP  ${table} (absent)`); continue; }
  const hasCol = await one(`SELECT 1 AS x FROM information_schema.columns WHERE table_name=$1 AND column_name='tenant_uid'`, [table]);
  if (!hasCol) { check(false, `${table}: no tenant_uid column`); continue; }
  const r = await one(
    `SELECT count(*)::int AS total,
            count(t.tenant_uid)::int AS with_uid,
            count(*) FILTER (WHERE t.${col} IS NOT NULL AND l.id IS NULL)::int AS not_a_lab,
            count(*) FILTER (WHERE l.id IS NOT NULL AND t.tenant_uid IS NULL)::int AS missing,
            count(*) FILTER (WHERE l.id IS NOT NULL AND t.tenant_uid IS NOT NULL
                               AND t.tenant_uid IS DISTINCT FROM (SELECT it.uid FROM imaging_tenants it WHERE it.kind='lab' AND it.source_id = t.${col}))::int AS mismatched
       FROM ${table} t LEFT JOIN labs l ON l.id = t.${col}`);
  check(r.missing === 0 && r.mismatched === 0,
    `${table}: ${r.total} rows, ${r.with_uid} with tenant_uid, ${r.missing} missing, ${r.mismatched} mismatched` +
    (r.not_a_lab ? `  [info: ${r.not_a_lab} rows keyed by an id that is not a lab — left NULL, invisible to UID reads]` : ''));
  const trg = await one(`SELECT 1 AS x FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal`, [`trg_${table}_tenant_uid`]);
  check(!!trg, `${table}: trigger installed`);
}
const invalid = (await pool.query(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE NOT i.indisvalid AND c.relname LIKE '%tenant_uid%' OR (NOT i.indisvalid AND c.relname LIKE '%tuid%')`)).rows;
check(invalid.length === 0, `no INVALID indexes${invalid.length ? `: ${invalid.map((x) => x.relname).join(', ')} (re-run the migration)` : ''}`);

const amb = (await pool.query('SELECT source_id, imaging_rows, reviewed FROM imaging_tenant_ambiguities ORDER BY source_id')).rows;
console.log(`\nAmbiguities to confirm by a human (id exists as both a lab and a platform tenant): ${amb.length ? amb.map((a) => `${a.source_id} (${a.imaging_rows} rows${a.reviewed ? ', reviewed' : ''})`).join(', ') : 'none'}`);
await pool.end?.();
process.exit(bad ? 1 : 0);
