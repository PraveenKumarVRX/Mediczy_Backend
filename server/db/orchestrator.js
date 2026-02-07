/**
 * Database Orchestrator - PostgreSQL Only
 * PostgreSQL is the sole database for all operations
 */

import { postgresSequelize, connectToPostgresDB } from './postgres-sequelize.js';
import { connectPostgres, closePostgres, testPostgres, getPostgresStatus } from './postgres.js';
import { connectDuckDB, closeDuckDB, getDuckDBStatus, testDuckDB } from './duckdb.js';
import { connectRedis, closeRedis, getRedisStatus, testRedis } from './redis.js';

class DatabaseOrchestrator {
  constructor() {
    this.connections = {
      postgresSequelize: null,  // PostgreSQL with Sequelize (PRIMARY)
      postgres: null,            // PostgreSQL raw connection (HELPER)
      duckdb: null,
      redis: null
    };

    // PostgreSQL is the sole database
    this.roles = {
      postgresSequelize: 'PRIMARY',  // Main transactional database (JSONB, TimescaleDB ready)
      postgres: 'HELPER',            // Document storage, pgvector, Citus distribution
      duckdb: 'OPTIONAL',            // Optional: Analytics compute engine for heavy OLAP
      redis: 'CACHE'                 // Session and cache storage
    };

    this.healthStatus = {
      postgresSequelize: false,
      postgres: false,
      pgvector: false,
      citus: false,
      timescale: false,
      columnar: false,
      jsonb: true, // Native to PostgreSQL
      duckdb: false,
      redis: false,
      lastCheck: null
    };
  }

  /**
   * Initialize all database connections
   */
  async initializeAll() {
    console.log('🚀 Initializing Database Orchestrator...');
    console.log('📊 Architecture: PostgreSQL (PRIMARY ONLY)');

    let criticalFailures = 0;

    // Initialize health status
    this.healthStatus = {
      postgresSequelize: false,
      postgres: false,
      pgvector: false,
      citus: false,
      duckdb: false,
      redis: false,
      lastCheck: Date.now()
    };

    // Connect to PostgreSQL Sequelize (PRIMARY DATABASE)
    try {
      console.log('🔌 Connecting to PostgreSQL Sequelize (PRIMARY Database)...');
      await connectToPostgresDB();
      this.connections.postgresSequelize = postgresSequelize;
      this.healthStatus.postgresSequelize = true;
      console.log('✅ PostgreSQL Sequelize connected successfully (PRIMARY)');
    } catch (error) {
      console.error('❌ PostgreSQL Sequelize connection failed:', error.message);
      criticalFailures++;
    }

    // Connect to PostgreSQL (HELPER - Optional but recommended)
    try {
      console.log('🔌 Connecting to PostgreSQL (Helper Database)...');
      this.connections.postgres = await connectPostgres();
      this.healthStatus.postgres = true;
      const pgStatus = getPostgresStatus();
      this.healthStatus.postgres = true;
      this.healthStatus.pgvector = !!pgStatus.vectorEnabled;
      this.healthStatus.citus = !!pgStatus.citusEnabled;
      this.healthStatus.timescale = !!pgStatus.timescaleEnabled;
      this.healthStatus.columnar = !!pgStatus.columnarEnabled;
      this.healthStatus.jsonb = true; // Native PostgreSQL feature
      console.log('✅ PostgreSQL connected successfully');
      if (pgStatus.vectorEnabled) console.log('   ↳ pgvector extension active');
      if (pgStatus.timescaleEnabled) console.log('   ↳ TimescaleDB extension active');
      if (pgStatus.columnarEnabled) console.log('   ↳ Columnar storage active');
      if (pgStatus.citusEnabled) {
        console.log('   ↳ Citus distributed mode active');
      }
      if (pgStatus.vectorEnabled) {
        console.log(`   ↳ PGVector enabled (dimension ${pgStatus.vectorDimension})`);
      }
    } catch (error) {
      console.warn('⚠️  PostgreSQL connection failed (continuing without helper DB):', error.message);
      this.healthStatus.postgres = false;
      this.healthStatus.pgvector = false;
      this.healthStatus.citus = false;
    }

    // Connect to DuckDB (OPTIONAL - Only if explicitly enabled)
    if (process.env.DUCKDB_ENABLED === 'true') {
      try {
        console.log('🔌 Connecting to DuckDB (Analytics Database)...');
        this.connections.duckdb = await connectDuckDB();
        if (this.connections.duckdb) {
          this.healthStatus.duckdb = true;
          console.log('✅ DuckDB connected successfully');
        } else {
          console.warn('⚠️  DuckDB connection failed (continuing without analytics)');
          this.healthStatus.duckdb = false;
        }
      } catch (error) {
        console.warn('⚠️  DuckDB initialization failed (continuing without analytics):', error.message);
        this.healthStatus.duckdb = false;
      }
    } else {
      console.log('ℹ️  DuckDB disabled (set DUCKDB_ENABLED=true to enable optional analytics engine)');
      this.healthStatus.duckdb = false;
    }

    // Connect to Redis (CACHE - Critical for production)
    try {
      console.log('🔌 Connecting to Redis (Cache Database)...');
      this.connections.redis = await connectRedis();
      this.healthStatus.redis = true;
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      this.healthStatus.redis = false;
      criticalFailures++;
      throw new Error(`Redis connection failed: ${error.message}`);
    }

    // Summary
    const { lastCheck, ...dbStates } = this.healthStatus;
    const connectedDatabases = Object.values(dbStates).filter(Boolean).length;
    const totalDatabases = Object.keys(dbStates).length;

    console.log(`📊 Database Orchestrator Status: ${connectedDatabases}/${totalDatabases} connected`);
    
    if (criticalFailures > 0) {
      console.error('❌ Critical database connections failed! Application may not function properly.');
      throw new Error(`${criticalFailures} critical database connection(s) failed`);
    }

    if (connectedDatabases >= 2) {
      console.log('✅ Minimum database requirements met - Application ready!');
    } else {
      console.warn('⚠️  Limited database connectivity - Some features may be unavailable');
    }

    return this.healthStatus;
  }

