/**
 * Imaging archive backends — MinIO (primary) + Wasabi (S3-compatible fallback).
 *
 * Env (MinIO):
 *   MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_IMAGING_BUCKET
 *
 * Env (Wasabi):
 *   WASABI_ENDPOINT          e.g. https://s3.wasabisys.com (us-east-1)
 *   WASABI_REGION            e.g. us-east-1  (must match bucket region; never use AWS_REGION)
 *   WASABI_ACCESS_KEY / WASABI_SECRET_KEY
 *   WASABI_IMAGING_BUCKET    default mediczy-imaging-archive
 *   WASABI_IMAGING_BUCKET_PREFIX  for per-tenant: mediczy-imaging-t{id}
 *
 * Behaviour:
 *   IMAGING_WASABI_MIRROR=true  → write MinIO then also Wasabi when both configured
 *   otherwise                   → try MinIO first; on failure (or MinIO unset) use Wasabi
 */
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  BucketAlreadyOwnedByYou,
  BucketAlreadyExists,
} from '@aws-sdk/client-s3';
import logger from '../../config/logger.js';
import {
  getTenantIsolationMode,
  normalizeTenantId,
  getMinioImagingBucketForTenant,
  ISOLATION_PREFIX,
} from './imaging-tenant-storage.service.js';

export const ARCHIVE_MINIO = 'minio';
export const ARCHIVE_WASABI = 'wasabi';

/**
 * AWS SDK JS >= 3.729 defaults to CRC32 checksums that Wasabi/MinIO often
 * reject with opaque UnknownError. Only checksum when the API requires it.
 * @see https://github.com/aws/aws-sdk-js-v3/issues/6810
 */
export const S3_COMPAT_CHECKSUM = {
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
};

export function isMinioConfigured() {
  return Boolean(process.env.MINIO_ENDPOINT && (process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER));
}

export function isWasabiConfigured() {
  return Boolean(
    process.env.WASABI_ENDPOINT
    && process.env.WASABI_ACCESS_KEY
    && process.env.WASABI_SECRET_KEY,
  );
}

export function wasabiMirrorEnabled() {
  return ['1', 'true', 'yes'].includes(String(process.env.IMAGING_WASABI_MIRROR || '').toLowerCase());
}

export function sharedWasabiImagingBucket() {
  return process.env.WASABI_IMAGING_BUCKET || 'mediczy-imaging-archive';
}

export function wasabiImagingBucketPrefix() {
  return process.env.WASABI_IMAGING_BUCKET_PREFIX || 'mediczy-imaging';
}

export function getWasabiImagingBucketForTenant(tenantId) {
  const mode = getTenantIsolationMode();
  if (mode === ISOLATION_PREFIX) return sharedWasabiImagingBucket();
  const id = normalizeTenantId(tenantId);
  if (!id) return sharedWasabiImagingBucket();
  return `${wasabiImagingBucketPrefix()}-t${id}`.toLowerCase().slice(0, 63);
}

export function createMinioClient() {
  if (!isMinioConfigured()) {
    throw new Error('MinIO not configured (MINIO_ENDPOINT + credentials)');
  }
  return new S3Client({
    region: process.env.MINIO_REGION || process.env.AWS_REGION || 'ap-south-1',
    endpoint: process.env.MINIO_ENDPOINT,
    forcePathStyle: true,
    ...S3_COMPAT_CHECKSUM,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
      secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
    },
  });
}

export function createWasabiClient() {
  if (!isWasabiConfigured()) {
    throw new Error('Wasabi not configured (WASABI_ENDPOINT + WASABI_ACCESS_KEY + WASABI_SECRET_KEY)');
  }
  // Wasabi is S3-compatible. Use path-style against the regional/global endpoint —
  // virtual-hosted (bucket.s3.wasabisys.com) often yields opaque UnknownError on EC2.
  // Always prefer WASABI_REGION — never fall through to AWS_REGION / EC2 IMDS region
  // (hosts in ap-southeast-1 would otherwise sign the wrong region).
  const region = (process.env.WASABI_REGION || 'us-east-1').trim();
  const endpoint = process.env.WASABI_ENDPOINT.replace(/\/$/, '').trim();
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    ...S3_COMPAT_CHECKSUM,
    credentials: {
      accessKeyId: String(process.env.WASABI_ACCESS_KEY || '').trim(),
      secretAccessKey: String(process.env.WASABI_SECRET_KEY || '').trim(),
    },
  });
}

