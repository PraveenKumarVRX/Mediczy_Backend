/**
 * Copy imaging objects from hot S3 → archive (MinIO primary, Wasabi fallback).
 *
 * IMAGING_TENANT_ISOLATION:
 *   prefix       — shared S3 + shared archive buckets; keys under tenant-{id}/
 *   minio-bucket — shared S3; archive bucket per tenant
 *   s3-bucket    — S3 bucket + archive bucket per tenant
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import pool from '../../db/pgPool.js';
import logger from '../../config/logger.js';
import { getS3Region } from '../../utils/s3-storage.js';
import { schemaVerifier, guardedQuery } from '../../utils/schema-guard.js';
import {
  getTenantIsolationMode,
  getImagingDailyBucketForTenant,
  sharedImagingDailyBucket,
  sharedMinioImagingBucket,
  parseTenantIdFromKey,
  normalizeTenantId,
  ensureTenantImagingDailyBucket,
  describeTenantIsolation,
  ISOLATION_S3_BUCKET,
} from './imaging-tenant-storage.service.js';
import {
  getArchiveTargets,
  putArchiveObject,
  describeArchiveBackends,
  isMinioConfigured,
  isWasabiConfigured,
} from './imaging-archive-client.service.js';

const LOOKBACK_HOURS = Number(process.env.IMAGING_TRANSFER_LOOKBACK_HOURS || 36);
const DELETE_AFTER = ['1', 'true', 'yes'].includes(
  String(process.env.IMAGING_DAILY_DELETE_AFTER_TRANSFER || '').toLowerCase(),
);
const PREFIXES = String(process.env.IMAGING_TRANSFER_PREFIXES || 'dicom,imaging,ris')
  .split(',')
  .map((p) => p.trim().replace(/\/$/, ''))
  .filter(Boolean);

function awsS3() {
  return new S3Client({ region: process.env.AWS_REGION || getS3Region() || 'ap-south-1' });
}

const SCHEMA_TABLES = ['imaging_daily_transfer_log'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureTransferTable = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004600-imaging-ops-governance before using the imaging daily transfer',
});

// Queries fail closed on a missing table, and the check above also runs at
// startup so an unmigrated environment shows up in the log rather than only
// when a request arrives.
const guardedPool = guardedQuery(pool, 'Apply migration 20261015004600-imaging-ops-governance before using the imaging daily transfer');
ensureTransferTable().catch((err) => console.error('[imaging-daily-minio-transfer] schema check failed:', err.message, err.details || ''));

async function alreadyTransferred(destBucket, key) {
  const r = await guardedPool(
    `SELECT 1 FROM imaging_daily_transfer_log
     WHERE dest_bucket = $1 AND object_key = $2 AND status = 'copied' LIMIT 1`,
    [destBucket, key],
  ).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}

async function recordTransfer(row) {
  await guardedPool(
    `INSERT INTO imaging_daily_transfer_log
       (source_bucket, dest_bucket, object_key, tenant_id, archive_provider, size_bytes, etag, status, error_message, deleted_from_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (dest_bucket, object_key)
     DO UPDATE SET
       status = EXCLUDED.status,
       tenant_id = COALESCE(EXCLUDED.tenant_id, imaging_daily_transfer_log.tenant_id),
       archive_provider = COALESCE(EXCLUDED.archive_provider, imaging_daily_transfer_log.archive_provider),
       size_bytes = COALESCE(EXCLUDED.size_bytes, imaging_daily_transfer_log.size_bytes),
       etag = COALESCE(EXCLUDED.etag, imaging_daily_transfer_log.etag),
       error_message = EXCLUDED.error_message,
       deleted_from_source = EXCLUDED.deleted_from_source,
       transferred_at = NOW()`,
    [
      row.sourceBucket,
      row.destBucket,
      row.key,
      row.tenantId ?? null,
      row.archiveProvider ?? null,
      row.size ?? null,
      row.etag ?? null,
      row.status,
      row.error ?? null,
      Boolean(row.deleted),
    ],
  ).catch((err) => logger.warn('[ImagingDailyTransfer] log insert failed', { error: err.message }));
}

async function* listPrefix(client, bucket, prefix, modifiedSince) {
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : undefined,
      ContinuationToken: token,
    }));
    for (const obj of res.Contents || []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue;
      if (modifiedSince && obj.LastModified && obj.LastModified < modifiedSince) continue;
      yield obj;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

async function streamCopy({ aws, archiveTargets, sourceBucket, key, size, etag, tenantId }) {
  const get = await aws.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
  const chunks = [];
  for await (const chunk of get.Body) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  const { writes } = await putArchiveObject({
    key,
    body: buf,
    contentType: get.ContentType || 'application/octet-stream',
    tenantId,
    targets: archiveTargets,
    metadata: {
      source_bucket: sourceBucket,
      tenant_id: tenantId ? String(tenantId) : '',
      transferred_at: new Date().toISOString(),
      ...(etag ? { source_etag: String(etag).replace(/"/g, '') } : {}),
    },
  });

  const okWrites = writes.filter((w) => w.ok);
  let deleted = false;
  if (DELETE_AFTER && okWrites.length) {
    await aws.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: key }));
    deleted = true;
  }

  for (const w of okWrites) {
    await recordTransfer({
      sourceBucket,
      destBucket: w.bucket,
      key,
      tenantId,
      archiveProvider: w.provider,
      size: size ?? buf.length,
      etag,
      status: 'copied',
      deleted,
    });
  }

  return { key, bytes: buf.length, deleted, writes };
}

async function discoverTenantIds(explicitTenantId) {
  if (explicitTenantId != null) {
    const id = normalizeTenantId(explicitTenantId);
    return id ? [id] : [];
  }
  if (process.env.IMAGING_TRANSFER_TENANT_ID) {
    const id = normalizeTenantId(process.env.IMAGING_TRANSFER_TENANT_ID);
    return id ? [id] : [];
  }

  const mode = getTenantIsolationMode();
  if (mode === 'prefix') return [null];

  const r = await guardedPool(`
    SELECT DISTINCT tid FROM (
      SELECT tenant_id::text AS tid FROM hg_dicom_instances WHERE tenant_id IS NOT NULL
      UNION
      SELECT tenant_id::text FROM hg_dicom_studies WHERE tenant_id IS NOT NULL
      UNION
      SELECT lab_id::text FROM ris_studies WHERE lab_id IS NOT NULL
    ) t
    WHERE tid IS NOT NULL AND tid <> ''
    ORDER BY tid
    LIMIT 500
  `).catch(() => ({ rows: [] }));

  return r.rows.map((row) => normalizeTenantId(row.tid)).filter(Boolean);
}

async function transferTenantBucket({
  aws, archiveTargets, tenantId, since, dryRun, force, summary,
}) {
  const sourceBucket = getImagingDailyBucketForTenant(tenantId);

  if (!dryRun) {
    if (getTenantIsolationMode() === ISOLATION_S3_BUCKET && tenantId) {
      await ensureTenantImagingDailyBucket(tenantId).catch(() => {});
    }
  }

  try {
    await aws.send(new ListObjectsV2Command({ Bucket: sourceBucket, MaxKeys: 1 }));
  } catch (err) {
    if (err?.name === 'NoSuchBucket' || err?.$metadata?.httpStatusCode === 404) {
      summary.errors.push({ tenantId, error: `source bucket missing: ${sourceBucket}` });
      return;
    }
    throw err;
  }

  const tenantSeg = tenantId ? `tenant-${tenantId}` : null;
  const skipBucket = archiveTargets[0]?.getBucket(tenantId) || sharedMinioImagingBucket();

  for (const folder of PREFIXES) {
    const listPath = tenantSeg ? `${folder}/${tenantSeg}` : folder;
    for await (const obj of listPrefix(aws, sourceBucket, listPath, since)) {
      const keyTenant = parseTenantIdFromKey(obj.Key) || tenantId;
      summary.scanned += 1;

      const already = await guardedPool(
        `SELECT 1 FROM imaging_daily_transfer_log
         WHERE object_key = $1 AND status = 'copied' LIMIT 1`,
        [obj.Key],
      ).catch(() => ({ rows: [] }));
      if (!force && already.rows.length) {
        summary.skipped += 1;
        continue;
      }
      if (!force && await alreadyTransferred(skipBucket, obj.Key)) {
        summary.skipped += 1;
        continue;
      }

      if (dryRun) {
        summary.copied += 1;
        summary.bytes += obj.Size || 0;
        continue;
      }
      try {
        const result = await streamCopy({
          aws,
          archiveTargets,
          sourceBucket,
          key: obj.Key,
          size: obj.Size,
          etag: obj.ETag,
          tenantId: keyTenant,
        });
        summary.copied += 1;
        summary.bytes += result.bytes;
        if (result.deleted) summary.deletedFromSource += 1;
        summary.providers = summary.providers || {};
        for (const w of result.writes || []) {
          if (w.ok) summary.providers[w.provider] = (summary.providers[w.provider] || 0) + 1;
        }
      } catch (err) {
        summary.failed += 1;
        summary.errors.push({ key: obj.Key, tenantId: keyTenant, error: err.message });
        await recordTransfer({
          sourceBucket,
          destBucket: skipBucket,
          key: obj.Key,
          tenantId: keyTenant,
          size: obj.Size,
          etag: obj.ETag,
          status: 'failed',
          error: err.message,
          deleted: false,
        });
        logger.error('[ImagingDailyTransfer] copy failed', { key: obj.Key, error: err.message });
      }
    }
  }
}

/**
 * @param {{ lookbackHours?: number, dryRun?: boolean, force?: boolean, tenantId?: string|number }} [opts]
 */
