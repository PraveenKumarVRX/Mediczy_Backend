describe('orthanc-credentials', () => {
  const prevPassword = process.env.ORTHANC_PASSWORD;
  const prevUser = process.env.ORTHANC_USER;

  afterEach(() => {
    if (prevPassword === undefined) delete process.env.ORTHANC_PASSWORD;
    else process.env.ORTHANC_PASSWORD = prevPassword;
    if (prevUser === undefined) delete process.env.ORTHANC_USER;
    else process.env.ORTHANC_USER = prevUser;
  });

  it('throws when ORTHANC_PASSWORD is unset', async () => {
    delete process.env.ORTHANC_PASSWORD;
    const { getOrthancCredentials } = await import('../utils/orthanc-credentials.js');
    expect(() => getOrthancCredentials()).toThrow(/ORTHANC_PASSWORD is required/);
  });

  it('builds Basic auth from env', async () => {
    process.env.ORTHANC_USER = 'pacs';
    process.env.ORTHANC_PASSWORD = 's3cret';
    const { orthancBasicAuthHeader } = await import('../utils/orthanc-credentials.js');
    const h = orthancBasicAuthHeader();
    expect(h.Authorization).toBe(`Basic ${Buffer.from('pacs:s3cret').toString('base64')}`);
  });
});
