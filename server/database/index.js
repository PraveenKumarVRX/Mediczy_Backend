import { postgresTls } from '../db/postgres-tls.js';
/**
 * Database Configuration & Connection Pool
 * Manages PostgreSQL database connections with connection pooling
 * 
 * Features:
 * - Connection pooling for performance
 * - Connection validation
 * - Graceful shutdown
 * - Error handling and recovery
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database configuration from environment variables
// Support both DB_* and POSTGRES_* prefixes
const dbConfig = {
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: process.env.DB_PORT || process.env.POSTGRES_PORT || 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DATABASE || 'mediczy',
  ssl: postgresTls({ ...process.env, POSTGRES_PRIMARY_HOST: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost' }),
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || process.env.POSTGRES_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '2000'),
};

console.log(`[DB] Initializing PostgreSQL connection pool...`);
console.log(`[DB] Host: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
console.log(`[DB] User: ${dbConfig.user}`);
console.log(`[DB] Pool Size: ${dbConfig.max} connections`);

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors — this fires for an idle client that dropped its connection (a network blip),
// which the pool already recovers from by discarding that client; it is not a reason to crash the
// whole process (this previously called process.exit(-1) on any such blip, ungracefully killing
// everything the process was doing, unrelated to whatever tripped this specific idle connection).
pool.on('error', (err) => {
  console.error('[DB Pool Error]', err);
});

// Log connection events
pool.on('connect', () => {
  console.debug('[DB] New connection established');
});

pool.on('remove', () => {
  console.debug('[DB] Connection removed from pool');
});

/**
 * Query helper function
 * @param {string} query - SQL query
 * @param {array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`[DB Slow Query] ${duration}ms:`, text.substring(0, 80));
    }
    
    return result;
  } catch (error) {
    console.error('[DB Query Error]', error);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Client>} Database client
 */
async function getClient() {
  return pool.connect();
}

/**
 * Close the connection pool
 * @returns {Promise}
 */
async function closePool() {
  console.log('[DB] Closing connection pool...');
  return pool.end();
}

/**
 * Health check - verify database connection
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    const result = await pool.query('SELECT NOW()');
    return {
      status: 'healthy',
      timestamp: result.rows[0].now,
      poolSize: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Get pool statistics
 * @returns {object}
 */
function getPoolStats() {
  return {
    totalConnections: pool.totalCount,
    availableConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    maxConnections: dbConfig.max
  };
}

// Graceful shutdown: closePool() is called by controllers/shutdown.controller.js as part of the
// single coordinated shutdown sequence (this pool is a separate connection pool from db/postgres.js
// and is not covered by db/orchestrator.js's closeAll(), so it needs its own explicit close call
// there) — not from a handler registered here, to avoid a process.exit() race against that sequence.

export {
  pool,
  query,
  getClient,
  closePool,
  healthCheck,
  getPoolStats,
  dbConfig
};

export default {
  pool,
  query,
  getClient,
  closePool,
  healthCheck,
  getPoolStats,
  dbConfig
};
