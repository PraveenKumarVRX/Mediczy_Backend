/**
 * Shared multer-s3 storage for uploads.
 *
 * Imaging / DICOM / RIS → S3_IMAGING_DAILY_BUCKET (hot daily store), else S3_UPLOADS_BUCKET.
 * Nightly job copies those objects to MinIO (see imaging-daily-minio-transfer.service.js).
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
 * Returns a multer-s3 storage engine scoped to a folder prefix.
 * @param {string} folder  e.g. 'chat' | 'imaging' | 'recording' | 'dicom' | 'ris' | 'whatsapp'
 */
export function s3Storage(folder) {
  const bucket = IMAGING_PREFIXES.has(folder) ? getImagingDailyBucket() : getUploadsBucket();
  return multerS3({
    s3: s3Client,
    bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    serverSideEncryption: 'AES256',
    key(_req, file, cb) {
      const uid = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname) || '';
      cb(null, `${folder}/${Date.now()}-${uid}${ext}`);
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
