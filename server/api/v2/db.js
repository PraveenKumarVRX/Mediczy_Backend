/**
 * Database wrapper for API v2
 * Provides a consistent interface for database operations
 * Uses the orchestrator's PostgreSQL pool
 */

import { getPostgresPool } from '../../db/postgres.js';

/**
 * Get the database pool
 * @returns {Pool} PostgreSQL connection pool
 */
export const getPool = () => {
  return getPostgresPool();
};

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<QueryResult>}
 */
export const query = async (text, params) => {
  const pool = getPostgresPool();
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[DB ERROR] Query failed:', err.code, err.message);
    console.error('[DB ERROR] Query:', text.substring(0, 200));
    throw err;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<PoolClient>}
 */
export const getClient = async () => {
  const pool = getPostgresPool();
  return pool.connect();
};

/**
 * Execute a transaction
 * @param {Function} callback - Async function that receives a client
 * @returns {Promise<any>}
 */
export const transaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Default export as db object for compatibility
const db = {
  query,
  getPool,
  getClient,
  transaction
};

export default db;