  /**
   * Route query to appropriate database
   */
  async routeQuery(operation, options = {}) {
    const { database, fallback = 'postgresSequelize' } = options;

    // Direct database specification
    if (database && this.connections[database]) {
      return this.connections[database];
    }

    // Intelligent routing based on operation type
    switch (operation) {
      case 'analytics':
      case 'olap':
      case 'reporting':
        return this.connections.duckdb || this.connections[fallback];
      
      case 'document':
      case 'json':
      case 'unstructured':
        return this.connections.postgres || this.connections[fallback];
      
      case 'cache':
      case 'session':
      case 'temporary':
        return this.connections.redis || this.connections[fallback];
      
      default:
        return this.connections[fallback];
    }
  }

  /**
   * Health check method for API endpoints
   */
  async healthCheck() {
    const status = await this.getHealthStatus();
    const { lastCheck, ...dbStates } = status;
    const connectedCount = Object.values(dbStates).filter(Boolean).length;
    const totalCount = Object.keys(dbStates).length;
    
    return {
      status: connectedCount >= 2 ? 'healthy' : 'degraded',
      databases: dbStates,
      connections: `${connectedCount}/${totalCount}`,
      lastCheck,
      timestamp: new Date().toISOString(),
      ...dbStates
    };
  }

  /**
   * Get health status of all databases
   */
  async getHealthStatus(forceRefresh = false) {
    if (!forceRefresh && this.healthStatus.lastCheck && 
        (Date.now() - this.healthStatus.lastCheck < 30000)) {
      return this.healthStatus;
    }

    // Test all connections
    const [postgres, duck, redis] = await Promise.allSettled([
      this.testPostgresDB(),
      this.testDuckDB(),
      this.testRedis()
    ]);

    const postgresHealthy = postgres.status === 'fulfilled' && postgres.value.success;
    const postgresMetadata = postgresHealthy ? postgres.value.metadata || {} : {};
    this.healthStatus = {
      postgres: postgresHealthy,
      pgvector: !!postgresMetadata.pgvector,
      citus: !!postgresMetadata.citus,
      duckdb: duck.status === 'fulfilled' && duck.value.success,
      redis: redis.status === 'fulfilled' && redis.value.success,
      lastCheck: Date.now()
    };

    return this.healthStatus;
  }

  /**
   * Test individual database connections
   */
  async testPostgresDB() {
    try {
      return await testPostgres();
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async testDuckDB() {
    try {
      return await testDuckDB();
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async testRedis() {
    try {
      return await testRedis();
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Close all database connections
   */
  async closeAll() {
    console.log('🔌 Closing all database connections...');

    const closePromises = [];

    if (this.connections.duckdb) {
      closePromises.push(closeDuckDB().catch(err => 
        console.warn('⚠️  DuckDB close warning:', err.message)
      ));
    }

    if (this.connections.postgres) {
      closePromises.push(closePostgres().catch(err => 
        console.warn('⚠️  PostgreSQL close warning:', err.message)
      ));
    }

    if (this.connections.redis) {
      closePromises.push(closeRedis().catch(err => 
        console.warn('⚠️  Redis close warning:', err.message)
      ));
    }

    if (this.connections.postgresSequelize) {
      closePromises.push(this.connections.postgresSequelize.close().catch(err => 
        console.warn('⚠️  PostgreSQL Sequelize close warning:', err.message)
      ));
    }

    await Promise.allSettled(closePromises);
    console.log('✅ All database connections closed');
  }

  /**
   * Get database statistics
   */
  getStatistics() {
    const { lastCheck, ...dbStates } = this.healthStatus;
    const stats = {
      connections: Object.keys(this.connections).length,
      active: Object.values(dbStates).filter(Boolean).length,
      roles: this.roles,
      status: { ...dbStates, lastCheck },
      uptime: lastCheck ? Date.now() - lastCheck : 0
    };

    return stats;
  }
}

// Create singleton instance
const dbOrchestrator = new DatabaseOrchestrator();

// Export the orchestrator instance and key functions
export default dbOrchestrator;
export { dbOrchestrator as orchestrator };

// Export individual functions for convenience
export const initializeAllDatabases = () => dbOrchestrator.initializeAll();
export const getDbHealthStatus = (forceRefresh) => dbOrchestrator.getHealthStatus(forceRefresh);
export const routeQuery = (operation, options) => dbOrchestrator.routeQuery(operation, options);
export const closeAllDatabases = () => dbOrchestrator.closeAll();
export const getDatabaseStatistics = () => dbOrchestrator.getStatistics();