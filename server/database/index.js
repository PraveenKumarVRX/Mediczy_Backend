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

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('[DB Pool Error]', err);
  process.exit(-1);
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DB] SIGINT received, closing connection pool...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[DB] SIGTERM received, closing connection pool...');
  await closePool();
  process.exit(0);
});

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
