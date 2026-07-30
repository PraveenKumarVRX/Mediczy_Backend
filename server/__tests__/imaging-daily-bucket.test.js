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
});
