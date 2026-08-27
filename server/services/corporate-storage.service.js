/**
 * Per-corporate MinIO bucket isolation for corporate health reports.
 *
 * Today every corporate's employee health-checkup reports land in one
 * shared bucket (`web-uploads`, via minio-upload.service.js's default),
 * separated only by an S3 key prefix (`health-reports/corp-{id}/emp-{id}/…`).
 * This gives each corporate its own dedicated bucket instead — the same
 * isolation pattern already established and running in production for
 * imaging tenants (see imaging-tenant-storage.service.js's
 * ISOLATION_MINIO_BUCKET mode) — so one corporate's employee health
 * documents are never physically co-located with another's.
 *
 * Deliberately NOT changed here: bucket public-read access. The existing
 * shared bucket serves report files via a fully public URL with no auth or
 * signing (confirmed live — any report_url is directly fetchable by
 * anyone who has it) — that gap predates this change and isn't fixed by
 * per-corporate buckets alone; blocking public access here without also
 * switching report_url generation to presigned URLs would just break every
 * report link (email, WhatsApp, in-app list) the moment this bucket goes
 * live. That's a real, separate piece of work, flagged, not silently done
 * or silently ignored.
 */
import { CreateBucketCommand, HeadBucketCommand, BucketAlreadyOwnedByYou, BucketAlreadyExists } from '@aws-sdk/client-s3';
import { getS3Client } from './s3-presign.service.js';

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
  return `${BUCKET_PREFIX}-c${id}`.toLowerCase().slice(0, 63);
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
  const client = getS3Client();

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
