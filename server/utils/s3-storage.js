/**
 * Shared multer-s3 storage for uploads.
 *
 * Imaging keys (always tenant-scoped):
 *   {folder}/tenant-{id}/YYYY/MM/DD/{timestamp}-{uid}{ext}
 *
 * Bucket selection depends on IMAGING_TENANT_ISOLATION — see imaging-tenant-storage.service.js
 */

import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multerS3 from 'multer-s3';
import crypto from 'crypto';
import path from 'path';
import {
  getImagingDailyBucketForTenant,
  resolveImagingBucketFromKey,
  sharedImagingDailyBucket,
  tenantKeySegment as tenantSeg,
  parseTenantIdFromKey,
  ensureTenantImagingStorage,
} from '../services/imaging/imaging-tenant-storage.service.js';

const IMAGING_PREFIXES = new Set(['dicom', 'imaging', 'ris']);

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
});

// DICOM/imaging objects live on the dedicated on-prem PACS MinIO — the same instance
// Orthanc's own AwsS3Storage plugin writes to — not on AWS S3. Kept as a separate client
// (different endpoint, credentials, and path-style addressing) from the general s3Client
// above, which non-imaging uploads (prescriptions, chat attachments, etc.) still use.
export function isPacsMinioConfigured() {
  return Boolean(process.env.PACS_MINIO_ENDPOINT && process.env.PACS_MINIO_ACCESS_KEY);
}

export const pacsMinioClient = isPacsMinioConfigured()
  ? new S3Client({
      region: process.env.PACS_MINIO_REGION || 'us-east-1',
      endpoint: process.env.PACS_MINIO_ENDPOINT,
      // MinIO needs path-style; real AWS S3 (used as a stopgap while MinIO is
      // down, see server/.env PACS_MINIO_* comment) needs virtual-hosted-style
      // for buckets created after 2020 outside us-east-1 — path-style requests
      // to those get rejected, which is what surfaced this as an XML
      // deserialization error rather than a clean auth/config failure.
      forcePathStyle: String(process.env.PACS_MINIO_FORCE_PATH_STYLE ?? 'true') === 'true',
      credentials: {
        accessKeyId: process.env.PACS_MINIO_ACCESS_KEY,
        secretAccessKey: process.env.PACS_MINIO_SECRET_KEY,
      },
    })
  : null;

export function getPacsMinioBucket() {
  return process.env.PACS_MINIO_BUCKET || 'pacs-entity-001';
}

export function getUploadsBucket() {
  return process.env.S3_UPLOADS_BUCKET || 'mediczy-uploads';
}

export function getImagingDailyBucket(tenantId = null) {
  if (pacsMinioClient) return getPacsMinioBucket();
  if (tenantId != null) return getImagingDailyBucketForTenant(tenantId);
  return sharedImagingDailyBucket();
}

/** Client to use for a given object key — pacs-minio for imaging keys when configured. */
function clientForKey(key) {
  const prefix = String(key || '').split('/')[0];
  if (pacsMinioClient && IMAGING_PREFIXES.has(prefix)) return pacsMinioClient;
  return s3Client;
}

export function getS3Region() {
  return process.env.AWS_REGION || 'ap-south-1';
}

export function tenantKeySegment(tenantId) {
  return tenantSeg(tenantId);
}

export function resolveTenantIdFromReq(req) {
  return (
    req?.tenantId
    || req?.userTenantId
    || req?.user?.tenantId
    || req?.user?.tenant_id
    || req?.user?.hospitalId
    || req?.user?.hospital_id
    || req?.user?.organization_id
    || req?.lab?.id
    || req?.lab?.tenantId
    || req?.user?.id
    || null
  );
}

export function buildImagingObjectKey({
  folder,
  tenantId,
  originalName = '',
  at = new Date(),
} = {}) {
  const safeFolder = String(folder || 'imaging').replace(/[^a-z0-9_-]/gi, '') || 'imaging';
  const tenant = tenantKeySegment(tenantId);
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(at.getUTCDate()).padStart(2, '0');
  const uid = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName || '') || '';
  return `${safeFolder}/${tenant}/${yyyy}/${mm}/${dd}/${Date.now()}-${uid}${ext}`;
}

