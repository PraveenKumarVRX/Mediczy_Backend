/**
 * Copy imaging objects from hot S3 → MinIO archive (tenant-aware).
 *
 * IMAGING_TENANT_ISOLATION:
 *   prefix       — shared S3 + shared MinIO; keys under tenant-{id}/
 *   minio-bucket — shared S3; MinIO bucket per tenant
 *   s3-bucket    — S3 bucket + MinIO bucket per tenant
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import pool from '../../db/pgPool.js';
import logger from '../../config/logger.js';
import { getS3Region } from '../../utils/s3-storage.js';
import {
  getTenantIsolationMode,
  getImagingDailyBucketForTenant,
  getMinioImagingBucketForTenant,
  sharedImagingDailyBucket,
  sharedMinioImagingBucket,
  parseTenantIdFromKey,
  normalizeTenantId,
  ensureTenantMinioImagingBucket,
  ensureTenantImagingDailyBucket,
  describeTenantIsolation,
  ISOLATION_S3_BUCKET,
} from './imaging-tenant-storage.service.js';

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

function minioS3() {
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!endpoint) {
    throw new Error('MINIO_ENDPOINT is required for imaging daily → MinIO transfer');
  }
  return new S3Client({
    region: process.env.MINIO_REGION || process.env.AWS_REGION || 'ap-south-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
      secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
    },
  });
}

async function ensureTransferTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imaging_daily_transfer_log (
      id BIGSERIAL PRIMARY KEY,
      source_bucket TEXT NOT NULL,
      dest_bucket TEXT NOT NULL,
      object_key TEXT NOT NULL,
      tenant_id TEXT,
      size_bytes BIGINT,
      etag TEXT,
      status TEXT NOT NULL DEFAULT 'copied',
      error_message TEXT,
      deleted_from_source BOOLEAN NOT NULL DEFAULT FALSE,
      transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (dest_bucket, object_key)
    )
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE imaging_daily_transfer_log ADD COLUMN IF NOT EXISTS tenant_id TEXT
  `).catch(() => {});
}

async function alreadyTransferred(destBucket, key) {
  const r = await pool.query(
    `SELECT 1 FROM imaging_daily_transfer_log
     WHERE dest_bucket = $1 AND object_key = $2 AND status = 'copied' LIMIT 1`,
    [destBucket, key],
  ).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}

async function recordTransfer(row) {
  await pool.query(
    `INSERT INTO imaging_daily_transfer_log
       (source_bucket, dest_bucket, object_key, tenant_id, size_bytes, etag, status, error_message, deleted_from_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (dest_bucket, object_key)
     DO UPDATE SET
       status = EXCLUDED.status,
       tenant_id = COALESCE(EXCLUDED.tenant_id, imaging_daily_transfer_log.tenant_id),
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

async function streamCopy({ aws, minio, sourceBucket, destBucket, key, size, etag, tenantId }) {
  const get = await aws.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
  const chunks = [];
  for await (const chunk of get.Body) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  await minio.send(new PutObjectCommand({
    Bucket: destBucket,
    Key: key,
    Body: buf,
    ContentType: get.ContentType || 'application/octet-stream',
    ContentLength: buf.length,
    Metadata: {
      source_bucket: sourceBucket,
      tenant_id: tenantId ? String(tenantId) : '',
      transferred_at: new Date().toISOString(),
      ...(etag ? { source_etag: String(etag).replace(/"/g, '') } : {}),
    },
  }));

  let deleted = false;
  if (DELETE_AFTER) {
    await aws.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: key }));
    deleted = true;
  }

  await recordTransfer({
    sourceBucket,
    destBucket,
    key,
    tenantId,
    size: size ?? buf.length,
    etag,
    status: 'copied',
    deleted,
  });

  return { key, bytes: buf.length, deleted };
}

/** Discover tenant ids that have imaging rows (for multi-bucket modes). */
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
  if (mode === 'prefix') return [null]; // null = scan shared bucket all tenants via key prefixes

  const r = await pool.query(`
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
  aws, minio, tenantId, since, dryRun, force, summary,
}) {
  const sourceBucket = getImagingDailyBucketForTenant(tenantId);
  const destBucket = getMinioImagingBucketForTenant(tenantId);

  if (!dryRun) {
    if (getTenantIsolationMode() === ISOLATION_S3_BUCKET && tenantId) {
      await ensureTenantImagingDailyBucket(tenantId).catch(() => {});
    }
    if (tenantId) {
      await ensureTenantMinioImagingBucket(tenantId).catch((err) => {
        throw new Error(`MinIO bucket ensure failed for tenant ${tenantId}: ${err.message}`);
      });
    }
  }

  // Probe source
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

  for (const folder of PREFIXES) {
    const listPath = tenantSeg ? `${folder}/${tenantSeg}` : folder;
    for await (const obj of listPrefix(aws, sourceBucket, listPath, since)) {
      const keyTenant = parseTenantIdFromKey(obj.Key) || tenantId;
      const objectDest = getMinioImagingBucketForTenant(keyTenant);
      summary.scanned += 1;

      if (!force && await alreadyTransferred(objectDest, obj.Key)) {
        summary.skipped += 1;
        continue;
      }
      if (dryRun) {
        summary.copied += 1;
        summary.bytes += obj.Size || 0;
        continue;
      }
      try {
        if (objectDest !== destBucket) {
          await ensureTenantMinioImagingBucket(keyTenant).catch(() => {});
        }
        const result = await streamCopy({
          aws,
          minio,
          sourceBucket,
          destBucket: objectDest,
          key: obj.Key,
          size: obj.Size,
          etag: obj.ETag,
          tenantId: keyTenant,
        });
        summary.copied += 1;
        summary.bytes += result.bytes;
        if (result.deleted) summary.deletedFromSource += 1;
      } catch (err) {
        summary.failed += 1;
        summary.errors.push({ key: obj.Key, tenantId: keyTenant, error: err.message });
        await recordTransfer({
          sourceBucket,
          destBucket: objectDest,
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
  const lookbackHours = opts.lookbackHours ?? LOOKBACK_HOURS;
  const aws = awsS3();
  const minio = minioS3();
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const mode = getTenantIsolationMode();

  await ensureTransferTable();
  const tenants = await discoverTenantIds(opts.tenantId);

  const summary = {
    mode,
    isolation: describeTenantIsolation(),
    lookbackHours,
    prefixes: PREFIXES,
    tenants: tenants.map((t) => t ?? '*'),
    scanned: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
    deletedFromSource: 0,
    errors: [],
    dryRun: Boolean(opts.dryRun),
  };

  for (const tenantId of tenants) {
    await transferTenantBucket({
      aws,
      minio,
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
  });
  return summary;
}

export async function getTransferStatus(limit = 50) {
  await ensureTransferTable();
  const recent = await pool.query(
    `SELECT * FROM imaging_daily_transfer_log ORDER BY transferred_at DESC LIMIT $1`,
    [limit],
  ).catch(() => ({ rows: [] }));
  const counts = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM imaging_daily_transfer_log GROUP BY status`,
  ).catch(() => ({ rows: [] }));
  return {
    isolation: describeTenantIsolation(),
    sourceBucket: sharedImagingDailyBucket(),
    destBucket: sharedMinioImagingBucket(),
    minioEndpoint: process.env.MINIO_ENDPOINT || null,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    recent: recent.rows,
  };
}

export default { transferImagingDailyToMinio, getTransferStatus };
