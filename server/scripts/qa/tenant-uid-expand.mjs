/**
 * Rehearses the tenant-UID expand migration on a DISPOSABLE local database (refuses any non-local host).
 *   DRYRUN_DATABASE=… DRYRUN_USER=… DRYRUN_PASSWORD=… node scripts/qa/tenant-uid-expand.mjs
 */
process.env.DISALLOW_REMOTE_DB = 'true';
process.env.POSTGRES_FORCE_LOCAL = 'true';
process.env.POSTGRES_HOST = process.env.DRYRUN_HOST || '127.0.0.1';
process.env.POSTGRES_PORT = process.env.DRYRUN_PORT || '5432';
process.env.POSTGRES_DATABASE = process.env.DRYRUN_DATABASE || 'mediczy_dryrun';
process.env.POSTGRES_SSL = 'false';
process.env.POSTGRES_USER = process.env.DRYRUN_USER || 'dryrun';
process.env.POSTGRES_PASSWORD = process.env.DRYRUN_PASSWORD || 'dryrun';
if (!new Set(['127.0.0.1', 'localhost', '::1']).has(process.env.POSTGRES_HOST)) { console.error('REFUSING: not a local host'); process.exit(2); }

const pool = (await import('../../db/pgPool.js')).default;
const { up, IMAGING_TABLES } = await import('../../migrations/20260926000004-tenant-uid-expand.migration.js');
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? ` — ${d}` : ''}`); };

await pool.query('DROP TABLE IF EXISTS hg_dicom_studies, hg_dicom_instances, hg_dicom_reports, hg_dicom_worklist, labs CASCADE');
await pool.query('CREATE TABLE labs (id SERIAL PRIMARY KEY, name TEXT)');
for (const t of IMAGING_TABLES) await pool.query(`CREATE TABLE ${t} (id SERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, payload TEXT)`);
await pool.query(`INSERT INTO labs (name) SELECT 'lab ' || g FROM generate_series(1, 300) g`);
// 45k rows over two batches' worth, one unmapped tenant (999999 is no lab), some with ids that collide with doctor/hospital ids
for (const t of IMAGING_TABLES) await pool.query(`INSERT INTO ${t} (tenant_id) SELECT CASE WHEN g % 1000 = 0 THEN 999999 ELSE (g % 300) + 1 END FROM generate_series(1, 45000) g`);

await up({ log: () => {} });
await up({ log: () => {} });                                         // idempotent: a second run changes nothing and does not throw
check('labs.uid backfilled and unique', (await pool.query('SELECT count(*)=count(uid) AND count(*)=count(DISTINCT uid) AS ok FROM labs')).rows[0].ok);

for (const t of IMAGING_TABLES) {
  const r = (await pool.query(
    `SELECT count(*)::int total, count(tenant_uid)::int with_uid,
            count(*) FILTER (WHERE tenant_id = 999999)::int unmapped,
            count(*) FILTER (WHERE tenant_id <> 999999 AND tenant_uid IS DISTINCT FROM (SELECT uid FROM labs WHERE id = tenant_id))::int wrong
       FROM ${t}`)).rows[0];
  check(`${t}: every mappable row backfilled across batches`, r.with_uid === r.total - r.unmapped && r.wrong === 0, JSON.stringify(r));
  check(`${t}: an unmapped tenant stays NULL, never guessed`, (await pool.query(`SELECT count(*)::int n FROM ${t} WHERE tenant_id = 999999 AND tenant_uid IS NOT NULL`)).rows[0].n === 0);
  await pool.query(`INSERT INTO ${t} (tenant_id) VALUES (70)`);
  const ins = (await pool.query(`SELECT tenant_uid = (SELECT uid FROM labs WHERE id = 70) AS ok FROM ${t} ORDER BY id DESC LIMIT 1`)).rows[0];
  check(`${t}: a NEW row gets tenant_uid from the trigger with no application change`, ins.ok);
  await pool.query(`UPDATE ${t} SET tenant_id = 71 WHERE id = (SELECT max(id) FROM ${t})`);
  check(`${t}: re-pointing tenant_id re-derives tenant_uid`, (await pool.query(`SELECT tenant_uid = (SELECT uid FROM labs WHERE id = 71) AS ok FROM ${t} ORDER BY id DESC LIMIT 1`)).rows[0].ok);
  await pool.query(`UPDATE ${t} SET payload = 'x' WHERE id = (SELECT max(id) FROM ${t})`);
  check(`${t}: an unrelated update leaves tenant_uid alone`, (await pool.query(`SELECT tenant_uid = (SELECT uid FROM labs WHERE id = 71) AS ok FROM ${t} ORDER BY id DESC LIMIT 1`)).rows[0].ok);
}
await pool.query('DROP TABLE IF EXISTS hg_dicom_studies, hg_dicom_instances, hg_dicom_reports, hg_dicom_worklist, labs CASCADE');
console.log(`\n${failed ? 'FAILED' : 'all checks passed'}`);
await pool.end?.();
process.exit(failed ? 1 : 0);
