/** Corporate-specific private report buckets on the configured PACS MinIO backend.
 * Downloads are authorized before a short-lived signed URL is issued.
 */
import { CreateBucketCommand, HeadBucketCommand, BucketAlreadyOwnedByYou, BucketAlreadyExists } from '@aws-sdk/client-s3';
import { getCorporateReportClient } from './corporate-report-storage-client.js';

const BUCKET_PREFIX = process.env.MINIO_CORPORATE_BUCKET_PREFIX || 'mediczy-corp-health';

/** Strips anything that isn't a safe bucket-name character. */
export function normalizeCorporateId(corporateId) {
  const raw = String(corporateId ?? '').trim().replace(/[^a-zA-Z0-9-]/g, '');
  return raw || null;
}

/**
 * Deterministic, valid MinIO/S3 bucket name for one corporate's health
 * reports. Bucket names must be lowercase, 3-63 chars, and this pipeline's
 * corporate ids are small integers, so length is never actually a
 * constraint in practice — the slice is a real safety margin, not
 * decoration.
 */
export function getCorporateHealthReportsBucket(corporateId) {
  const id = normalizeCorporateId(corporateId);
  if (!id) throw new Error('corporateId is required to resolve a per-corporate health-reports bucket');
  return process.env.CORPORATE_REPORTS_MINIO_BUCKET || process.env.PACS_ARCHIVE_MINIO_BUCKET || `${BUCKET_PREFIX}-c${id}`.toLowerCase().slice(0,63);
}

/**
 * Creates the corporate's bucket if it doesn't exist yet. Idempotent —
 * safe to call on every upload, same as the imaging tenant-storage
 * equivalent. A HeadBucket race against another concurrent request is
 * handled by tolerating BucketAlreadyOwnedByYou/BucketAlreadyExists on the
 * create, not by pre-locking.
 */
export async function ensureCorporateHealthReportsBucket(corporateId) {
  const bucket = getCorporateHealthReportsBucket(corporateId);
  const client = getCorporateReportClient();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { bucket, created: false };
  } catch (err) {
    const missing = err?.name === 'NotFound' || err?.name === 'NoSuchBucket' || err?.$metadata?.httpStatusCode === 404;
    if (!missing) throw err;
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err) {
    const alreadyExists = err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists
      || err?.name === 'BucketAlreadyOwnedByYou' || err?.name === 'BucketAlreadyExists';
    if (!alreadyExists) throw err;
  }

  return { bucket, created: true };
}

export default { normalizeCorporateId, getCorporateHealthReportsBucket, ensureCorporateHealthReportsBucket };
