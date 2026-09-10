/**
 * Nightly archive: PACS S3 bucket -> on-prem PACS MinIO.
 *
 * Architecture (2026-09-10, post minio-pacs.mediqzy.com outage): Orthanc's
 * AwsS3Storage plugin (docker/imaging/.env S3_STORAGE_*) and the HyperGrid
 * ingest pipeline (server/utils/s3-storage.js pacsMinioClient, env
 * PACS_MINIO_*) both write new DICOM data synchronously to a single AWS S3
 * bucket now — that's the permanent primary, not a stopgap. A MinIO outage
 * can no longer block new studies from being received at all.
 *
 * This job additionally mirrors that S3 bucket to the on-prem PACS MinIO
 * (minio-pacs.mediqzy.com, bucket PACS_ARCHIVE_MINIO_BUCKET) once a night,
 * so MinIO still ends up with a full archive copy on a schedule that
 * tolerates its demonstrated flakiness (502/530s under load) via retries +
 * exponential backoff, resumable via the idempotent size-match skip check.
 * Source objects in S3 are NEVER deleted — S3 stays the permanent primary
 * copy; this is purely an archive push, not a migration.
 *
 * PACS_ARCHIVE_MINIO_* are deliberately separate from PACS_MINIO_* (which
 * now names the primary S3 target, not MinIO, despite the name) to avoid
 * the two roles getting confused in config.
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import pool from '../../db/pgPool.js';
import logger from '../../config/logger.js';
import { getPacsMinioBucket } from '../../utils/s3-storage.js';

const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const SOURCE_BUCKET = process.env.PACS_ARCHIVE_SOURCE_BUCKET || getPacsMinioBucket() || 'mediczy-pacs-storage';
const CONCURRENCY = Math.max(1, Number(process.env.PACS_MINIO_ARCHIVE_CONCURRENCY || 4));
const MAX_RETRIES = Math.max(1, Number(process.env.PACS_MINIO_ARCHIVE_MAX_RETRIES || 4));

export function isPacsArchiveMinioConfigured() {
  return Boolean(process.env.PACS_ARCHIVE_MINIO_ENDPOINT && process.env.PACS_ARCHIVE_MINIO_ACCESS_KEY);
}

function destClient() {
  return new S3Client({
    region: process.env.PACS_ARCHIVE_MINIO_REGION || 'us-east-1',
    endpoint: process.env.PACS_ARCHIVE_MINIO_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.PACS_ARCHIVE_MINIO_ACCESS_KEY,
      secretAccessKey: process.env.PACS_ARCHIVE_MINIO_SECRET_KEY,
    },
  });
}

function destBucket() {
  return process.env.PACS_ARCHIVE_MINIO_BUCKET || 'pacs-entity-001';
}

function sourceClient() {
  return new S3Client({ region: AWS_REGION });
}

async function ensureLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pacs_minio_archive_log (
      id BIGSERIAL PRIMARY KEY,
      object_key TEXT NOT NULL,
      size_bytes BIGINT,
      status TEXT NOT NULL,
      error_message TEXT,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (object_key)
    )
  `).catch(() => {});
}

async function* listAllKeys(client, bucket) {
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const obj of res.Contents || []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue;
      yield obj;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

async function copyOne({ src, dst, key, size, force }) {
  if (!force) {
    try {
      const head = await dst.send(new HeadObjectCommand({ Bucket: destBucket(), Key: key }));
      if (head.ContentLength === size) return { status: 'skip', key };
    } catch { /* not present yet in archive */ }
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const obj = await src.send(new GetObjectCommand({ Bucket: SOURCE_BUCKET, Key: key }));
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      await dst.send(new PutObjectCommand({
        Bucket: destBucket(),
        Key: key,
        Body: body,
        ContentType: obj.ContentType || 'application/dicom',
      }));
      return { status: 'ok', key, bytes: body.length };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 1000, 20000)));
    }
  }
  return { status: 'error', key, error: lastErr?.message || String(lastErr) };
}

async function recordResult(row) {
  await pool.query(
    `INSERT INTO pacs_minio_archive_log (object_key, size_bytes, status, error_message, archived_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (object_key) DO UPDATE SET
       size_bytes = EXCLUDED.size_bytes,
       status = EXCLUDED.status,
       error_message = EXCLUDED.error_message,
       archived_at = NOW()`,
    [row.key, row.size ?? null, row.status, row.error ?? null],
  ).catch((err) => logger.warn('[PacsMinioArchive] log insert failed', { error: err.message }));
}

/** @param {{ dryRun?: boolean, force?: boolean }} [opts] */
export async function archivePacsBucketToMinio(opts = {}) {
  if (!isPacsArchiveMinioConfigured()) {
    throw new Error('Configure PACS_ARCHIVE_MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET for the PACS archive job');
  }
  await ensureLogTable();

  const src = sourceClient();
  const dst = destClient();
  const dryRun = Boolean(opts.dryRun);
  const force = Boolean(opts.force);

  const summary = {
    sourceBucket: SOURCE_BUCKET,
    destBucket: destBucket(),
    dryRun,
    scanned: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
    errors: [],
  };

  const keys = [];
  for await (const obj of listAllKeys(src, SOURCE_BUCKET)) {
    keys.push(obj);
  }
  summary.scanned = keys.length;

  if (dryRun) {
    summary.copied = keys.length;
    summary.bytes = keys.reduce((sum, o) => sum + (o.Size || 0), 0);
    return summary;
  }

  let idx = 0;
  async function worker() {
    while (idx < keys.length) {
      const obj = keys[idx];
      idx += 1;
      const result = await copyOne({ src, dst, key: obj.Key, size: obj.Size, force });
      if (result.status === 'ok') {
        summary.copied += 1;
        summary.bytes += result.bytes;
        await recordResult({ key: result.key, size: result.bytes, status: 'copied' });
      } else if (result.status === 'skip') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        summary.errors.push({ key: result.key, error: result.error });
        await recordResult({ key: result.key, size: obj.Size, status: 'failed', error: result.error });
        logger.error('[PacsMinioArchive] copy failed', { key: result.key, error: result.error });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  logger.info('[PacsMinioArchive] complete', {
    scanned: summary.scanned,
    copied: summary.copied,
    skipped: summary.skipped,
    failed: summary.failed,
    bytes: summary.bytes,
  });
  return summary;
}

export async function getPacsArchiveStatus(limit = 50) {
  await ensureLogTable();
  const recent = await pool.query(
    `SELECT * FROM pacs_minio_archive_log ORDER BY archived_at DESC LIMIT $1`,
    [limit],
  ).catch(() => ({ rows: [] }));
  const counts = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM pacs_minio_archive_log GROUP BY status`,
  ).catch(() => ({ rows: [] }));
  return {
    sourceBucket: SOURCE_BUCKET,
    destBucket: destBucket(),
    destEndpoint: process.env.PACS_ARCHIVE_MINIO_ENDPOINT || null,
    configured: isPacsArchiveMinioConfigured(),
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    recent: recent.rows,
  };
}

export default { archivePacsBucketToMinio, getPacsArchiveStatus, isPacsArchiveMinioConfigured };
