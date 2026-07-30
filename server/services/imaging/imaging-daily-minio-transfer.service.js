/**
 * Copy imaging objects from the hot S3 daily bucket → MinIO archive.
 *
 * Flow:
 *   Lab/Doctor/HyperGrid upload → s3://S3_IMAGING_DAILY_BUCKET/{dicom|imaging|ris}/…
 *   Nightly cron (02:30)        → minio://MINIO_IMAGING_BUCKET/…  (same keys)
 *
 * Env:
 *   S3_IMAGING_DAILY_BUCKET   — source (default mediczy-imaging-daily)
 *   MINIO_ENDPOINT            — e.g. http://127.0.0.1:9000
 *   MINIO_ACCESS_KEY / MINIO_SECRET_KEY
 *   MINIO_IMAGING_BUCKET      — destination (default mediczy-imaging-archive)
 *   IMAGING_TRANSFER_PREFIXES — comma list (default dicom,imaging,ris)
 *   IMAGING_TRANSFER_LOOKBACK_HOURS — only objects modified in window (default 36)
 *   IMAGING_DAILY_DELETE_AFTER_TRANSFER — if "true", delete from S3 after successful MinIO put
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
import { getImagingDailyBucket, getS3Region } from '../../utils/s3-storage.js';

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

function minioBucket() {
  return process.env.MINIO_IMAGING_BUCKET || 'mediczy-imaging-archive';
}

async function ensureTransferTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imaging_daily_transfer_log (
      id BIGSERIAL PRIMARY KEY,
      source_bucket TEXT NOT NULL,
      dest_bucket TEXT NOT NULL,
      object_key TEXT NOT NULL,
      size_bytes BIGINT,
      etag TEXT,
      status TEXT NOT NULL DEFAULT 'copied',
      error_message TEXT,
      deleted_from_source BOOLEAN NOT NULL DEFAULT FALSE,
      transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (dest_bucket, object_key)
    )
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
       (source_bucket, dest_bucket, object_key, size_bytes, etag, status, error_message, deleted_from_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (dest_bucket, object_key)
     DO UPDATE SET
       status = EXCLUDED.status,
       size_bytes = COALESCE(EXCLUDED.size_bytes, imaging_daily_transfer_log.size_bytes),
       etag = COALESCE(EXCLUDED.etag, imaging_daily_transfer_log.etag),
       error_message = EXCLUDED.error_message,
       deleted_from_source = EXCLUDED.deleted_from_source,
       transferred_at = NOW()`,
    [
      row.sourceBucket,
      row.destBucket,
      row.key,
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
      Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
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

async function streamCopy({ aws, minio, sourceBucket, destBucket, key, size, etag }) {
  const get = await aws.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
  const body = get.Body;
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  await minio.send(new PutObjectCommand({
    Bucket: destBucket,
    Key: key,
    Body: buf,
    ContentType: get.ContentType || 'application/octet-stream',
    ContentLength: buf.length,
    Metadata: {
      source_bucket: sourceBucket,
      transferred_at: new Date().toISOString(),
      ...(etag ? { source_etag: String(etag).replace(/"/g, '') } : {}),
    },
    // MinIO accepts SSE header optionally; omit if not configured
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
    size: size ?? buf.length,
    etag,
    status: 'copied',
    deleted,
  });

  return { key, bytes: buf.length, deleted };
}

/**
 * Transfer recent imaging objects from S3 daily → MinIO.
 * @param {{ lookbackHours?: number, dryRun?: boolean, force?: boolean, tenantId?: string|number }} [opts]
 */
export async function transferImagingDailyToMinio(opts = {}) {
  const lookbackHours = opts.lookbackHours ?? LOOKBACK_HOURS;
  const sourceBucket = getImagingDailyBucket();
  const destBucket = minioBucket();
  const aws = awsS3();
  const minio = minioS3();
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const tenantFilter = opts.tenantId != null
    ? `tenant-${String(opts.tenantId).replace(/^tenant-/, '')}`
    : (process.env.IMAGING_TRANSFER_TENANT_ID
      ? `tenant-${String(process.env.IMAGING_TRANSFER_TENANT_ID).replace(/^tenant-/, '')}`
      : null);

  await ensureTransferTable();

  // Probe source bucket (ListObjects empty prefix)
  try {
    await aws.send(new ListObjectsV2Command({
      Bucket: sourceBucket,
      MaxKeys: 1,
    }));
  } catch (err) {
    if (err?.name === 'NoSuchBucket' || err?.$metadata?.httpStatusCode === 404) {
      throw new Error(
        `S3 daily bucket missing: ${sourceBucket}. Run scripts/imaging/create-imaging-daily-s3-bucket.sh`,
      );
    }
    throw err;
  }

  const summary = {
    sourceBucket,
    destBucket,
    lookbackHours,
    prefixes: PREFIXES,
    tenantFilter,
    scanned: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
    deletedFromSource: 0,
    errors: [],
    dryRun: Boolean(opts.dryRun),
  };

  for (const folder of PREFIXES) {
    const listPrefixPath = tenantFilter ? `${folder}/${tenantFilter}` : folder;
    for await (const obj of listPrefix(aws, sourceBucket, listPrefixPath, since)) {
      summary.scanned += 1;
      if (!opts.force && await alreadyTransferred(destBucket, obj.Key)) {
        summary.skipped += 1;
        continue;
      }
      if (opts.dryRun) {
        summary.copied += 1;
        summary.bytes += obj.Size || 0;
        continue;
      }
      try {
        const result = await streamCopy({
          aws,
          minio,
          sourceBucket,
          destBucket,
          key: obj.Key,
          size: obj.Size,
          etag: obj.ETag,
        });
        summary.copied += 1;
        summary.bytes += result.bytes;
        if (result.deleted) summary.deletedFromSource += 1;
      } catch (err) {
        summary.failed += 1;
        summary.errors.push({ key: obj.Key, error: err.message });
        await recordTransfer({
          sourceBucket,
          destBucket,
          key: obj.Key,
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

  logger.info('[ImagingDailyTransfer] complete', summary);
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
    sourceBucket: getImagingDailyBucket(),
    destBucket: minioBucket(),
    minioEndpoint: process.env.MINIO_ENDPOINT || null,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    recent: recent.rows,
  };
}

export default { transferImagingDailyToMinio, getTransferStatus };
