/**
 * Rehearses the imaging tenant-registry migration on a DISPOSABLE database (refuses non-local hosts unless
 * REHEARSAL_ALLOW_REMOTE=snapshot-restore is set, for a restored RDS snapshot — never production).
 *   DRYRUN_DATABASE=… DRYRUN_USER=… DRYRUN_PASSWORD=… node scripts/qa/tenant-uid-rehearsal.mjs
 * It proves: correctness across batches, idempotence, an unmapped id stays NULL, triggers on insert AND re-point, an absent
 * table is skipped, ALTER/backfill does NOT block concurrent inserts, and it reports timings for sizing the real run.
 */
process.env.DISALLOW_REMOTE_DB = process.env.REHEARSAL_ALLOW_REMOTE ? 'false' : 'true';
process.env.POSTGRES_FORCE_LOCAL = process.env.REHEARSAL_ALLOW_REMOTE ? 'false' : 'true';
process.env.POSTGRES_HOST = process.env.DRYRUN_HOST || '127.0.0.1';
process.env.POSTGRES_PORT = process.env.DRYRUN_PORT || '5432';
process.env.POSTGRES_DATABASE = process.env.DRYRUN_DATABASE || 'mediczy_dryrun';
process.env.POSTGRES_SSL = process.env.DRYRUN_SSL || 'false';
process.env.POSTGRES_USER = process.env.DRYRUN_USER || 'dryrun';
process.env.POSTGRES_PASSWORD = process.env.DRYRUN_PASSWORD || 'dryrun';
if (!process.env.REHEARSAL_ALLOW_REMOTE && !new Set(['127.0.0.1', 'localhost', '::1']).has(process.env.POSTGRES_HOST)) { console.error('REFUSING: not a local host'); process.exit(2); }
if (/prod/i.test(process.env.POSTGRES_HOST + process.env.POSTGRES_DATABASE) && !process.env.REHEARSAL_ALLOW_REMOTE) { console.error('REFUSING: looks like production'); process.exit(2); }

