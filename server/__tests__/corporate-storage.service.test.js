import { jest } from '@jest/globals';

/**
 * Corporate health reports have two storage backends and they behave
 * differently, so both are covered here.
 *
 *  - S3 (the default since 2026-11-07): one shared platform bucket, with each
 *    corporate isolated by key prefix. S3 bucket names are globally unique, so
 *    a bucket per corporate does not scale and would need s3:CreateBucket,
 *    which the write identity is not expected to hold. Nothing is ever created.
 *  - S3-compatible / MinIO (when an endpoint is configured): a bucket per
 *    corporate, created on demand and idempotently.
 *
 * These tests previously assumed the MinIO shape unconditionally, so they broke
 * when the default moved to S3 — and their mock of the storage client was
 * missing corporateReportsUseS3, which the service began importing at the same
 * time, so the suite could not even link.
 */

const MINIO_ENV = {
  CORPORATE_REPORTS_STORAGE: 'minio',
  CORPORATE_REPORTS_MINIO_ENDPOINT: 'https://minio.test',
  CORPORATE_REPORTS_MINIO_BUCKET: '',
  PACS_ARCHIVE_MINIO_BUCKET: '',
};
const S3_ENV = {
  CORPORATE_REPORTS_STORAGE: 's3',
  CORPORATE_REPORTS_S3_BUCKET: 'mediczy-platform-reports',
};

const withEnv = (vars, fn) => async () => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k] of Object.entries(vars)) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
};

describe('normalizing a corporate id', () => {
  let normalizeCorporateId;
  beforeAll(async () => {
    ({ normalizeCorporateId } = await import('../services/corporate-storage.service.js'));
  });

  test('strips unsafe characters', () => {
    expect(normalizeCorporateId(5)).toBe('5');
    expect(normalizeCorporateId('5')).toBe('5');
    expect(normalizeCorporateId(' 5 ')).toBe('5');
    expect(normalizeCorporateId('5; DROP TABLE')).toBe('5DROPTABLE');
  });

  test('returns null for empty or missing input', () => {
    expect(normalizeCorporateId(null)).toBeNull();
    expect(normalizeCorporateId(undefined)).toBeNull();
    expect(normalizeCorporateId('')).toBeNull();
  });
});

describe('bucket naming on an S3-compatible endpoint (a bucket per corporate)', () => {
  let getCorporateHealthReportsBucket;
  beforeEach(async () => {
    jest.resetModules();
    ({ getCorporateHealthReportsBucket } = await import('../services/corporate-storage.service.js'));
  });

  test('is deterministic for a given corporate', withEnv(MINIO_ENV, () => {
    // corporate_id 5 is Equitas Bank in the real data.
    expect(getCorporateHealthReportsBucket(5)).toBe('mediczy-corp-health-c5');
  }));

  test('is always lowercase and within the 63-character limit', withEnv(MINIO_ENV, () => {
    const name = getCorporateHealthReportsBucket('123456789012345678901234567890123456789012345678901234567890');
    expect(name).toBe(name.toLowerCase());
    expect(name.length).toBeLessThanOrEqual(63);
  }));

  test('never collides between two corporates', withEnv(MINIO_ENV, () => {
    expect(getCorporateHealthReportsBucket(5)).not.toBe(getCorporateHealthReportsBucket(51));
  }));

  test('throws rather than defaulting when the corporate is missing', withEnv(MINIO_ENV, () => {
    // An unscoped bucket would defeat the point of per-corporate isolation.
    expect(() => getCorporateHealthReportsBucket(null)).toThrow(/corporateId is required/);
    expect(() => getCorporateHealthReportsBucket('')).toThrow(/corporateId is required/);
  }));
});

