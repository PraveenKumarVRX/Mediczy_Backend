/**
 * Shared multer-s3 storage for uploads.
 *
 * Imaging / DICOM / RIS → S3_IMAGING_DAILY_BUCKET (hot daily store), else S3_UPLOADS_BUCKET.
 * Tenant segregation (default): key prefix
 *   {folder}/tenant-{id}/YYYY/MM/DD/{timestamp}-{uid}{ext}
 *
 * Nightly job copies those objects to MinIO (imaging-daily-minio-transfer.service.js).
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

const IMAGING_PREFIXES = new Set(['dicom', 'imaging', 'ris']);

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
});

export function getUploadsBucket() {
  return process.env.S3_UPLOADS_BUCKET || 'mediczy-uploads';
}

/** Dedicated hot bucket for clinical imaging. */
export function getImagingDailyBucket() {
  return (
    process.env.S3_IMAGING_DAILY_BUCKET
    || process.env.S3_UPLOADS_BUCKET
    || 'mediczy-imaging-daily'
  );
}

export function getS3Region() {
  return process.env.AWS_REGION || 'ap-south-1';
}

/** Resolve which bucket holds a key based on its top-level prefix. */
export function resolveBucketForKey(key) {
  const prefix = String(key || '').split('/')[0];
  if (IMAGING_PREFIXES.has(prefix)) return getImagingDailyBucket();
  return getUploadsBucket();
}

/**
 * Normalize a tenant id for object-key segments.
 * @returns {string} e.g. "tenant-56" or "tenant-unknown"
 */
export function tenantKeySegment(tenantId) {
  if (tenantId == null || tenantId === '') return 'tenant-unknown';
  const raw = String(tenantId).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!raw) return 'tenant-unknown';
  return raw.startsWith('tenant-') ? raw : `tenant-${raw}`;
}

/**
 * Pull tenant/lab/hospital id from an authenticated request.
 */
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

/**
 * Build a tenant-segregated imaging object key.
 * Example: dicom/tenant-56/2026/07/30/1785427019815-a1b2c3d4.dcm
 */
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

/** Prefix used to list one tenant’s objects under a folder. */
export function imagingTenantPrefix(folder, tenantId) {
  return `${folder}/${tenantKeySegment(tenantId)}/`;
}

/**
 * Returns a multer-s3 storage engine scoped to a folder prefix.
 * Imaging folders embed tenant + UTC date in the key for segregation.
 *
 * @param {string} folder  e.g. 'chat' | 'imaging' | 'recording' | 'dicom' | 'ris'
 * @param {{ resolveTenant?: (req) => any }} [opts]
 */
export function s3Storage(folder, opts = {}) {
  const bucket = IMAGING_PREFIXES.has(folder) ? getImagingDailyBucket() : getUploadsBucket();
  const resolveTenant = opts.resolveTenant || resolveTenantIdFromReq;

  return multerS3({
    s3: s3Client,
    bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    serverSideEncryption: 'AES256',
    key(req, file, cb) {
      try {
        if (IMAGING_PREFIXES.has(folder)) {
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

/**
 * Generate a presigned GET URL (default 1 hour).
 * Tries imaging-daily bucket first for imaging prefixes, then uploads (legacy).
 */
export async function s3PresignedUrl(key, expiresIn = 3600) {
  const primary = resolveBucketForKey(key);
  const uploads = getUploadsBucket();
  const candidates = primary === uploads ? [primary] : [primary, uploads];
  let lastErr;
  for (const bucket of candidates) {
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(s3Client, cmd, { expiresIn });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Object not found: ${key}`);
}

/** Stream DICOM/object bytes from S3 for WADO-RS (daily bucket, then legacy uploads). */
export async function s3GetObjectBuffer(key) {
  const primary = resolveBucketForKey(key);
  const uploads = getUploadsBucket();
  const candidates = primary === uploads ? [primary] : [primary, uploads];
  let lastErr;
  for (const bucket of candidates) {
    try {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const res = await s3Client.send(cmd);
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Object not found: ${key}`);
}

export function s3FileUrl(key) {
  const bucket = resolveBucketForKey(key);
  return `https://${bucket}.s3.${getS3Region()}.amazonaws.com/${key}`;
}

/** @deprecated use getImagingDailyBucket() — kept for RIS imports */
export const BUCKET = process.env.S3_IMAGING_DAILY_BUCKET
  || process.env.S3_UPLOADS_BUCKET
  || 'mediczy-imaging-daily';

export { getS3Region as S3_REGION };
