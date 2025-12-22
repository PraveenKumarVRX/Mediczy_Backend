/**
 * Unified Database Export - PostgreSQL Primary
 * 
 * This module exports PostgreSQL as the primary database connection
 * and provides MariaDB as a fallback for backward compatibility.
 * 
 * Usage:
 *   import db from '../db/index.js';  // PostgreSQL Sequelize instance
 *   import { sequelize, legacyDb } from '../db/index.js';
 */

import { postgresSequelize, connectToPostgresDB } from './postgres-sequelize.js';
import { sequelize as mariadbSequelize } from './mariadb.js';
import dbOrchestrator from './orchestrator.js';

// PostgreSQL is the primary database
export const sequelize = postgresSequelize;
export const db = postgresSequelize;
export default postgresSequelize;

// MariaDB is available as legacy/fallback
export const legacyDb = mariadbSequelize;
export const mariadb = mariadbSequelize;

// Re-export orchestrator functions
export { 
  dbOrchestrator,
  connectToPostgresDB,
  initializeAllDatabases,
  getDbHealthStatus,
  closeAllDatabases,
  getDatabaseStatistics
} from './orchestrator.js';

// Export connection helper
export async function connect() {
  await connectToPostgresDB();
  return postgresSequelize;
}

// Health check
export async function healthCheck() {
  try {
    await postgresSequelize.authenticate();
    return { status: 'healthy', database: 'postgresql', connected: true };
  } catch (error) {
    console.error('PostgreSQL health check failed:', error.message);
    
    // Try MariaDB as fallback
    try {
      await mariadbSequelize.authenticate();
      return { status: 'degraded', database: 'mariadb', connected: true, message: 'Using legacy database' };
    } catch (fallbackError) {
      return { status: 'unhealthy', database: 'none', connected: false, error: error.message };
    }
  }
}
