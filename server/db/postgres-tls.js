import { readFileSync } from 'node:fs';

/** All primary Node pools authenticate the server certificate and hostname. */
export function postgresTls(env = process.env, connectionString) {
  let host = env.POSTGRES_PRIMARY_HOST || env.POSTGRES_HOST || env.PG_HOST || '';
  if (connectionString) {
    const uri = new URL(connectionString);
    host = uri.hostname;
    if (['sslmode','sslcert','sslkey','sslrootcert','ssl'].some(key => uri.searchParams.has(key))) {
      throw new Error('Configure PostgreSQL TLS through POSTGRES_SSL / POSTGRES_SSL_CA_FILE; URI TLS options can override verification');
    }
  }
  const local = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(host) || host.startsWith('/');
  const productionRemote = env.NODE_ENV === 'production' && !local;
  const enabled = env.POSTGRES_SSL === 'true' || env.PG_SSL === 'true' || productionRemote;
  if (productionRemote && env.POSTGRES_SSL === 'false') {
    throw new Error('Production remote PostgreSQL requires verified TLS');
  }
  if (!enabled) return false;
  const ssl = { rejectUnauthorized: true };
  if (env.POSTGRES_SSL_CA_FILE) ssl.ca = readFileSync(env.POSTGRES_SSL_CA_FILE, 'utf8');
  else if (/\.rds\.amazonaws\.com(\.cn)?$/i.test(host)) {
    ssl.ca = readFileSync(new URL('./certs/aws-rds-ap-south-1.pem', import.meta.url), 'utf8');
  }
  return ssl;
}
