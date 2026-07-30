describe('imaging daily bucket routing', () => {
  const prevDaily = process.env.S3_IMAGING_DAILY_BUCKET;
  const prevUploads = process.env.S3_UPLOADS_BUCKET;

  afterEach(() => {
    if (prevDaily === undefined) delete process.env.S3_IMAGING_DAILY_BUCKET;
    else process.env.S3_IMAGING_DAILY_BUCKET = prevDaily;
    if (prevUploads === undefined) delete process.env.S3_UPLOADS_BUCKET;
    else process.env.S3_UPLOADS_BUCKET = prevUploads;
  });

  it('routes dicom/imaging/ris prefixes to daily bucket', async () => {
    process.env.S3_IMAGING_DAILY_BUCKET = 'mediczy-imaging-daily';
    process.env.S3_UPLOADS_BUCKET = 'mediczy-uploads';
    const {
      resolveBucketForKey,
      getImagingDailyBucket,
      getUploadsBucket,
    } = await import('../utils/s3-storage.js');

    expect(getImagingDailyBucket()).toBe('mediczy-imaging-daily');
    expect(getUploadsBucket()).toBe('mediczy-uploads');
    expect(resolveBucketForKey('dicom/abc.dcm')).toBe('mediczy-imaging-daily');
    expect(resolveBucketForKey('imaging/x.jpg')).toBe('mediczy-imaging-daily');
    expect(resolveBucketForKey('ris/y.dcm')).toBe('mediczy-imaging-daily');
    expect(resolveBucketForKey('chat/z.png')).toBe('mediczy-uploads');
  });

  it('builds tenant-segregated object keys', async () => {
    const { buildImagingObjectKey, tenantKeySegment, imagingTenantPrefix } = await import('../utils/s3-storage.js');
    expect(tenantKeySegment(56)).toBe('tenant-56');
    expect(tenantKeySegment('tenant-56')).toBe('tenant-56');
    expect(imagingTenantPrefix('dicom', 56)).toBe('dicom/tenant-56/');

    const key = buildImagingObjectKey({
      folder: 'dicom',
      tenantId: 56,
      originalName: 'study.dcm',
      at: new Date(Date.UTC(2026, 6, 30)),
    });
    expect(key).toMatch(/^dicom\/tenant-56\/2026\/07\/30\/\d+-[a-f0-9]+\.dcm$/);
  });
});
