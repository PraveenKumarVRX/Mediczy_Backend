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

export function getUploadsBucket() {
  return process.env.S3_UPLOADS_BUCKET || 'mediczy-uploads';
}

export function getImagingDailyBucket(tenantId = null) {
  if (tenantId != null) return getImagingDailyBucketForTenant(tenantId);
  return sharedImagingDailyBucket();
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
  if (IMAGING_PREFIXES.has(prefix)) return resolveImagingBucketFromKey(key);
  return getUploadsBucket();
}

/**
 * @param {string} folder
 * @param {{ resolveTenant?: (req) => any }} [opts]
 */
export function s3Storage(folder, opts = {}) {
  const resolveTenant = opts.resolveTenant || resolveTenantIdFromReq;
  const isImaging = IMAGING_PREFIXES.has(folder);

  return multerS3({
    s3: s3Client,
    bucket(req, _file, cb) {
      try {
        if (!isImaging) return cb(null, getUploadsBucket());
        const tid = resolveTenant(req);
        // Fire-and-forget ensure (idempotent); don't block key generation on slow CreateBucket
        ensureTenantImagingStorage(tid).catch(() => {});
        cb(null, getImagingDailyBucketForTenant(tid));
      } catch (err) {
        cb(err);
      }
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    serverSideEncryption: 'AES256',
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

async function tryBuckets(key, fn) {
  const primary = resolveBucketForKey(key);
  const uploads = getUploadsBucket();
  const shared = sharedImagingDailyBucket();
  const tid = parseTenantIdFromKey(key);
  const candidates = [...new Set([
    primary,
    shared,
    uploads,
    tid ? getImagingDailyBucketForTenant(tid) : null,
  ].filter(Boolean))];

  let lastErr;
  for (const bucket of candidates) {
    try {
      return await fn(bucket);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Object not found: ${key}`);
}

export async function s3PresignedUrl(key, expiresIn = 3600) {
  return tryBuckets(key, async (bucket) => {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3Client, cmd, { expiresIn });
  });
}

export async function s3GetObjectBuffer(key) {
  return tryBuckets(key, async (bucket) => {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3Client.send(cmd);
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