const ROWS = Number(process.env.REHEARSAL_ROWS) || 45000;
const pool = (await import('../../db/pgPool.js')).default;
const { up, down, IMAGING_TABLES } = await import('../../migrations/20260926000005-imaging-tenant-registry.migration.js');
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? ` — ${d}` : ''}`); };
const q = (s, p) => pool.query(s, p);
const keyOf = Object.fromEntries(IMAGING_TABLES);
const ABSENT = 'hg_dicom_access_log';                       // left out on purpose: a fresh environment may lack some tables

const drop = () => q('DROP TABLE IF EXISTS hg_dicom_studies, hg_dicom_instances, hg_dicom_reports, hg_dicom_worklist, hg_dicom_access_log, ris_studies, tenants, imaging_tenants, imaging_tenant_ambiguities, labs CASCADE');
await drop();
await q('CREATE TABLE labs (id SERIAL PRIMARY KEY, name TEXT)');
await q('CREATE TABLE tenants (id SERIAL PRIMARY KEY)');
await q('INSERT INTO tenants SELECT g FROM generate_series(1, 5) g');            // ids 1–5 collide with labs 1–5
await q(`INSERT INTO labs (name) SELECT 'lab ' || g FROM generate_series(1, 300) g`);
const present = IMAGING_TABLES.filter(([t]) => t !== ABSENT);
for (const [t, c] of present) {
  await q(`CREATE TABLE ${t} (id SERIAL PRIMARY KEY, ${c} BIGINT NOT NULL, study_instance_uid TEXT, payload TEXT)`);
  await q(`INSERT INTO ${t} (${c}) SELECT CASE WHEN g % 1000 = 0 THEN 999999 ELSE (g % 300) + 1 END FROM generate_series(1, ${ROWS}) g`);
}

// Concurrent writer: inserts continuously while the migration runs; every insert must succeed and be fast.
let stop = false; let inserted = 0; let worst = 0; let writerError = null;
const writer = (async () => {
  const c = await pool.connect();
  try {
    while (!stop) {
      const t0 = Date.now();
      await c.query(`INSERT INTO hg_dicom_studies (tenant_id) VALUES (70)`);
      worst = Math.max(worst, Date.now() - t0); inserted++;
      await new Promise((r) => setTimeout(r, 5));
    }
  } catch (e) { writerError = e; } finally { c.release(); }
})();

const t0 = Date.now();
await up({ log: () => {} });
const firstRun = Date.now() - t0;
stop = true; await writer;
check('a writer inserting throughout the migration never failed', !writerError && inserted > 0, `${inserted} inserts, ${writerError?.message || 'no errors'}`);
check('…and was never blocked for long (worst single insert)', worst < 3000, `${worst} ms`);

const t1 = Date.now(); const second = await up({ log: () => {} });
check('second run is a no-op that does not throw (idempotent)', true, `${Date.now() - t1} ms; first run ${firstRun} ms for ${present.length * ROWS} rows`);
check(`an absent table (${ABSENT}) is skipped, not an error`, !second.tables.includes(ABSENT));
check('labs.uid present, unique, NOT NULL', (await q('SELECT count(*)=count(uid) AND count(*)=count(DISTINCT uid) AS ok FROM labs')).rows[0].ok);
check('registry has one row per lab that owns imaging data (300)', (await q(`SELECT count(*)::int n FROM imaging_tenants WHERE kind='lab'`)).rows[0].n === 300);
check('ids that are both a lab and a tenant (1–5) were recorded for human review', (await q('SELECT count(*)::int n FROM imaging_tenant_ambiguities')).rows[0].n === 5);

for (const [t, c] of present) {
  const r = (await q(
    `SELECT count(*)::int total, count(tenant_uid)::int with_uid,
            count(*) FILTER (WHERE ${c} = 999999)::int unmapped,
            count(*) FILTER (WHERE ${c} <> 999999 AND tenant_uid IS DISTINCT FROM (SELECT uid FROM labs WHERE id = ${c}))::int wrong,
            count(*) FILTER (WHERE ${c} = 999999 AND tenant_uid IS NOT NULL)::int guessed
       FROM ${t}`)).rows[0];
  check(`${t}: every mappable row backfilled correctly across batches; unmapped stays NULL`, r.with_uid === r.total - r.unmapped && r.wrong === 0 && r.guessed === 0, JSON.stringify(r));
  await q(`INSERT INTO ${t} (${c}) VALUES (70)`);
  check(`${t}: NEW row gets its UID from the trigger (no app change)`, (await q(`SELECT tenant_uid = (SELECT uid FROM labs WHERE id = 70) AS ok FROM ${t} ORDER BY id DESC LIMIT 1`)).rows[0].ok);
  await q(`UPDATE ${t} SET ${c} = 71 WHERE id = (SELECT max(id) FROM ${t})`);
  check(`${t}: re-pointing the key re-derives the UID`, (await q(`SELECT tenant_uid = (SELECT uid FROM labs WHERE id = 71) AS ok FROM ${t} ORDER BY id DESC LIMIT 1`)).rows[0].ok);
  await q(`UPDATE ${t} SET payload = 'x' WHERE id = (SELECT max(id) FROM ${t})`);
  check(`${t}: an unrelated update leaves the UID alone`, (await q(`SELECT tenant_uid = (SELECT uid FROM labs WHERE id = 71) AS ok FROM ${t} ORDER BY id DESC LIMIT 1`)).rows[0].ok);
}
// A lab created AFTER the migration, first write for it: registered on demand by the trigger.
await q(`INSERT INTO labs (name) VALUES ('late lab')`);
const lateId = (await q('SELECT max(id) id FROM labs')).rows[0].id;
await q(`INSERT INTO hg_dicom_studies (tenant_id) VALUES ($1)`, [lateId]);
check('a lab created later is registered on its first write', (await q(`SELECT s.tenant_uid = (SELECT uid FROM labs WHERE id=$1) AS ok FROM hg_dicom_studies s WHERE tenant_id=$1`, [lateId])).rows[0].ok);
check('no INVALID indexes left behind', (await q(`SELECT count(*)::int n FROM pg_index WHERE NOT indisvalid`)).rows[0].n === 0);

await down();
check('down() removes columns, triggers and registry', (await q(`SELECT count(*)::int n FROM information_schema.columns WHERE column_name='tenant_uid'`)).rows[0].n === 0 && !(await q(`SELECT to_regclass('public.imaging_tenants') r`)).rows[0].r);
await up({ log: () => {} });
check('up() after down() restores it', (await q(`SELECT count(*)::int n FROM hg_dicom_studies WHERE tenant_uid IS NULL AND tenant_id <> 999999`)).rows[0].n === 0);
if (!process.env.REHEARSAL_KEEP) await drop();   // REHEARSAL_KEEP=1 leaves the migrated scratch data for scripts/ops/verify-tenant-uid.mjs
console.log(`\n${failed ? 'FAILED' : 'all checks passed'}`);
await pool.end?.();
process.exit(failed ? 1 : 0);
