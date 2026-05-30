import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { connectPostgres, closePostgres, getPool as getPostgresPool } from '../db/postgres.js';

if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config();
}

const execPromise = promisify(exec);

// ============================================================================
// DATABASE ARCHITECTURE (PostgreSQL Primary)
// ============================================================================
// PostgreSQL - PRIMARY DATABASE (Relational, JSONB, Full-text search)
// DuckDB     - ANALYTICS ENGINE (OLAP, Reporting, Data Warehouse)
// ============================================================================

// ============================
// 1. POSTGRESQL (Primary Database)
// ============================
// Purpose: All application data - users, appointments, medical records, JSONB docs
// Use Cases: CRUD, transactions, JSONB, full-text search, relationships

let postgresPool = null;

export const initPostgres = async () => {
  try {
    postgresPool = await connectPostgres();
    console.log('✅ PostgreSQL (Primary DB) connected successfully');
    return postgresPool;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    throw error;
  }
};

export const getPostgres = () => postgresPool || getPostgresPool();

// Aliases for backward compatibility
export const initPostgresHelper = initPostgres;
export const getPostgresHelper = getPostgres;

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
  PostgreSQL: {
    useCases: [
      'User accounts and authentication',
      'Patient records and medical history',
      'Doctor profiles and schedules',
      'Appointments and bookings',
      'Prescriptions and billing',
      'Hospital and clinic data',
      'Insurance policies',
      'Chatbot session history (JSONB)',
      'Audit trails and contextual logs',
      'Transactional operations (ACID)',
      'Full-text search'
    ],
    operations: ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'JOIN', 'TRANSACTION', 'JSONB', 'CTE']
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
  console.log('🔄 Initializing database architecture...\n');
  
  const results = {
    postgres: false,
    duckdb: false
  };

  try {
    // Initialize PostgreSQL (Primary)
    await initPostgres();
    results.postgres = true;
  } catch (error) {
    console.error('⚠️  PostgreSQL initialization failed, continuing...');
  }

  try {
    // Initialize DuckDB (Analytics)
    await initDuckDB();
    results.duckdb = true;
  } catch (error) {
    console.error('⚠️  DuckDB initialization failed, continuing...');
  }

  console.log('\n📊 Database Architecture Status:');
  console.log(`   PostgreSQL (Primary):    ${results.postgres ? '✅' : '❌'}`);
  console.log(`   DuckDB     (Analytics):  ${results.duckdb ? '✅' : '❌'}\n`);

  if (results.postgres && results.duckdb) {
    console.log('🎉 All databases initialized successfully!\n');
  } else {
    console.warn('⚠️  Some databases failed to initialize\n');
  }

  return results;
};

// Graceful shutdown
export const closeAllDatabases = async () => {
  console.log('Closing all database connections...');
  
  if (postgresPool) {
    await closePostgres();
    postgresPool = null;
    console.log('✅ PostgreSQL closed');
  }
  
  console.log('✅ All databases closed');
};

export default {
  initPostgres,
  initPostgresHelper,
  initDuckDB,
  initAllDatabases,
  getPostgres,
  getPostgresHelper,
  executeDuckDBQuery,
  closeAllDatabases,
  DATABASE_USAGE
};