export function imagingTenantPrefix(folder, tenantId) {
  return `${folder}/${tenantKeySegment(tenantId)}/`;
}

/** Resolve which bucket holds a key. */
export function resolveBucketForKey(key) {
  const prefix = String(key || '').split('/')[0];
  if (IMAGING_PREFIXES.has(prefix)) {
    return pacsMinioClient ? getPacsMinioBucket() : resolveImagingBucketFromKey(key);
  }
  return getUploadsBucket();
}

/**
 * @param {string} folder
 * @param {{ resolveTenant?: (req) => any }} [opts]
 */
export function s3Storage(folder, opts = {}) {
  const resolveTenant = opts.resolveTenant || resolveTenantIdFromReq;
  const isImaging = IMAGING_PREFIXES.has(folder);
  const usePacsMinio = isImaging && Boolean(pacsMinioClient);

  return multerS3({
    s3: usePacsMinio ? pacsMinioClient : s3Client,
    bucket(req, _file, cb) {
      try {
        if (!isImaging) return cb(null, getUploadsBucket());
        if (usePacsMinio) return cb(null, getPacsMinioBucket());
        const tid = resolveTenant(req);
        // Fire-and-forget ensure (idempotent); don't block key generation on slow CreateBucket
        ensureTenantImagingStorage(tid).catch(() => {});
        cb(null, getImagingDailyBucketForTenant(tid));
      } catch (err) {
        cb(err);
      }
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    // pacs-minio isn't confirmed to have SSE-S3/KMS configured (Orthanc's own writes to
    // this same bucket don't request it); AWS S3 always supports it for non-imaging uploads.
    ...(usePacsMinio ? {} : { serverSideEncryption: 'AES256' }),
    key(req, file, cb) {
      try {
        if (isImaging) {
          cb(null, buildImagingObjectKey({
            folder,
            tenantId: resolveTenant(req),
            originalName: file.originalname,
          }));
          return;
        }
        const uid = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname) || '';
        cb(null, `${folder}/${Date.now()}-${uid}${ext}`);
      } catch (err) {
        cb(err);
      }
    },
  });
}

/** (bucket, client) candidates for a key — pacs-minio first for imaging keys (where
 * everything now actually lives), legacy AWS S3 locations as a fallback safety net for
 * anything not yet migrated. */
function candidatesForKey(key) {
  const client = clientForKey(key);
  const primary = resolveBucketForKey(key);
  const uploads = getUploadsBucket();
  const shared = sharedImagingDailyBucket();
  const tid = parseTenantIdFromKey(key);
  const seen = new Set();
  const out = [];
  const add = (bucket, c) => {
    if (!bucket || seen.has(`${c === s3Client ? 'aws' : 'minio'}:${bucket}`)) return;
    seen.add(`${c === s3Client ? 'aws' : 'minio'}:${bucket}`);
    out.push({ bucket, client: c });
  };
  add(primary, client);
  if (client !== s3Client) {
    // Legacy AWS S3 fallback for imaging keys uploaded before the pacs-minio switch.
    add(shared, s3Client);
    add(uploads, s3Client);
    if (tid) add(getImagingDailyBucketForTenant(tid), s3Client);
  }
  return out;
}

async function tryBuckets(key, fn) {
  const candidates = candidatesForKey(key);
  let lastErr;
  for (const { bucket, client } of candidates) {
    try {
      return await fn(bucket, client);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Object not found: ${key}`);
}

export async function s3PresignedUrl(key, expiresIn = 3600) {
  return tryBuckets(key, async (bucket, client) => {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, cmd, { expiresIn });
  });
}

export async function s3GetObjectBuffer(key) {
  return tryBuckets(key, async (bucket, client) => {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await client.send(cmd);
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  });
}

export function s3FileUrl(key) {
  const bucket = resolveBucketForKey(key);
  return `https://${bucket}.s3.${getS3Region()}.amazonaws.com/${key}`;
}

export const BUCKET = sharedImagingDailyBucket();
export { getS3Region as S3_REGION, parseTenantIdFromKey };
