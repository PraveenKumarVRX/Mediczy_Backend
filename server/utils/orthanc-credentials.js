/**
 * Orthanc Basic-auth credentials — fail closed (no weak defaults).
 */
export function getOrthancCredentials({ defaultUser = 'pacs' } = {}) {
  const url = (process.env.ORTHANC_URL || 'http://127.0.0.1:8042').replace(/\/$/, '');
  const user = process.env.ORTHANC_USER || defaultUser;
  const password = process.env.ORTHANC_PASSWORD;
  if (!password) {
    throw new Error(
      'ORTHANC_PASSWORD is required. Refusing to authenticate to Orthanc with an insecure default.',
    );
  }
  return { url, user, password };
}

export function orthancBasicAuthHeader(opts) {
  const { user, password } = getOrthancCredentials(opts);
  const token = Buffer.from(`${user}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}
