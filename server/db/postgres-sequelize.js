/**
 * PostgreSQL Sequelize Connection
 * Primary database for all operations
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

// Use existing POSTGRES env vars or fallback to new PRIMARY vars
const host = firstNonEmpty(process.env.POSTGRES_PRIMARY_HOST, process.env.POSTGRES_HOST);
const port = parseInt(firstNonEmpty(process.env.POSTGRES_PRIMARY_PORT, process.env.POSTGRES_PORT) || '5432', 10);
const database = firstNonEmpty(process.env.POSTGRES_PRIMARY_DATABASE, process.env.POSTGRES_DATABASE);
const username = firstNonEmpty(process.env.POSTGRES_PRIMARY_USER, process.env.POSTGRES_USER);
const password = firstNonEmpty(process.env.POSTGRES_PRIMARY_PASSWORD, process.env.POSTGRES_PASSWORD);

if (!host || !database || !username || !password) {
  throw new Error('Missing required PostgreSQL env values. Set POSTGRES_PRIMARY_HOST/POSTGRES_PRIMARY_DATABASE/POSTGRES_PRIMARY_USER/POSTGRES_PRIMARY_PASSWORD (or equivalent POSTGRES_* variables).');
}

const postgresSequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.POSTGRES_SSL === 'true' 
      ? { rejectUnauthorized: false } 
      : false,
    connectTimeout: 10000,
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: parseInt(process.env.POSTGRES_POOL_MAX || '50', 10),
    min: parseInt(process.env.POSTGRES_POOL_MIN || '10', 10),
    acquire: 60000,
    idle: 30000,
    evict: 30000
  },
  // Query-level auto-retry is unsafe for non-idempotent writes: a slow-but-successful
  // INSERT can get silently re-sent, collide with itself on a unique constraint, and
  // poison the transaction -- surfacing as a misleading "current transaction is aborted"
  // error that masks the real cause (confirmed live: bulk employee upload, Aug 2026).
  // Connection-level resilience is handled separately by connectToPostgresDB()'s retry
  // and the pg pool itself, not by retrying already-dispatched queries.
  retry: {
    max: 0
  },
  benchmark: process.env.NODE_ENV === 'development',
  define: {
    // Use camelCase for database columns
    underscored: false,
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
});

let isConnected = false;

async function connectToPostgresDB() {
  if (isConnected) {
    console.log("✅ Using existing PostgreSQL Sequelize connection");
    return postgresSequelize;
  }

  try {
    await postgresSequelize.authenticate();
    console.log('✅ PostgreSQL Sequelize connected successfully');
    console.log(`   Database: ${database} on ${host}:${port}`);
    isConnected = true;
    
    // Enable extensions if needed
    try {
      await postgresSequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
      await postgresSequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
      console.log('   Extensions: uuid-ossp, pgcrypto enabled');
    } catch (extError) {
      console.warn('   ⚠️  Extension creation warning:', extError.message);
    }
    
    return postgresSequelize;
  } catch (error) {
    console.error('❌ PostgreSQL Sequelize connection failed:', error.message);
    isConnected = false;
    
    // Retry logic
    if (!error.retryCount) error.retryCount = 0;
    if (error.retryCount < 3) {
      error.retryCount++;
      setTimeout(() => {
        console.log(`🔄 Retrying PostgreSQL connection... (${error.retryCount}/3)`);
        connectToPostgresDB();
      }, 5000);
    } else {
      console.error('❌ Max PostgreSQL connection retries reached');
    }
    
    throw error;
  }
}

// Graceful shutdown: postgresSequelize.close() is already called by db/orchestrator.js's closeAll()
// (invoked from controllers/shutdown.controller.js) — a second, independent SIGINT-only handler here
// (which also only listened for SIGINT, never SIGTERM — the signal PM2/containers actually send) used
// to race it with its own process.exit() call; see db/postgres.js for why that's dangerous.

export { postgresSequelize, connectToPostgresDB };
export default postgresSequelize;