describe('bucket naming on S3 (one shared bucket, isolated by key prefix)', () => {
  let getCorporateHealthReportsBucket;
  beforeEach(async () => {
    jest.resetModules();
    ({ getCorporateHealthReportsBucket } = await import('../services/corporate-storage.service.js'));
  });

  test('every corporate resolves to the one platform bucket', withEnv(S3_ENV, () => {
    expect(getCorporateHealthReportsBucket(5)).toBe('mediczy-platform-reports');
    expect(getCorporateHealthReportsBucket(51)).toBe('mediczy-platform-reports');
  }));

  test('still refuses a missing corporate, since the key prefix carries the isolation', withEnv(S3_ENV, () => {
    expect(() => getCorporateHealthReportsBucket(null)).toThrow(/corporateId is required/);
  }));

  test('reports a configuration problem rather than writing somewhere unintended', withEnv(
    { CORPORATE_REPORTS_STORAGE: 's3', CORPORATE_REPORTS_S3_BUCKET: '', S3_UPLOADS_BUCKET: '' },
    () => {
      expect(() => getCorporateHealthReportsBucket(5)).toThrow(/not configured/);
    }
  ));
});

describe('ensuring the bucket exists', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();
  });

  // The mock must provide every export the service imports, or the module
  // cannot be linked and the whole suite fails to run.
  async function loadWithMockClient(useS3) {
    jest.unstable_mockModule('../services/corporate-report-storage-client.js', () => ({
      getCorporateReportClient: () => ({ send: mockSend }),
      corporateReportsUseS3: () => useS3,
    }));
    return import('../services/corporate-storage.service.js');
  }

  describe('on S3', () => {
    test('never creates the shared platform bucket', withEnv(S3_ENV, async () => {
      // The write identity is not expected to hold s3:CreateBucket, and the
      // bucket is already provisioned.
      const { ensureCorporateHealthReportsBucket } = await loadWithMockClient(true);
      const result = await ensureCorporateHealthReportsBucket(5);
      expect(result).toEqual({ bucket: 'mediczy-platform-reports', created: false });
      expect(mockSend).not.toHaveBeenCalled();
    }));
  });

  describe('on an S3-compatible endpoint', () => {
    test('an existing bucket is left alone', withEnv(MINIO_ENV, async () => {
      mockSend.mockResolvedValueOnce({}); // HeadBucket ok
      const { ensureCorporateHealthReportsBucket } = await loadWithMockClient(false);
      const result = await ensureCorporateHealthReportsBucket(5);
      expect(result).toEqual({ bucket: 'mediczy-corp-health-c5', created: false });
      expect(mockSend).toHaveBeenCalledTimes(1);
    }));

    test('a missing bucket is created', withEnv(MINIO_ENV, async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('not found'), { name: 'NotFound' }));
      mockSend.mockResolvedValueOnce({}); // CreateBucket ok
      const { ensureCorporateHealthReportsBucket } = await loadWithMockClient(false);
      const result = await ensureCorporateHealthReportsBucket(5);
      expect(result).toEqual({ bucket: 'mediczy-corp-health-c5', created: true });
      expect(mockSend).toHaveBeenCalledTimes(2);
    }));

    test('an error that is not "missing" is not swallowed', withEnv(MINIO_ENV, async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('access denied'), { name: 'AccessDenied' }));
      const { ensureCorporateHealthReportsBucket } = await loadWithMockClient(false);
      await expect(ensureCorporateHealthReportsBucket(5)).rejects.toThrow('access denied');
    }));

    test('losing a creation race is tolerated, not thrown', withEnv(MINIO_ENV, async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('not found'), { name: 'NotFound' }));
      mockSend.mockRejectedValueOnce(Object.assign(new Error('already owned'), { name: 'BucketAlreadyOwnedByYou' }));
      const { ensureCorporateHealthReportsBucket } = await loadWithMockClient(false);
      const result = await ensureCorporateHealthReportsBucket(5);
      expect(result).toEqual({ bucket: 'mediczy-corp-health-c5', created: true });
    }));
  });
});
