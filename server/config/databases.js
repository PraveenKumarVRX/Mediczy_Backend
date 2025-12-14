import mysql from 'mysql2/promise';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { connectPostgres, closePostgres } from '../db/postgres.js';

dotenv.config();

const execPromise = promisify(exec);

// ============================================================================
// MULTI-DATABASE ARCHITECTURE
// ============================================================================
// MariaDB   - PRIMARY DATABASE (Relational, Transactional, ACID)
// PostgreSQL - HELPER DATABASE (Document-style JSONB, contextual cache)
// DuckDB    - ANALYTICS ENGINE (OLAP, Reporting, Data Warehouse)
// ============================================================================

// ============================
// 1. MARIADB (Primary Database)
// ============================
// Purpose: Core application data, user accounts, appointments, medical records
// Use Cases: CRUD operations, transactions, relationships, authentication

let mariaDBPool = null;

export const initMariaDB = async () => {
  try {
    mariaDBPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'mediczy',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'mediczy',
      waitForConnections: true,
      connectionLimit: 20,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    // Test connection
    const [rows] = await mariaDBPool.execute('SELECT 1 as test');
    console.log('✅ MariaDB (Primary DB) connected successfully');
    return mariaDBPool;
  } catch (error) {
    console.error('❌ MariaDB connection failed:', error.message);
    throw error;
  }
};

export const getMariaDB = () => mariaDBPool;

// ============================
// 2. POSTGRESQL (Helper Database)
// ============================
// Purpose: JSONB-powered helper store for chat sessions, logs, contextual data
// Use Cases: Semi-structured documents, helper replicas, real-time context cache

let postgresPool = null;

export const initPostgresHelper = async () => {
  try {
    postgresPool = await connectPostgres();
    console.log('✅ PostgreSQL (Helper DB) connected successfully');
    return postgresPool;
  } catch (error) {
    console.error('❌ PostgreSQL helper connection failed:', error.message);
    throw error;
  }
};

export const getPostgresHelper = () => postgresPool;

// ============================
// 3. DUCKDB (Analytics Engine)
// ============================
// Purpose: Analytics, reporting, data warehouse, complex aggregations
// Use Cases: OLAP queries, business intelligence, historical data analysis

const DUCKDB_PATH = process.env.DUCKDB_PATH || './data/analytics.duckdb';

export const initDuckDB = async () => {
  try {
    // Create data directory if it doesn't exist
    await execPromise('mkdir -p ./data');
    
    // Test DuckDB connection via CLI
    const { stdout } = await execPromise(`duckdb ${DUCKDB_PATH} "SELECT 'DuckDB Connected' as status"`);
    
    console.log('✅ DuckDB (Analytics Engine) initialized successfully');
    return DUCKDB_PATH;
  } catch (error) {
    console.error('❌ DuckDB initialization failed:', error.message);
    throw error;
  }
};

// Execute DuckDB query via CLI (for analytics/reporting)
export const executeDuckDBQuery = async (query) => {
  try {
    const { stdout } = await execPromise(`duckdb ${DUCKDB_PATH} "${query}"`);
    return stdout;
  } catch (error) {
    console.error('DuckDB query error:', error.message);
    throw error;
  }
};

// ============================
// DATABASE USAGE GUIDELINES
// ============================

export const DATABASE_USAGE = {
  MariaDB: {
    useCases: [
      'User accounts and authentication',
      'Patient records and medical history',
      'Doctor profiles and schedules',
      'Appointments and bookings',
      'Prescriptions and billing',
      'Hospital and clinic data',
      'Insurance policies',
      'Transactional operations (ACID)'
    ],
    operations: ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'JOIN', 'TRANSACTION']
  },
  
  PostgreSQL: {
    useCases: [
      'Chatbot session history (JSONB)',
      'Audit trails and contextual logs',
      'Helper replicas from MariaDB',
      'Flexible semi-structured documents',
      'Real-time context cache',
      'Feature toggles and metadata',
      'Analytics staging before DuckDB'
    ],
    operations: ['INSERT', 'UPDATE', 'UPSERT', 'JSONB query', 'CTE', 'INDEXED SEARCH']
  },
  
  DuckDB: {
    useCases: [
      'Business intelligence dashboards',
      'Monthly/yearly reports',
      'Patient statistics and trends',
      'Revenue analytics',
      'Performance metrics',
      'Historical data analysis',
      'Complex aggregations',
      'Data export for ML/AI'
    ],
    operations: ['SELECT', 'GROUP BY', 'WINDOW FUNCTIONS', 'OLAP QUERIES']
  }
};

// ============================
// INITIALIZE ALL DATABASES
// ============================

export const initAllDatabases = async () => {
  console.log('🔄 Initializing multi-database architecture...\n');
  
  const results = {
    mariadb: false,
    postgres: false,
    duckdb: false
  };

  try {
    // Initialize MariaDB (Primary)
    await initMariaDB();
    results.mariadb = true;
  } catch (error) {
    console.error('⚠️  MariaDB initialization failed, continuing...');
  }

  try {
    // Initialize PostgreSQL helper (Documents)
    await initPostgresHelper();
    results.postgres = true;
  } catch (error) {
    console.error('⚠️  PostgreSQL helper initialization failed, continuing...');
  }

  try {
    // Initialize DuckDB (Analytics)
    await initDuckDB();
    results.duckdb = true;
  } catch (error) {
    console.error('⚠️  DuckDB initialization failed, continuing...');
  }

  console.log('\n📊 Database Architecture Status:');
  console.log(`   MariaDB    (Primary):    ${results.mariadb ? '✅' : '❌'}`);
  console.log(`   PostgreSQL (Helper):     ${results.postgres ? '✅' : '❌'}`);
  console.log(`   DuckDB     (Analytics):  ${results.duckdb ? '✅' : '❌'}\n`);

  if (results.mariadb && results.postgres && results.duckdb) {
    console.log('🎉 All databases initialized successfully!\n');
  } else {
    console.warn('⚠️  Some databases failed to initialize\n');
  }

  return results;
};

// Graceful shutdown
export const closeAllDatabases = async () => {
  console.log('Closing all database connections...');
  
  if (mariaDBPool) {
    await mariaDBPool.end();
    console.log('✅ MariaDB closed');
  }
  
  if (postgresPool) {
    await closePostgres();
    postgresPool = null;
    console.log('✅ PostgreSQL helper closed');
  }
  
  console.log('✅ All databases closed');
};

export default {
  initMariaDB,
  initPostgresHelper,
  initDuckDB,
  initAllDatabases,
  getMariaDB,
  getPostgresHelper,
  executeDuckDBQuery,
  closeAllDatabases,
  DATABASE_USAGE
};
