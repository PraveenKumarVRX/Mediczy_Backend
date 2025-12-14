/**
 * PostgreSQL Sequelize Connection
 * Primary database replacing MariaDB
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Use existing POSTGRES env vars or fallback to new PRIMARY vars
const host = process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1';
const port = parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10);
const database = process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai';
const username = process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper';
const password = process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || 'change_me';

const postgresSequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.POSTGRES_SSL === 'true' 
      ? { rejectUnauthorized: false } 
      : false,
    connectTimeout: 10000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 60000,
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: parseInt(process.env.POSTGRES_POOL_MAX || '20', 10),
    min: parseInt(process.env.POSTGRES_POOL_MIN || '5', 10),
    acquire: 30000,
    idle: 10000,
    evict: 10000
  },
  retry: {
    max: 3,
    timeout: 3000
  },
  benchmark: process.env.NODE_ENV === 'development',
  define: {
    // Use snake_case for database columns (PostgreSQL convention)
    underscored: false, // Keep camelCase for now to match MariaDB
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

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await postgresSequelize.close();
    console.log('PostgreSQL Sequelize connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error closing PostgreSQL connection:', err);
    process.exit(1);
  }
});

export { postgresSequelize, connectToPostgresDB };
export default postgresSequelize;
