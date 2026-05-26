/**
 * Shared multer-s3 storage factory for mediczy-uploads bucket.
 *
 * Usage:
 *   import { s3Storage, s3FileUrl, s3PresignedUrl } from '../utils/s3-storage.js';
 *   const upload = multer({ storage: s3Storage('chat'), limits: { fileSize: 10_000_000 } });
 *
 * Uploaded files get:
 *   req.file.location  — public (or pre-signed) S3 URL
 *   req.file.key       — S3 object key  e.g. "chat/1748123456789-abc123.jpg"
 *   req.file.bucket    — "mediczy-uploads"
 */

import { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multerS3 from 'multer-s3';
import crypto from 'crypto';
import path from 'path';

const BUCKET = process.env.S3_UPLOADS_BUCKET || 'mediczy-uploads';
const REGION  = process.env.AWS_REGION         || 'ap-south-1';

export const s3Client = new S3Client({ region: REGION });

/**
 * Returns a multer-s3 storage engine scoped to a folder prefix.
 * @param {string} folder  e.g. 'chat' | 'imaging' | 'recording' | 'dicom' | 'ris' | 'whatsapp'
 */
export function s3Storage(folder) {
  return multerS3({
    s3: s3Client,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key(_req, file, cb) {
      const uid  = crypto.randomBytes(8).toString('hex');
      const ext  = path.extname(file.originalname) || '';
      cb(null, `${folder}/${Date.now()}-${uid}${ext}`);
    },
  });
}

/**
 * Generate a presigned GET URL (default 1 hour) for a private S3 object.
 * @param {string} key   S3 object key
 * @param {number} [expiresIn]  seconds (default 3600)
 */
export async function s3PresignedUrl(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, cmd, { expiresIn });
}

/** Direct HTTPS URL (only works if bucket/object is public — not recommended for PHI). */
export function s3FileUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export { BUCKET };
