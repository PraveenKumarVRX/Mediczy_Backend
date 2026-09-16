process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'ap-south-1';
process.env.PACS_MINIO_BUCKET = 'mediczy-pacs-storage';
process.env.PACS_ARCHIVE_MINIO_ENDPOINT = 'https://minio-pacs.example';
process.env.PACS_ARCHIVE_MINIO_ACCESS_KEY = 'archive-key';
process.env.PACS_ARCHIVE_MINIO_SECRET_KEY = 'archive-secret';
process.env.PACS_ARCHIVE_MINIO_BUCKET = 'pacs-entity-001';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSend = jest.fn();
const mockQuery = jest.fn(async () => ({ rows: [] }));
const mockHandleOrthancNewInstance = jest.fn(async () => ({ success: true }));

class ListObjectsV2Command {
  constructor(input) { this.input = input; }
}
class GetObjectCommand {
  constructor(input) { this.input = input; }
}
class HeadObjectCommand {
  constructor(input) { this.input = input; }
}
class PutObjectCommand {
  constructor(input) { this.input = input; }
}
class DeleteObjectCommand {
  constructor(input) { this.input = input; }
}

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
}));

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../utils/s3-storage.js', () => ({
  getPacsMinioBucket: () => 'mediczy-pacs-storage',
}));

jest.unstable_mockModule('../services/orthanc-hypergrid-bridge.service.js', () => ({
  handleOrthancNewInstance: mockHandleOrthancNewInstance,
}));

const { archivePacsBucketToMinio } = await import('../services/imaging/pacs-minio-archive.service.js');

function bodyFrom(buffer) {
  return (async function* stream() {
    yield buffer;
  })();
}

describe('pacs-minio archive', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockQuery.mockClear();
    mockHandleOrthancNewInstance.mockClear();
  });

  it('rehydrates orthanc-only indexed rows before deleting source objects', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM hg_dicom_instances')) {
        return {
          rows: [
            { orthanc_instance_id: 'orthanc-a' },
            { orthanc_instance_id: 'orthanc-b' },
          ],
        };
      }
      return { rows: [] };
    });
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof ListObjectsV2Command) {
        return { Contents: [], IsTruncated: false };
      }
      throw new Error(`unexpected command ${cmd.constructor.name}`);
    });

    const result = await archivePacsBucketToMinio();

    expect(result.hydratedOrthancOnly).toEqual({ scanned: 2, hydrated: 2, failed: 0 });
    expect(mockHandleOrthancNewInstance).toHaveBeenCalledWith({ ID: 'orthanc-a' });
    expect(mockHandleOrthancNewInstance).toHaveBeenCalledWith({ ID: 'orthanc-b' });
  });

  it('deletes the source S3 object after a verified MinIO copy', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [] }));
    const body = Buffer.from('dicom-bytes');
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof ListObjectsV2Command) {
        return { Contents: [{ Key: 'study-1.dcm', Size: body.length }], IsTruncated: false };
      }
      if (cmd instanceof HeadObjectCommand) {
        if (mockSend.mock.calls.filter(([c]) => c instanceof PutObjectCommand).length === 0) {
          throw new Error('not archived yet');
        }
        return { ContentLength: body.length };
      }
      if (cmd instanceof GetObjectCommand) {
        return { Body: bodyFrom(body), ContentType: 'application/dicom' };
      }
      if (cmd instanceof PutObjectCommand || cmd instanceof DeleteObjectCommand) {
        return {};
      }
      throw new Error(`unexpected command ${cmd.constructor.name}`);
    });

    const result = await archivePacsBucketToMinio();

    expect(result).toMatchObject({
      scanned: 1,
      copied: 1,
      skipped: 0,
      failed: 0,
      deletedFromSource: 1,
    });
    expect(mockSend.mock.calls.some(([cmd]) => cmd instanceof DeleteObjectCommand)).toBe(true);
    const deleteCmd = mockSend.mock.calls.find(([cmd]) => cmd instanceof DeleteObjectCommand)[0];
    expect(deleteCmd.input).toEqual({ Bucket: 'mediczy-pacs-storage', Key: 'study-1.dcm' });
    const recordArgs = mockQuery.mock.calls.at(-1)[1];
    expect(recordArgs).toEqual(['study-1.dcm', body.length, 'copied', null, true]);
  });

  it('deletes the source S3 object when the same-size object already exists in MinIO', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [] }));
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof ListObjectsV2Command) {
        return { Contents: [{ Key: 'already-archived.dcm', Size: 123 }], IsTruncated: false };
      }
      if (cmd instanceof HeadObjectCommand) return { ContentLength: 123 };
      if (cmd instanceof DeleteObjectCommand) return {};
      throw new Error(`unexpected command ${cmd.constructor.name}`);
    });

    const result = await archivePacsBucketToMinio();

    expect(result).toMatchObject({
      scanned: 1,
      copied: 0,
      skipped: 1,
      failed: 0,
      deletedFromSource: 1,
    });
    expect(mockSend.mock.calls.some(([cmd]) => cmd instanceof GetObjectCommand)).toBe(false);
    expect(mockSend.mock.calls.some(([cmd]) => cmd instanceof PutObjectCommand)).toBe(false);
    const deleteCmd = mockSend.mock.calls.find(([cmd]) => cmd instanceof DeleteObjectCommand)[0];
    expect(deleteCmd.input).toEqual({ Bucket: 'mediczy-pacs-storage', Key: 'already-archived.dcm' });
    const recordArgs = mockQuery.mock.calls.at(-1)[1];
    expect(recordArgs).toEqual(['already-archived.dcm', 123, 'archived_source_deleted', null, true]);
  });
});
