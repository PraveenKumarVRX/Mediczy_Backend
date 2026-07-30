/**
 * Imaging tenant isolation — key prefixes and optional per-tenant buckets.
 *
 * IMAGING_TENANT_ISOLATION=
 *   prefix       (default) — shared S3/MinIO buckets, keys under …/tenant-{id}/…
 *   minio-bucket           — shared S3 daily; MinIO archive bucket per tenant
 *   s3-bucket              — dedicated S3 daily bucket + MinIO bucket per tenant
 *
 * Bucket naming:
 *   S3:   ${S3_IMAGING_DAILY_BUCKET_PREFIX|-t}${id}   e.g. mediczy-imaging-daily-t56
 *   MinIO:${MINIO_IMAGING_BUCKET_PREFIX|-t}${id}      e.g. mediczy-imaging-t56
 */
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketEncryptionCommand,
  PutPublicAccessBlockCommand,
  BucketAlreadyOwnedByYou,
  BucketAlreadyExists,
} from '@aws-sdk/client-s3';
import logger from '../../config/logger.js';

export const ISOLATION_PREFIX = 'prefix';
export const ISOLATION_MINIO_BUCKET = 'minio-bucket';
export const ISOLATION_S3_BUCKET = 's3-bucket';

export function getTenantIsolationMode() {
  const mode = String(process.env.IMAGING_TENANT_ISOLATION || ISOLATION_PREFIX).toLowerCase().trim();
  if ([ISOLATION_PREFIX, ISOLATION_MINIO_BUCKET, ISOLATION_S3_BUCKET].includes(mode)) return mode;
  return ISOLATION_PREFIX;
}

export function normalizeTenantId(tenantId) {
  if (tenantId == null || tenantId === '') return null;
  const raw = String(tenantId).trim().replace(/^tenant-/i, '').replace(/[^a-zA-Z0-9_-]/g, '');
  return raw.slice(0, 64) || null;
}

export function tenantKeySegment(tenantId) {
  const id = normalizeTenantId(tenantId);
  return id ? `tenant-${id}` : 'tenant-unknown';
}

/** Parse tenant id from an object key like dicom/tenant-56/2026/… */
export function parseTenantIdFromKey(key) {
  const m = String(key || '').match(/(?:^|\/)tenant-([a-zA-Z0-9_-]+)(?:\/|$)/);
  return m ? m[1] : null;
}

export function sharedImagingDailyBucket() {
  return (
    process.env.S3_IMAGING_DAILY_BUCKET
    || process.env.S3_UPLOADS_BUCKET
    || 'mediczy-imaging-daily'
  );
}

export function sharedMinioImagingBucket() {
  return process.env.MINIO_IMAGING_BUCKET || 'mediczy-imaging-archive';
}

export function s3DailyBucketPrefix() {
  return process.env.S3_IMAGING_DAILY_BUCKET_PREFIX
    || process.env.S3_IMAGING_DAILY_BUCKET
    || 'mediczy-imaging-daily';
}

export function minioImagingBucketPrefix() {
  return process.env.MINIO_IMAGING_BUCKET_PREFIX
    || 'mediczy-imaging';
}

/**
 * Hot S3 bucket for a tenant (upload target).
 * prefix / minio-bucket → shared daily bucket
 * s3-bucket → mediczy-imaging-daily-t{id}
 */
export function getImagingDailyBucketForTenant(tenantId) {
  const mode = getTenantIsolationMode();
  if (mode !== ISOLATION_S3_BUCKET) return sharedImagingDailyBucket();
  const id = normalizeTenantId(tenantId);
  if (!id) return sharedImagingDailyBucket();
  return `${s3DailyBucketPrefix()}-t${id}`.toLowerCase().slice(0, 63);
}

/**
 * MinIO archive bucket for a tenant.
 * prefix → shared archive
 * minio-bucket / s3-bucket → mediczy-imaging-t{id}
 */
export function getMinioImagingBucketForTenant(tenantId) {
  const mode = getTenantIsolationMode();
  if (mode === ISOLATION_PREFIX) return sharedMinioImagingBucket();
  const id = normalizeTenantId(tenantId);
  if (!id) return sharedMinioImagingBucket();
  return `${minioImagingBucketPrefix()}-t${id}`.toLowerCase().slice(0, 63);
}

/** Resolve hot bucket from object key (tenant embedded in path). */
export function resolveImagingBucketFromKey(key) {
  const mode = getTenantIsolationMode();
  if (mode === ISOLATION_S3_BUCKET) {
    const tid = parseTenantIdFromKey(key);
    if (tid) return getImagingDailyBucketForTenant(tid);
  }
  return sharedImagingDailyBucket();
}

