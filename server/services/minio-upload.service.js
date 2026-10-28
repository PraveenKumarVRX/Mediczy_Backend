/**
 * MinIO Upload Service with ClamAV Antivirus Scanning
 *
 * Centralised file upload: scan → upload to MinIO → return public URL.
 * Works with both multer (req.file.buffer / req.file.path) and
 * express-fileupload (req.files.file.data / .tempFilePath).
 *
 * Optional AES-256-GCM encryption and image/doc compression for reports.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import zlib from 'zlib';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getUploadsBucket, buildPublicFileUrl } from './s3-presign.service.js';

const execFileAsync = promisify(execFile);
const AV_ENABLED = process.env.AV_SCAN_ENABLED !== 'false'; // on by default
// Scanner errors (daemon down, unreadable file, timeout) reject the upload unless
// AV_SCAN_FAIL_OPEN=true, an explicit emergency-only override. Before 2026-10-08 every
// scanner error was silently treated as "clean" and the flag in server/.env was ignored.
const AV_SCAN_FAIL_OPEN = process.env.AV_SCAN_FAIL_OPEN === 'true';

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
      await fs.writeFile(tmpPath, bufferOrPath, {mode:0o600});
    } else {
      tmpPath = null; // don't delete the caller's file
    }

    const scanPath = tmpPath || bufferOrPath;

    // --fdpass hands clamd an open descriptor, so it can scan files it has no
    // permission to read by path (clamd runs as the clamav user; multer temp files are ours).
    const { stdout } = await execFileAsync('clamdscan', ['--fdpass', '--no-summary', '--infected', scanPath], {
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
    // Exit code 2 / spawn failure / timeout = scanner could not give a verdict
    if (AV_SCAN_FAIL_OPEN) {
      console.error('⚠️ AV scan error (AV_SCAN_FAIL_OPEN override active, allowing upload):', err.message);
      return { clean: true, detail: `AV scan error: ${err.message}` };
    }
    console.error('⚠️ AV scan unavailable (rejecting upload):', err.message);
    throw Object.assign(new Error('Antivirus scanning is temporarily unavailable'), {
      code: 'AV_SCAN_UNAVAILABLE',
      status: 503,
      statusCode: 503,
      cause: err,
    });
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
export async function uploadToMinio({ buffer, filePath, originalName, mimeType, keyPrefix, bucket, client, buildUrl }) {
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
  const s3 = client || getS3Client();

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
  const publicUrl = (buildUrl || buildPublicFileUrl)(s3Key, resolvedBucket);

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

// ─────────────────────────────────────────────────────────────────
// Report Encryption (AES-256-GCM) + Compression (gzip / sharp)
// ─────────────────────────────────────────────────────────────────

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_HEX) throw new Error('ENCRYPTION_KEY not set in environment');
  // server/.env has a 64-char hex key → 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
    return Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
  }
  // Fallback: derive 32 bytes via SHA-256 if not hex
  return crypto.createHash('sha256').update(ENCRYPTION_KEY_HEX).digest();
}

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif'
]);

/**
 * Compress a file buffer based on its MIME type.
 * - Images: resize to max 1920px (longest side) + JPEG/WebP quality 80
 * - Other files (PDF, DOCX, etc.): gzip
 * Returns { buffer, mimeType, compressedSize, originalSize, method }
 */
export async function compressFile(buffer, mimeType) {
  const originalSize = buffer.length;

  if (IMAGE_MIMES.has(mimeType)) {
    try {
      const sharp = (await import('sharp')).default;
      const compressed = await sharp(buffer)
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      // Only use compressed version if it's actually smaller
      if (compressed.length < originalSize) {
        return {
          buffer: compressed,
          mimeType: 'image/jpeg',
          compressedSize: compressed.length,
          originalSize,
          method: 'sharp-jpeg'
        };
      }
    } catch (err) {
      console.warn('⚠️ Image compression failed, using original:', err.message);
    }
    return { buffer, mimeType, compressedSize: originalSize, originalSize, method: 'none' };
  }

  // Non-image: gzip
  const gzipAsync = promisify(zlib.gzip);
  const compressed = await gzipAsync(buffer, { level: 6 });
  if (compressed.length < originalSize) {
    return {
      buffer: compressed,
      mimeType,      // keep original mime; we track compression via metadata
      compressedSize: compressed.length,
      originalSize,
      method: 'gzip'
    };
  }
  return { buffer, mimeType, compressedSize: originalSize, originalSize, method: 'none' };
}

