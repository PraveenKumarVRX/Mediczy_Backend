/**
 * MinIO Upload Service with ClamAV Antivirus Scanning
 *
 * Centralised file upload: scan → upload to MinIO → return public URL.
 * Works with both multer (req.file.buffer / req.file.path) and
 * express-fileupload (req.files.file.data / .tempFilePath).
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getUploadsBucket, buildPublicFileUrl } from './s3-presign.service.js';

const execFileAsync = promisify(execFile);
const AV_ENABLED = process.env.AV_SCAN_ENABLED !== 'false'; // on by default

/**
 * Scan a file buffer or path with ClamAV daemon (clamdscan).
 * Returns { clean: boolean, detail: string }.
 */
async function scanFile(bufferOrPath) {
  if (!AV_ENABLED) return { clean: true, detail: 'AV scanning disabled' };

  let tmpPath = null;
  try {
    // If we got a buffer, write it to a temp file for clamdscan
    if (Buffer.isBuffer(bufferOrPath)) {
      tmpPath = `/tmp/av-scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      await fs.writeFile(tmpPath, bufferOrPath);
    } else {
      tmpPath = null; // don't delete the caller's file
    }

    const scanPath = tmpPath || bufferOrPath;

    const { stdout } = await execFileAsync('clamdscan', ['--no-summary', '--infected', scanPath], {
      timeout: 30000, // 30s max
    });

    // clamdscan returns exit code 0 for clean, 1 for infected
    return { clean: true, detail: stdout.trim() };
  } catch (err) {
    // Exit code 1 = virus found
    if (err.code === 1) {
      const detail = (err.stdout || '').trim();
      console.error(`🦠 AV ALERT: Infected file detected — ${detail}`);
      return { clean: false, detail };
    }
    // Exit code 2 = error (daemon not running, etc.)
    console.error('⚠️ AV scan error (allowing upload):', err.message);
    return { clean: true, detail: `AV scan error: ${err.message}` };
  } finally {
    // Clean up temp scan file
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
}

/**
 * Upload a file to MinIO with AV scanning.
 *
 * @param {Object} opts
 * @param {Buffer}  opts.buffer      - File buffer (from multer memoryStorage or express-fileupload .data)
 * @param {string} [opts.filePath]   - File on disk (from multer diskStorage) — used if no buffer
 * @param {string}  opts.originalName - Original filename
 * @param {string}  opts.mimeType    - MIME type
 * @param {string}  opts.keyPrefix   - S3 key prefix, e.g. 'health-reports/corp-5/emp-110'
 * @param {string} [opts.bucket]     - Override bucket (default: S3_UPLOADS_BUCKET / web-uploads)
 * @returns {Promise<{ success: boolean, url: string, key: string, size: number, avResult: object }>}
 */
export async function uploadToMinio({ buffer, filePath, originalName, mimeType, keyPrefix, bucket }) {
  // 1. Determine scan target — scan directly on disk when possible (avoids loading GB files into RAM)
  const scanTarget = buffer || filePath;
  if (!scanTarget) {
    throw new Error('No file data provided (buffer or filePath required)');
  }

  // 2. Antivirus scan
  const avResult = await scanFile(scanTarget);
  if (!avResult.clean) {
    throw Object.assign(
      new Error(`File rejected: malware detected — ${avResult.detail}`),
      { code: 'MALWARE_DETECTED', avResult }
    );
  }

  // 3. Build S3 key
  const safeName = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const s3Key = `${keyPrefix.replace(/\/$/, '')}/${Date.now()}_${randomSuffix}_${safeName}`;

  // 4. Upload to MinIO — stream from disk for large files, use buffer for small ones
  const resolvedBucket = bucket || getUploadsBucket() || 'web-uploads';
  const s3 = getS3Client();

  let body, fileSize;
  if (buffer) {
    body = buffer;
    fileSize = buffer.length;
  } else {
    const { createReadStream } = await import('fs');
    const stat = await fs.stat(filePath);
    body = createReadStream(filePath);
    fileSize = stat.size;
  }

  await s3.send(new PutObjectCommand({
    Bucket: resolvedBucket,
    Key: s3Key,
    Body: body,
    ContentType: mimeType,
    ContentLength: fileSize,
    ContentDisposition: `inline; filename="${safeName}"`,
  }));

  // 5. Build public URL
  const publicUrl = buildPublicFileUrl(s3Key, resolvedBucket);

  return {
    success: true,
    url: publicUrl,
    key: s3Key,
    bucket: resolvedBucket,
    size: fileSize,
    avResult,
  };
}

/**
 * Convenience: scan only (no upload). Use for temp/processing uploads
 * where the file is deleted after use (scribe, vision, etc.).
 */
export async function scanOnly(bufferOrPath) {
  return scanFile(bufferOrPath);
}

export default { uploadToMinio, scanOnly };
