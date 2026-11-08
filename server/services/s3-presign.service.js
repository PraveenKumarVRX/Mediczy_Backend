import crypto from 'crypto';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Region0 = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';

// Web-upload storage backend precedence:
//   1. UPLOADS_S3_* — a dedicated S3-compatible store (e.g. iDrive e2). Uses its OWN env vars so
//      it never clobbers MINIO_* (the live local MinIO) or the PACS config; its presigned URLs are
//      browser-reachable with no Cloudflare-tunnel dependency.
//   2. PACS MinIO (legacy) when UPLOADS_MINIO_BACKEND=pacs and a PACS endpoint is set.
//   3. The default MINIO_* endpoint.
//   4. Native AWS S3 (no endpoint).
const useUploadsS3 = !!process.env.UPLOADS_S3_ENDPOINT;
const usePacsUploads = !useUploadsS3
  && (process.env.UPLOADS_MINIO_BACKEND || 'pacs').toLowerCase() === 'pacs'
  && !!process.env.PACS_ARCHIVE_MINIO_ENDPOINT;

const s3Region = useUploadsS3 ? (process.env.UPLOADS_S3_REGION || s3Region0) : s3Region0;

const s3Bucket = useUploadsS3
  ? (process.env.UPLOADS_S3_BUCKET || process.env.S3_UPLOADS_BUCKET)
  : usePacsUploads
    ? (process.env.PACS_ARCHIVE_MINIO_BUCKET || process.env.S3_UPLOADS_BUCKET)
    : process.env.S3_UPLOADS_BUCKET;
const s3RecordingsBucket = process.env.S3_RECORDINGS_BUCKET || s3Bucket;
const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
const presignExpiresIn = Number(process.env.S3_PRESIGN_EXPIRES || 300);
const minioEndpoint = useUploadsS3
  ? process.env.UPLOADS_S3_ENDPOINT
  : usePacsUploads ? process.env.PACS_ARCHIVE_MINIO_ENDPOINT : process.env.MINIO_ENDPOINT;
// Public-facing URL (may differ from internal endpoint for localhost setups)
const minioPublicUrl = process.env.MINIO_PUBLIC_URL || minioEndpoint;

// Build S3Client config — adds the endpoint + path-style when a custom endpoint is set
const s3Config = { region: usePacsUploads ? (process.env.PACS_ARCHIVE_MINIO_REGION || s3Region) : s3Region };
if (minioEndpoint) {
  s3Config.endpoint = minioEndpoint;
  s3Config.forcePathStyle = true;
  s3Config.credentials = useUploadsS3
    ? { accessKeyId: process.env.UPLOADS_S3_ACCESS_KEY, secretAccessKey: process.env.UPLOADS_S3_SECRET_KEY }
    : usePacsUploads
      ? { accessKeyId: process.env.PACS_ARCHIVE_MINIO_ACCESS_KEY, secretAccessKey: process.env.PACS_ARCHIVE_MINIO_SECRET_KEY }
      : { accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin', secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin' };
}

const s3Client = new S3Client(s3Config);

const sanitizeFileName = (fileName) => {
  const baseName = path.basename(fileName || 'file');
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
};

const buildTenantSegment = (tenantId) => {
  if (!tenantId) {
    return 'tenant-unknown';
  }
  return `tenant-${tenantId}`;
};

const buildPublicUrl = (bucket, region, key, publicBaseUrl) => {
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
  if (minioPublicUrl) {
    return `${minioPublicUrl.replace(/\/$/, '')}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const buildPrefixedKey = ({ prefix, fileName, tenantId, userId }) => {
  const safeName = sanitizeFileName(fileName);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tenantSegment = buildTenantSegment(tenantId);
  return `${prefix}/${tenantSegment}/${userId}/${Date.now()}_${randomSuffix}_${safeName}`;
};

export const buildReportKeyPrefix = (tenantId, userId) => {
  const tenantSegment = buildTenantSegment(tenantId);
  return `uploads/reports/${tenantSegment}/${userId}/`;
};

export const buildProfileKeyPrefix = (tenantId, userId) => {
  const tenantSegment = buildTenantSegment(tenantId);
  return `uploads/profiles/${tenantSegment}/${userId}/`;
};

export const buildDoctorMediaKeyPrefix = (tenantId, doctorId, mediaType) => {
  const tenantSegment = buildTenantSegment(tenantId);
  return `uploads/doctors/${tenantSegment}/${doctorId}/${mediaType}/`;
};

export const buildChatKeyPrefix = (tenantId, userId, roomId = 'general') => {
  const tenantSegment = buildTenantSegment(tenantId);
  return `uploads/chat/${tenantSegment}/${roomId}/${userId}/`;
};

export const buildRecordingKeyPrefix = (tenantId, doctorId, recordingId = 'session') => {
  const tenantSegment = buildTenantSegment(tenantId);
  return `uploads/recordings/${tenantSegment}/${doctorId}/${recordingId}/`;
};

export const getUploadsBucket = () => s3Bucket;

export const getS3Client = () => s3Client;

export const getRecordingsBucket = () => s3RecordingsBucket;

export const getUploadsRegion = () => s3Region;

export const buildPublicFileUrl = (key, bucketOverride) => {
  const bucket = bucketOverride || s3Bucket;
  if (!bucket) {
    throw new Error('S3_UPLOADS_BUCKET is not set');
  }
  return buildPublicUrl(bucket, s3Region, key, s3PublicBaseUrl);
};

export const createPresignedUpload = async ({
  bucket,
  keyPrefix,
  fileName,
  contentType,
  tenantId,
  userId,
  metadata = {}
}) => {
  const resolvedBucket = bucket || s3Bucket;
  if (!resolvedBucket) {
    throw new Error('S3_UPLOADS_BUCKET is not set');
  }

  const objectKey = buildPrefixedKey({
    prefix: keyPrefix,
    fileName,
    tenantId,
    userId
  });

  const command = new PutObjectCommand({
    Bucket: resolvedBucket,
    Key: objectKey,
    ContentType: contentType,
    Metadata: {
      tenant_id: tenantId ? String(tenantId) : 'unknown',
      user_id: String(userId),
      ...metadata
    }
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: presignExpiresIn });

  return {
    uploadUrl,
    fileKey: objectKey,
    fileUrl: buildPublicUrl(resolvedBucket, s3Region, objectKey, s3PublicBaseUrl),
    bucket: resolvedBucket,
    region: s3Region,
    expiresIn: presignExpiresIn
  };
};

export const createReportUploadPresign = async ({ tenantId, userId, fileName, contentType, reportType }) => {
  const keyPrefix = buildReportKeyPrefix(tenantId, userId).replace(/\/$/, '');
  return createPresignedUpload({
    keyPrefix,
    fileName,
    contentType,
    tenantId,
    userId,
    metadata: { report_type: reportType || 'general' }
  });
};
