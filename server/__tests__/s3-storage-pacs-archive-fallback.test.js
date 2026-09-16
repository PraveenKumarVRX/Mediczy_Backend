process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'ap-south-1';
process.env.PACS_MINIO_ENDPOINT = 'https://s3.ap-south-1.amazonaws.com';
process.env.PACS_MINIO_REGION = 'ap-south-1';
process.env.PACS_MINIO_FORCE_PATH_STYLE = 'false';
process.env.PACS_MINIO_ACCESS_KEY = 'hot-key';
process.env.PACS_MINIO_SECRET_KEY = 'hot-secret';
process.env.PACS_MINIO_BUCKET = 'mediczy-pacs-storage';
process.env.PACS_ARCHIVE_MINIO_ENDPOINT = 'https://minio-pacs.example';
process.env.PACS_ARCHIVE_MINIO_ACCESS_KEY = 'archive-key';
process.env.PACS_ARCHIVE_MINIO_SECRET_KEY = 'archive-secret';
process.env.PACS_ARCHIVE_MINIO_BUCKET = 'pacs-entity-001';
process.env.S3_UPLOADS_BUCKET = 'mediczy-uploads';

import { describe, expect, it, jest } from '@jest/globals';

const calls = [];

class GetObjectCommand {
  constructor(input) { this.input = input; }
}
class HeadObjectCommand {
  constructor(input) { this.input = input; }
}
class CreateBucketCommand {
  constructor(input) { this.input = input; }
}
class HeadBucketCommand {
  constructor(input) { this.input = input; }
}
class PutBucketEncryptionCommand {
  constructor(input) { this.input = input; }
}
class PutPublicAccessBlockCommand {
  constructor(input) { this.input = input; }
}
class BucketAlreadyOwnedByYou extends Error {}
class BucketAlreadyExists extends Error {}

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn((config = {}) => ({
    config,
    send: async (cmd) => {
      calls.push({ cmd, config });
      if (cmd instanceof GetObjectCommand) {
        if (cmd.input.Bucket === 'mediczy-pacs-storage') {
          throw new Error('NoSuchKey');
        }
        if (cmd.input.Bucket === 'pacs-entity-001') {
          return {
            Body: (async function* body() {
              yield Buffer.from('archived-dicom');
            })(),
          };
        }
      }
      if (cmd instanceof HeadObjectCommand && cmd.input.Bucket === 'pacs-entity-001') {
        return { ContentLength: 14 };
      }
      throw new Error(`unexpected ${cmd.constructor.name} ${cmd.input.Bucket}`);
    },
  })),
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketEncryptionCommand,
  PutPublicAccessBlockCommand,
}));

jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async (_client, cmd) => `signed://${cmd.input.Bucket}/${cmd.input.Key}`),
}));

jest.unstable_mockModule('multer-s3', () => ({
  default: Object.assign(jest.fn(), { AUTO_CONTENT_TYPE: 'auto' }),
}));

const {
  getPacsArchiveMinioBucket,
  resolveBucketForKey,
  s3GetObjectBuffer,
  s3PresignedUrl,
} = await import('../utils/s3-storage.js');

describe('s3-storage PACS archive fallback', () => {
  it('reads DICOM objects from pacs-minio after the hot S3 copy is deleted', async () => {
    const buf = await s3GetObjectBuffer('dicom/tenant-2433/2026/09/11/study.dcm');

    expect(buf.toString()).toBe('archived-dicom');
    expect(resolveBucketForKey('dicom/tenant-2433/2026/09/11/study.dcm')).toBe('mediczy-pacs-storage');
    expect(getPacsArchiveMinioBucket()).toBe('pacs-entity-001');
    expect(calls.map((c) => c.cmd.input.Bucket)).toEqual(['mediczy-pacs-storage', 'pacs-entity-001']);
  });

  it('can generate a MinIO signed URL when hot S3 no longer has a flat Orthanc object', async () => {
    calls.length = 0;
    const url = await s3PresignedUrl('ff45fa68-6fbf-46e5-8858-193be562c635.dcm');

    expect(url).toBe('signed://pacs-entity-001/ff45fa68-6fbf-46e5-8858-193be562c635.dcm');
    expect(calls.map((c) => c.cmd.input.Bucket)).toEqual(['mediczy-pacs-storage', 'pacs-entity-001']);
  });
});