export async function transferImagingDailyToMinio(opts = {}) {
  if (!isMinioConfigured() && !isWasabiConfigured()) {
    throw new Error('Configure MinIO and/or Wasabi for imaging archive transfer');
  }

  const lookbackHours = opts.lookbackHours ?? LOOKBACK_HOURS;
  const aws = awsS3();
  const archiveTargets = getArchiveTargets();
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const mode = getTenantIsolationMode();
  const tenants = await discoverTenantIds(opts.tenantId);

  const summary = {
    mode,
    isolation: describeTenantIsolation(),
    archive: describeArchiveBackends(),
    lookbackHours,
    prefixes: PREFIXES,
    tenants: tenants.map((t) => t ?? '*'),
    scanned: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
    deletedFromSource: 0,
    providers: {},
    errors: [],
    dryRun: Boolean(opts.dryRun),
  };

  for (const tenantId of tenants) {
    await transferTenantBucket({
      aws,
      archiveTargets,
      tenantId,
      since,
      dryRun: Boolean(opts.dryRun),
      force: Boolean(opts.force),
      summary,
    });
  }

  logger.info('[ImagingDailyTransfer] complete', {
    mode: summary.mode,
    scanned: summary.scanned,
    copied: summary.copied,
    failed: summary.failed,
    skipped: summary.skipped,
    bytes: summary.bytes,
    providers: summary.providers,
  });
  return summary;
}

export async function getTransferStatus(limit = 50) {
  const recent = await guardedPool(
    `SELECT * FROM imaging_daily_transfer_log ORDER BY transferred_at DESC LIMIT $1`,
    [limit],
  ).catch(() => ({ rows: [] }));
  const counts = await guardedPool(
    `SELECT status, COUNT(*)::int AS n FROM imaging_daily_transfer_log GROUP BY status`,
  ).catch(() => ({ rows: [] }));
  return {
    isolation: describeTenantIsolation(),
    archive: describeArchiveBackends(),
    sourceBucket: sharedImagingDailyBucket(),
    destBucket: sharedMinioImagingBucket(),
    minioEndpoint: process.env.MINIO_ENDPOINT || null,
    wasabiEndpoint: process.env.WASABI_ENDPOINT || null,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    recent: recent.rows,
  };
}

export default { transferImagingDailyToMinio, getTransferStatus };
