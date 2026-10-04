// READ-ONLY. Machine-readable PACS ingest health for the monitor shell script.
// Prints KEY=value lines on stdout; exits 0 even when unhealthy (the caller decides severity).
// Run: node scripts/ssm-env-loader.mjs scripts/ops/pacs-ingest-freshness.mjs
import pool from '../../db/pgPool.js';

const p = pool.pool || pool.default || pool;
const out = (k, v) => console.log(`${k}=${v}`);

try {
  const r = (await p.query(`
    SELECT max(created_at) AS newest,
           count(*)::int   AS total,
           count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last_24h,
           count(*) FILTER (WHERE created_at > now() - interval '7 days')::int   AS last_7d
      FROM hg_dicom_instances`)).rows[0];

  out('INSTANCES_TOTAL', r.total);
  out('INSTANCES_24H', r.last_24h);
  out('INSTANCES_7D', r.last_7d);
  out('NEWEST_INSTANCE_AT', r.newest ? new Date(r.newest).toISOString() : 'none');
  out('HOURS_SINCE_LAST_INSTANCE', r.newest
    ? Math.round((Date.now() - new Date(r.newest).getTime()) / 36e5)
    : -1);

  // A recent instance id the monitor can try to actually READ back from Orthanc. This is what
  // catches the 2026-09 failure mode: the index knows about instances whose pixel data was
  // archived to MinIO and deleted from S3, so Orthanc answers "object not found".
  const probe = (await p.query(`
    SELECT regexp_replace(file_path, '^orthanc://', '') AS orthanc_id
      FROM hg_dicom_instances
     WHERE file_path LIKE 'orthanc://%'
     ORDER BY created_at DESC LIMIT 1`)).rows[0];
  out('READ_PROBE_INSTANCE', probe?.orthanc_id || 'none');

  const arch = (await p.query(`
    SELECT max(archived_at) AS last_run,
           count(*)::int AS objects,
           count(*) FILTER (WHERE deleted_from_source)::int AS source_deleted
      FROM pacs_minio_archive_log`)).rows[0].last_run
    ? (await p.query(`SELECT max(archived_at) AS last_run FROM pacs_minio_archive_log`)).rows[0]
    : null;
  out('ARCHIVE_LAST_RUN_AT', arch?.last_run ? new Date(arch.last_run).toISOString() : 'never');
  out('DB_OK', 1);
} catch (err) {
  out('DB_OK', 0);
  out('DB_ERROR', String(err.message).replace(/\n/g, ' ').slice(0, 160));
}
process.exit(0);
