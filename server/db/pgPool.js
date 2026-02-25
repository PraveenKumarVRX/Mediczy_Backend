/**
 * Singleton PostgreSQL connection pool
 * Shared across ALL service instances to prevent connection exhaustion.
 * One pool per process — configured from environment variables.
 */

import pg from 'pg';

const { Pool } = pg;

let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = new Pool({
      host:     process.env.POSTGRES_HOST     || 'localhost',
      port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      user:     process.env.POSTGRES_USER     || 'mediczy_helper',
      password: process.env.POSTGRES_PASSWORD,
      max:      parseInt(process.env.POSTGRES_POOL_MAX || '20', 10),
      idleTimeoutMillis:    30000,
      connectionTimeoutMillis: 10000,
    });

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
