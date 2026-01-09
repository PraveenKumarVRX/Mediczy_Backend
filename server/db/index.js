import connectPostgres, { closePostgres, getPostgresStatus } from './postgres.js';

// Initialize connection pool
let pool = null;

async function initializeDb() {
  if (!pool) {
    pool = await connectPostgres();
  }
  return pool;
}

// Database interface
export const db = {
  // Query method for raw SQL queries
  query: async (text, params) => {
    const client = await initializeDb();
    return client.query(text, params);
  },

  // Get a client from the pool
  getClient: async () => {
    const pool = await initializeDb();
    return pool;
  },

  // Close the connection pool
  close: async () => {
    if (pool) {
      await closePostgres();
      pool = null;
    }
  },

  // Get pool status
  getStatus: () => {
    return getPostgresStatus();
  }
};

// Export named exports
export { connectPostgres, closePostgres, getPostgresStatus };

// Default export
export default db;