function awsClient() {
  return new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
}

function minioClient() {
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!endpoint) throw new Error('MINIO_ENDPOINT is required');
  return new S3Client({
    region: process.env.MINIO_REGION || process.env.AWS_REGION || 'ap-south-1',
    endpoint,
    forcePathStyle: true,
    // AWS SDK >= 3.729 CRC32 defaults break MinIO — see imaging-archive-client.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
      secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
    },
  });
}

async function ensureBucket(client, bucket, { encrypt = false } = {}) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { bucket, created: false };
  } catch (err) {
    const missing = err?.name === 'NotFound'
      || err?.name === 'NoSuchBucket'
      || err?.$metadata?.httpStatusCode === 404;
    if (!missing) throw err;
  }

  try {
    const region = process.env.AWS_REGION || 'ap-south-1';
    const input = { Bucket: bucket };
    // AWS requires LocationConstraint except us-east-1; MinIO ignores it
    if (!process.env.MINIO_ENDPOINT && region !== 'us-east-1') {
      input.CreateBucketConfiguration = { LocationConstraint: region };
    }
    await client.send(new CreateBucketCommand(input));
  } catch (err) {
    if (!(err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists
      || err?.name === 'BucketAlreadyOwnedByYou' || err?.name === 'BucketAlreadyExists')) {
      throw err;
    }
  }

  if (encrypt) {
    try {
      await client.send(new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }));
    } catch (err) {
      logger.warn('[ImagingTenantStorage] public-access-block skipped', { bucket, error: err.message });
    }
    try {
      await client.send(new PutBucketEncryptionCommand({
        Bucket: bucket,
        ServerSideEncryptionConfiguration: {
          Rules: [{
            ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
            BucketKeyEnabled: true,
          }],
        },
      }));
    } catch (err) {
      logger.warn('[ImagingTenantStorage] encryption skipped', { bucket, error: err.message });
    }
  }

  return { bucket, created: true };
}

/** Ensure the hot S3 bucket exists for this tenant (no-op in prefix mode). */
export async function ensureTenantImagingDailyBucket(tenantId) {
  if (getTenantIsolationMode() !== ISOLATION_S3_BUCKET) {
    return { bucket: sharedImagingDailyBucket(), created: false, skipped: true };
  }
  const bucket = getImagingDailyBucketForTenant(tenantId);
  return ensureBucket(awsClient(), bucket, { encrypt: true });
}

/** Ensure the MinIO archive bucket exists for this tenant. */
export async function ensureTenantMinioImagingBucket(tenantId) {
  const mode = getTenantIsolationMode();
  if (mode === ISOLATION_PREFIX) {
    return { bucket: sharedMinioImagingBucket(), created: false, skipped: true };
  }
  if (!process.env.MINIO_ENDPOINT) {
    throw new Error('MINIO_ENDPOINT required to ensure per-tenant MinIO bucket');
  }
  const bucket = getMinioImagingBucketForTenant(tenantId);
  return ensureBucket(minioClient(), bucket, { encrypt: false });
}

/**
 * Ensure storage targets for a tenant before/after upload.
 * Safe to call on every upload (idempotent).
 */
export async function ensureTenantImagingStorage(tenantId) {
  const mode = getTenantIsolationMode();
  const result = {
    mode,
    dailyBucket: getImagingDailyBucketForTenant(tenantId),
    minioBucket: getMinioImagingBucketForTenant(tenantId),
    daily: null,
    minio: null,
  };
  if (mode === ISOLATION_S3_BUCKET) {
    result.daily = await ensureTenantImagingDailyBucket(tenantId);
  }
  if (mode === ISOLATION_MINIO_BUCKET || mode === ISOLATION_S3_BUCKET) {
    if (process.env.MINIO_ENDPOINT) {
      result.minio = await ensureTenantMinioImagingBucket(tenantId).catch((err) => {
        logger.warn('[ImagingTenantStorage] minio ensure failed', { error: err.message, tenantId });
        return { error: err.message };
      });
    }
  }
  return result;
}

export function describeTenantIsolation() {
  return {
    mode: getTenantIsolationMode(),
    sharedDailyBucket: sharedImagingDailyBucket(),
    sharedMinioBucket: sharedMinioImagingBucket(),
    s3DailyBucketPrefix: s3DailyBucketPrefix(),
    minioImagingBucketPrefix: minioImagingBucketPrefix(),
    example: {
      tenantId: 56,
      key: 'dicom/tenant-56/2026/07/30/example.dcm',
      dailyBucket: getImagingDailyBucketForTenant(56),
      minioBucket: getMinioImagingBucketForTenant(56),
    },
  };
}