/**
 * Encrypt a buffer with AES-256-GCM.
 * Returns { encrypted: Buffer, iv: string (hex), authTag: string (hex) }
 */
export function encryptBuffer(buffer) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt a buffer with AES-256-GCM.
 */
export function decryptBuffer(encryptedBuffer, ivHex, authTagHex) {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

/**
 * Upload a report with compression + encryption.
 * Flow: AV scan → compress → encrypt → upload to MinIO
 *
 * Returns { url, key, bucket, size, originalSize, compressedSize, encryption: { iv, authTag }, compressionMethod, avResult }
 */
export async function uploadEncryptedReport({ buffer, originalName, mimeType, keyPrefix, bucket, client, buildUrl }) {
  if (!buffer) throw new Error('Buffer required for encrypted report upload');

  // 1. AV scan
  const avResult = await scanFile(buffer);
  if (!avResult.clean) {
    throw Object.assign(
      new Error(`File rejected: malware detected — ${avResult.detail}`),
      { code: 'MALWARE_DETECTED', avResult }
    );
  }

  // 2. Compress
  const compressed = await compressFile(buffer, mimeType);

  // 3. Encrypt
  const { encrypted, iv, authTag } = encryptBuffer(compressed.buffer);

  // 4. Build S3 key — add .enc suffix to signal encrypted
  const safeName = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const s3Key = `${keyPrefix.replace(/\/$/, '')}/${Date.now()}_${randomSuffix}_${safeName}.enc`;

  // 5. Upload encrypted blob to MinIO
  const resolvedBucket = bucket || getUploadsBucket() || 'web-uploads';
  const s3 = client || getS3Client();

  await s3.send(new PutObjectCommand({
    Bucket: resolvedBucket,
    Key: s3Key,
    Body: encrypted,
    ContentType: 'application/octet-stream', // encrypted blob, not the original MIME
    ContentLength: encrypted.length,
  }));

  const publicUrl = (buildUrl || buildPublicFileUrl)(s3Key,resolvedBucket);

  return {
    success: true,
    url: publicUrl,
    key: s3Key,
    bucket: resolvedBucket,
    size: encrypted.length,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
    storedMimeType: compressed.mimeType,
    encryption: { iv, authTag },
    compressionMethod: compressed.method,
    avResult,
  };
}

/**
 * Download and decrypt an encrypted report from MinIO.
 * Returns { buffer, mimeType }
 */
export async function downloadDecryptedReport({ key, bucket, iv, authTag, compressionMethod, mimeType, client }) {
  const resolvedBucket = bucket || getUploadsBucket() || 'web-uploads';
  const s3 = client || getS3Client();

  const resp = await s3.send(new GetObjectCommand({
    Bucket: resolvedBucket,
    Key: key,
  }));

  // Collect stream into buffer
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  const encryptedBuffer = Buffer.concat(chunks);

  // Decrypt
  const decrypted = decryptBuffer(encryptedBuffer, iv, authTag);

  // Decompress if needed
  let finalBuffer = decrypted;
  if (compressionMethod === 'gzip') {
    const gunzipAsync = promisify(zlib.gunzip);
    finalBuffer = await gunzipAsync(decrypted);
  }

  return { buffer: finalBuffer, mimeType };
}

export default { uploadToMinio, scanOnly, uploadEncryptedReport, downloadDecryptedReport, compressFile, encryptBuffer, decryptBuffer };