/**
 * Live ListObjects against Wasabi (proves keys/region/endpoint work).
 * @returns {Promise<{ ok: boolean, region: string, endpoint: string, bucket: string, objectCount?: number, error?: string, detail?: object }>}
 */
export async function probeWasabiConnectivity() {
  const region = (process.env.WASABI_REGION || 'us-east-1').trim();
  const endpoint = (process.env.WASABI_ENDPOINT || '').replace(/\/$/, '').trim();
  const bucket = sharedWasabiImagingBucket();
  if (!isWasabiConfigured()) {
    return { ok: false, region, endpoint, bucket, error: 'Wasabi env not configured' };
  }
  try {
    const client = createWasabiClient();
    // ListObjectsV2 is enough; HeadBucket is flaky on some S3-compatible stores.
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
    return {
      ok: true,
      region,
      endpoint,
      bucket,
      objectCount: listed.KeyCount ?? 0,
    };
  } catch (err) {
    const code = err.Code || err.name || err.$metadata?.httpStatusCode || 'Error';
    const message = err.message || String(err);
    const cause = err.cause ? (err.cause.message || String(err.cause)) : undefined;
    const redirectEndpoint = err.Endpoint || err.endpoint || null;
    const bucketRegion = err.BucketRegion || err.Region || null;
    let hint = null;
    if (code === 'PermanentRedirect' || err.$metadata?.httpStatusCode === 301) {
      // Bucket lives in another Wasabi region — e.g. Singapore = ap-southeast-1
      const suggestedRegion = bucketRegion
        || (String(redirectEndpoint || '').match(/s3\.([a-z0-9-]+)\.wasabisys\.com/i) || [])[1]
        || 'ap-southeast-1';
      const suggestedEndpoint = redirectEndpoint
        ? (String(redirectEndpoint).startsWith('http') ? redirectEndpoint : `https://${redirectEndpoint}`)
        : `https://s3.${suggestedRegion}.wasabisys.com`;
      hint = `Bucket is not in ${region}. Set WASABI_REGION=${suggestedRegion} and WASABI_ENDPOINT=${suggestedEndpoint} (Wasabi Singapore = ap-southeast-1)`;
    }
    return {
      ok: false,
      region,
      endpoint,
      bucket,
      error: `${code}: ${message}${cause ? ` | cause: ${cause}` : ''}`,
      hint,
      detail: {
        httpStatusCode: err.$metadata?.httpStatusCode,
        requestId: err.$metadata?.requestId,
        extendedRequestId: err.$metadata?.extendedRequestId,
        fault: err.$fault,
        cause: cause || null,
        redirectEndpoint,
        bucketRegion,
      },
    };
  }
}

/**
 * Ordered archive targets: MinIO first, then Wasabi.
 * @returns {{ name: string, client: S3Client, getBucket: (tenantId)=>string }[]}
 */
export function getArchiveTargets() {
  const targets = [];
  if (isMinioConfigured()) {
    targets.push({
      name: ARCHIVE_MINIO,
      client: createMinioClient(),
      getBucket: (tenantId) => getMinioImagingBucketForTenant(tenantId),
    });
  }
  if (isWasabiConfigured()) {
    targets.push({
      name: ARCHIVE_WASABI,
      client: createWasabiClient(),
      getBucket: (tenantId) => getWasabiImagingBucketForTenant(tenantId),
    });
  }
  return targets;
}

