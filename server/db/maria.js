/**
 * MariaDB Database Connector
 * Primary relational database for structured data
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.MARIA_DB_NAME || process.env.DB_NAME || 'mediczy',
  process.env.MARIA_DB_USER || process.env.DB_USER || 'root',
  process.env.MARIA_DB_PASSWORD || process.env.DB_PASSWORD || '',
  {
    host: process.env.MARIA_DB_HOST || process.env.DB_HOST || 'localhost',
    port: process.env.MARIA_DB_PORT || 3306,
    dialect: 'mariadb',
    dialectOptions: {
      timezone: 'Etc/GMT+0',
      connectTimeout: 10000,
    },
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: parseInt(process.env.MARIA_POOL_MAX) || 10,
      min: parseInt(process.env.MARIA_POOL_MIN) || 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: false,
    }
  }
);

let isConnected = false;

/**
 * Connect to MariaDB database
 * @returns {Promise<Sequelize>} Sequelize instance
 */
export async function connectMariaDB() {
  if (isConnected) {
    console.log("✅ MariaDB: Using existing connection");
    return sequelize;
  }

  try {
    await sequelize.authenticate();
    console.log('✅ MariaDB: Connected successfully');
    isConnected = true;
    
    return sequelize;
  } catch (error) {
    console.error('❌ MariaDB: Connection failed:', error.message);
    isConnected = false;
    
    // Retry logic
    if (!error.retryCount) error.retryCount = 0;
    if (error.retryCount < 3) {
      error.retryCount++;
      console.log(`⏳ MariaDB: Retrying connection... (${error.retryCount}/3)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectMariaDB();
    } else {
      console.error('❌ MariaDB: Max connection retries reached');
      throw error;
    }
  }
}

/**
 * Close MariaDB connection
 */
export async function closeMariaDB() {
  try {
    await sequelize.close();
    isConnected = false;
    console.log('✅ MariaDB: Connection closed');
  } catch (err) {
    console.error('❌ MariaDB: Error closing connection:', err);
    throw err;
  }
}

/**
 * Get MariaDB connection status
 */
export function getMariaDBStatus() {
  return {
    connected: isConnected,
    dialect: 'mariadb',
    database: process.env.MARIA_DB_NAME || process.env.DB_NAME || 'mediczy',
    host: process.env.MARIA_DB_HOST || process.env.DB_HOST || 'localhost',
    port: process.env.MARIA_DB_PORT || 3306,
  };
}

/**
 * Test MariaDB connection
 */
export async function testMariaDB() {
  try {
    await sequelize.authenticate();
    return { success: true, message: 'MariaDB connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  await closeMariaDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeMariaDB();
  process.exit(0);
});

export { sequelize };
export default sequelize;
