describe('imaging tenant isolation', () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it('builds tenant-segregated object keys', async () => {
    const { buildImagingObjectKey, tenantKeySegment, imagingTenantPrefix } = await import('../utils/s3-storage.js');
    expect(tenantKeySegment(56)).toBe('tenant-56');
    expect(imagingTenantPrefix('dicom', 56)).toBe('dicom/tenant-56/');
    const key = buildImagingObjectKey({
      folder: 'dicom',
      tenantId: 56,
      originalName: 'study.dcm',
      at: new Date(Date.UTC(2026, 6, 30)),
    });
    expect(key).toMatch(/^dicom\/tenant-56\/2026\/07\/30\/\d+-[a-f0-9]+\.dcm$/);
  });

  it('prefix mode uses shared buckets', async () => {
    process.env.IMAGING_TENANT_ISOLATION = 'prefix';
    process.env.S3_IMAGING_DAILY_BUCKET = 'mediczy-imaging-daily';
    process.env.MINIO_IMAGING_BUCKET = 'mediczy-imaging-archive';
    const {
      getImagingDailyBucketForTenant,
      getMinioImagingBucketForTenant,
      getTenantIsolationMode,
    } = await import('../services/imaging/imaging-tenant-storage.service.js');
    expect(getTenantIsolationMode()).toBe('prefix');
    expect(getImagingDailyBucketForTenant(56)).toBe('mediczy-imaging-daily');
    expect(getMinioImagingBucketForTenant(56)).toBe('mediczy-imaging-archive');
  });

  it('minio-bucket mode splits only MinIO', async () => {
    process.env.IMAGING_TENANT_ISOLATION = 'minio-bucket';
    process.env.S3_IMAGING_DAILY_BUCKET = 'mediczy-imaging-daily';
    process.env.MINIO_IMAGING_BUCKET_PREFIX = 'mediczy-imaging';
    const {
      getImagingDailyBucketForTenant,
      getMinioImagingBucketForTenant,
    } = await import('../services/imaging/imaging-tenant-storage.service.js');
    expect(getImagingDailyBucketForTenant(56)).toBe('mediczy-imaging-daily');
    expect(getMinioImagingBucketForTenant(56)).toBe('mediczy-imaging-t56');
  });

  it('s3-bucket mode splits S3 and MinIO', async () => {
    process.env.IMAGING_TENANT_ISOLATION = 's3-bucket';
    process.env.S3_IMAGING_DAILY_BUCKET_PREFIX = 'mediczy-imaging-daily';
    process.env.MINIO_IMAGING_BUCKET_PREFIX = 'mediczy-imaging';
    const {
      getImagingDailyBucketForTenant,
      getMinioImagingBucketForTenant,
      resolveImagingBucketFromKey,
      parseTenantIdFromKey,
    } = await import('../services/imaging/imaging-tenant-storage.service.js');
    expect(getImagingDailyBucketForTenant(56)).toBe('mediczy-imaging-daily-t56');
    expect(getMinioImagingBucketForTenant(12)).toBe('mediczy-imaging-t12');
    expect(parseTenantIdFromKey('dicom/tenant-56/2026/07/30/x.dcm')).toBe('56');
    expect(resolveImagingBucketFromKey('dicom/tenant-56/2026/07/30/x.dcm')).toBe('mediczy-imaging-daily-t56');
  });
});
