describe('imaging archive backends (MinIO + Wasabi)', () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it('reports wasabi-only when MinIO unset', async () => {
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_ACCESS_KEY;
    process.env.WASABI_ENDPOINT = 'https://s3.ap-southeast-1.wasabisys.com';
    process.env.WASABI_REGION = 'ap-southeast-1';
    process.env.WASABI_ACCESS_KEY = 'wkey';
    process.env.WASABI_SECRET_KEY = 'wsecret';
    process.env.WASABI_IMAGING_BUCKET = 'mediczy-imaging-archive';

    const {
      isMinioConfigured,
      isWasabiConfigured,
      describeArchiveBackends,
      getWasabiImagingBucketForTenant,
    } = await import('../services/imaging/imaging-archive-client.service.js');

    expect(isMinioConfigured()).toBe(false);
    expect(isWasabiConfigured()).toBe(true);
    expect(describeArchiveBackends().strategy).toBe('wasabi-only');
    expect(getWasabiImagingBucketForTenant(56)).toBe('mediczy-imaging-archive');
  });

  it('uses minio-then-wasabi-fallback when both configured', async () => {
    process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.MINIO_ACCESS_KEY = 'minio';
    process.env.MINIO_SECRET_KEY = 'minio123';
    process.env.WASABI_ENDPOINT = 'https://s3.ap-southeast-1.wasabisys.com';
    process.env.WASABI_ACCESS_KEY = 'wkey';
    process.env.WASABI_SECRET_KEY = 'wsecret';
    delete process.env.IMAGING_WASABI_MIRROR;

    const { describeArchiveBackends, getArchiveTargets } = await import(
      '../services/imaging/imaging-archive-client.service.js'
    );
    expect(describeArchiveBackends().strategy).toBe('minio-then-wasabi-fallback');
    const targets = getArchiveTargets();
    expect(targets.map((t) => t.name)).toEqual(['minio', 'wasabi']);
  });

  it('mirror mode when IMAGING_WASABI_MIRROR=true', async () => {
    process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.MINIO_ACCESS_KEY = 'minio';
    process.env.MINIO_SECRET_KEY = 'minio123';
    process.env.WASABI_ENDPOINT = 'https://s3.wasabisys.com';
    process.env.WASABI_ACCESS_KEY = 'wkey';
    process.env.WASABI_SECRET_KEY = 'wsecret';
    process.env.IMAGING_WASABI_MIRROR = 'true';

    const { describeArchiveBackends } = await import(
      '../services/imaging/imaging-archive-client.service.js'
    );
    expect(describeArchiveBackends().strategy).toBe('mirror-both');
    expect(describeArchiveBackends().mirror).toBe(true);
  });

  it('per-tenant wasabi bucket in minio-bucket isolation mode', async () => {
    process.env.IMAGING_TENANT_ISOLATION = 'minio-bucket';
    process.env.WASABI_IMAGING_BUCKET_PREFIX = 'mediczy-imaging';
    process.env.WASABI_ENDPOINT = 'https://s3.wasabisys.com';
    process.env.WASABI_ACCESS_KEY = 'wkey';
    process.env.WASABI_SECRET_KEY = 'wsecret';

    const { getWasabiImagingBucketForTenant } = await import(
      '../services/imaging/imaging-archive-client.service.js'
    );
    expect(getWasabiImagingBucketForTenant(12)).toBe('mediczy-imaging-t12');
  });
});
