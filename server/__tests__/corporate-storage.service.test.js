import { jest } from '@jest/globals';

describe('corporate-storage.service — naming (pure, no network)', () => {
  let normalizeCorporateId, getCorporateHealthReportsBucket;

  beforeAll(async () => {
    const mod = await import('../services/corporate-storage.service.js');
    normalizeCorporateId = mod.normalizeCorporateId;
    getCorporateHealthReportsBucket = mod.getCorporateHealthReportsBucket;
  });

  test('normalizeCorporateId strips unsafe characters', () => {
    expect(normalizeCorporateId(5)).toBe('5');
    expect(normalizeCorporateId('5')).toBe('5');
    expect(normalizeCorporateId(' 5 ')).toBe('5');
    expect(normalizeCorporateId('5; DROP TABLE')).toBe('5DROPTABLE');
  });

  test('normalizeCorporateId returns null for empty/missing input', () => {
    expect(normalizeCorporateId(null)).toBeNull();
    expect(normalizeCorporateId(undefined)).toBeNull();
    expect(normalizeCorporateId('')).toBeNull();
  });

  test('getCorporateHealthReportsBucket produces a deterministic, valid bucket name for a real corporate id', () => {
    // corporate_id 5 is Equitas Bank in the real data checked this session.
    expect(getCorporateHealthReportsBucket(5)).toBe('mediczy-corp-health-c5');
  });

  test('bucket name is always lowercase and within the 63-char S3/MinIO limit', () => {
    const name = getCorporateHealthReportsBucket('123456789012345678901234567890123456789012345678901234567890');
    expect(name).toBe(name.toLowerCase());
    expect(name.length).toBeLessThanOrEqual(63);
  });

  test('two different corporates never collide on a bucket name', () => {
    expect(getCorporateHealthReportsBucket(5)).not.toBe(getCorporateHealthReportsBucket(51));
  });

  test('throws rather than silently defaulting when corporateId is missing — an unscoped bucket would defeat the whole point', () => {
    expect(() => getCorporateHealthReportsBucket(null)).toThrow(/corporateId is required/);
    expect(() => getCorporateHealthReportsBucket('')).toThrow(/corporateId is required/);
  });
});

describe('corporate-storage.service — ensureCorporateHealthReportsBucket (mocked S3 client)', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();
  });

  async function loadWithMockClient() {
    jest.unstable_mockModule('../services/s3-presign.service.js', () => ({
      getS3Client: () => ({ send: mockSend }),
    }));
    return import('../services/corporate-storage.service.js');
  }

  test('HeadBucket succeeding means the bucket already exists — no CreateBucket call', async () => {
    mockSend.mockResolvedValueOnce({}); // HeadBucket ok
    const { ensureCorporateHealthReportsBucket } = await loadWithMockClient();
    const result = await ensureCorporateHealthReportsBucket(5);
    expect(result).toEqual({ bucket: 'mediczy-corp-health-c5', created: false });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('HeadBucket 404 triggers CreateBucket, and reports created: true', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'NotFound' });
    mockSend.mockRejectedValueOnce(notFound); // HeadBucket -> missing
    mockSend.mockResolvedValueOnce({}); // CreateBucket ok
    const { ensureCorporateHealthReportsBucket } = await loadWithMockClient();
    const result = await ensureCorporateHealthReportsBucket(5);
    expect(result).toEqual({ bucket: 'mediczy-corp-health-c5', created: true });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('a real HeadBucket error unrelated to "missing" is not swallowed', async () => {
    const forbidden = Object.assign(new Error('access denied'), { name: 'AccessDenied' });
    mockSend.mockRejectedValueOnce(forbidden);
    const { ensureCorporateHealthReportsBucket } = await loadWithMockClient();
    await expect(ensureCorporateHealthReportsBucket(5)).rejects.toThrow('access denied');
  });

  test('a race where another request already created the bucket (BucketAlreadyOwnedByYou) is tolerated, not thrown', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'NotFound' });
    const alreadyOwned = Object.assign(new Error('already owned'), { name: 'BucketAlreadyOwnedByYou' });
    mockSend.mockRejectedValueOnce(notFound);
    mockSend.mockRejectedValueOnce(alreadyOwned);
    const { ensureCorporateHealthReportsBucket } = await loadWithMockClient();
    const result = await ensureCorporateHealthReportsBucket(5);
    expect(result).toEqual({ bucket: 'mediczy-corp-health-c5', created: true });
  });
});
