/**
 * Singleton PostgreSQL connection pool
 * Shared across ALL service instances to prevent connection exhaustion.
 * One pool per process — configured from environment variables.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load root env first, then allow server/.env overrides for local development.
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

let _pool = null;

function buildPoolConfig() {
  const hasPrimaryDiscreteConfig = Boolean(
    process.env.POSTGRES_PRIMARY_HOST ||
    process.env.POSTGRES_PRIMARY_PORT ||
    process.env.POSTGRES_PRIMARY_DATABASE ||
    process.env.POSTGRES_PRIMARY_USER ||
    process.env.POSTGRES_PRIMARY_PASSWORD
  );
  const connectionString = process.env.POSTGRES_PRIMARY_URI || (!hasPrimaryDiscreteConfig ? (process.env.POSTGRES_URI || process.env.PG_URI) : undefined);
  const ssl = process.env.POSTGRES_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false;

  if (connectionString) {
    return {
      connectionString,
      max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl,
    };
  }

  return {
    host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || process.env.PG_HOST || process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || process.env.PG_PORT || process.env.DB_PORT || '5432', 10),
    database: process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || process.env.PG_DATABASE || process.env.DB_NAME || 'mediczy_ai',
    user: process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || process.env.PG_USER || process.env.DB_USER || 'mediczy_helper',
    password: process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PG_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS,
    max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl,
  };
}

function getPool() {
  if (!_pool) {
    _pool = new Pool(buildPoolConfig());

    _pool.on('error', (err) => {
      console.error('[pgPool] Unexpected idle-client error:', err.message);
    });

    _pool.on('connect', () => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[pgPool] New client connected — total: ${_pool.totalCount}`);
      }
    });
  }
  return _pool;
}

export default getPool();