export async function ensureArchiveBucket(client, bucket, { provider } = {}) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { bucket, created: false, provider };
  } catch (err) {
    const missing = err?.name === 'NotFound'
      || err?.name === 'NoSuchBucket'
      || err?.$metadata?.httpStatusCode === 404;
    if (!missing) throw err;
  }

  try {
    const input = { Bucket: bucket };
    const region = provider === ARCHIVE_WASABI
      ? (process.env.WASABI_REGION || 'us-east-1')
      : (process.env.MINIO_REGION || process.env.AWS_REGION || 'ap-south-1');
    if (provider === ARCHIVE_WASABI && region && region !== 'us-east-1') {
      input.CreateBucketConfiguration = { LocationConstraint: region };
    }
    await client.send(new CreateBucketCommand(input));
  } catch (err) {
    if (!(err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists
      || err?.name === 'BucketAlreadyOwnedByYou' || err?.name === 'BucketAlreadyExists')) {
      throw err;
    }
  }
  return { bucket, created: true, provider };
}

/**
 * Put object to archive with MinIO→Wasabi fallback (and optional mirror).
 * @returns {{ writes: Array<{ provider, bucket, ok, error? }> }}
 */
export async function putArchiveObject({
  key,
  body,
  contentType,
  tenantId,
  metadata = {},
  targets = null,
}) {
  const list = targets || getArchiveTargets();
  if (!list.length) {
    throw new Error('No archive backend configured — set MinIO and/or Wasabi credentials');
  }

  const mirror = wasabiMirrorEnabled() && list.length > 1;
  const writes = [];

  if (mirror) {
    for (const t of list) {
      const bucket = t.getBucket(tenantId);
      try {
        await ensureArchiveBucket(t.client, bucket, { provider: t.name }).catch(() => {});
        await t.client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType || 'application/octet-stream',
          ContentLength: Buffer.isBuffer(body) ? body.length : undefined,
          Metadata: { ...metadata, archive_provider: t.name },
        }));
        writes.push({ provider: t.name, bucket, ok: true });
      } catch (err) {
        writes.push({ provider: t.name, bucket, ok: false, error: err.message });
        logger.error('[ImagingArchive] mirror put failed', { provider: t.name, key, error: err.message });
      }
    }
    if (!writes.some((w) => w.ok)) {
      throw new Error(`All archive backends failed: ${writes.map((w) => w.error).join('; ')}`);
    }
    return { writes };
  }

  let lastErr;
  for (const t of list) {
    const bucket = t.getBucket(tenantId);
    try {
      await ensureArchiveBucket(t.client, bucket, { provider: t.name }).catch(() => {});
      await t.client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
        ContentLength: Buffer.isBuffer(body) ? body.length : undefined,
        Metadata: { ...metadata, archive_provider: t.name },
      }));
      writes.push({ provider: t.name, bucket, ok: true });
      return { writes };
    } catch (err) {
      lastErr = err;
      writes.push({ provider: t.name, bucket, ok: false, error: err.message });
      logger.warn('[ImagingArchive] put failed, trying next backend', {
        provider: t.name,
        key,
        error: err.message,
      });
    }
  }
  throw lastErr || new Error('Archive put failed');
}

export function describeArchiveBackends() {
  return {
    minio: {
      configured: isMinioConfigured(),
      endpoint: process.env.MINIO_ENDPOINT || null,
      sharedBucket: process.env.MINIO_IMAGING_BUCKET || 'mediczy-imaging-archive',
    },
    wasabi: {
      configured: isWasabiConfigured(),
      endpoint: process.env.WASABI_ENDPOINT || null,
      region: process.env.WASABI_REGION || null,
      sharedBucket: sharedWasabiImagingBucket(),
      exampleTenantBucket: getWasabiImagingBucketForTenant(56),
    },
    mirror: wasabiMirrorEnabled(),
    strategy: wasabiMirrorEnabled()
      ? 'mirror-both'
      : (isMinioConfigured()
        ? (isWasabiConfigured() ? 'minio-then-wasabi-fallback' : 'minio-only')
        : (isWasabiConfigured() ? 'wasabi-only' : 'none')),
  };
}
