import dotenv from 'dotenv';
import { connectPostgres, closePostgres, getPool as getPostgresPool } from '../db/postgres.js';

if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config();
}

// ============================================================================
// DATABASE ARCHITECTURE (PostgreSQL Primary + DuckDB Analytics)
// ============================================================================
// PostgreSQL — PRIMARY DATABASE  (OLTP: CRUD, ACID, JSONB, full-text, pgvector)
// DuckDB     — ANALYTICS ENGINE  (OLAP: dashboards, reports, aggregations)
// ============================================================================

// ============================
// 1. POSTGRESQL
// ============================

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

export const initPostgresHelper = initPostgres;
export const getPostgresHelper = getPostgres;

// ============================
// 2. DUCKDB — Native Node.js binding (NOT shell exec)
// ============================
// Using the native duckdb npm package for:
//   - Zero shell-injection risk (no exec/execFile)
//   - ~50-100ms saved per query (no child process spawn)
//   - Persistent in-process connection

const DUCKDB_PATH = process.env.DUCKDB_PATH || './data/analytics.duckdb';

let _duckdb = null;
let _duckdbConn = null;

async function getDuckDBModule() {
  // Dynamic import so the app still starts if duckdb isn't installed
  try {
    const mod = await import('duckdb');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export const initDuckDB = async () => {
  try {
    const DuckDB = await getDuckDBModule();
    if (!DuckDB) throw new Error('duckdb package not available');

    await import('fs').then(({ mkdirSync }) => mkdirSync('./data', { recursive: true }));

    _duckdb = new DuckDB.Database(DUCKDB_PATH, { access_mode: 'READ_WRITE' });
    _duckdbConn = _duckdb.connect();

    // Smoke-test
    await executeDuckDBQuery("SELECT 'DuckDB Connected' AS status");

    console.log('✅ DuckDB (Analytics Engine) initialized via native binding');
    return _duckdbConn;
  } catch (error) {
    console.error('❌ DuckDB initialization failed:', error.message);
    throw error;
  }
};

/**
 * Execute a DuckDB query safely via the native Node binding.
 * @param {string}  sql    Parameterized SQL string
 * @param {Array}   params Positional parameters ($1, $2 …)
 * @returns {Promise<Array>} Result rows
 */
export const executeDuckDBQuery = (sql, params = []) => {
  if (!_duckdbConn) {
    return Promise.reject(new Error('DuckDB not initialized — call initDuckDB() first'));
  }
  return new Promise((resolve, reject) => {
    _duckdbConn.all(sql, ...params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
};

export const closeDuckDB = () =>
  new Promise((resolve) => {
    if (_duckdb) {
      _duckdb.close(() => {
        _duckdb = null;
        _duckdbConn = null;
        console.log('✅ DuckDB closed');
        resolve();
      });
    } else {
      resolve();
    }
  });

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
      'Full-text search',
    ],
    operations: ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'JOIN', 'TRANSACTION', 'JSONB', 'CTE'],
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
      'Data export for ML/AI',
    ],
    operations: ['SELECT', 'GROUP BY', 'WINDOW FUNCTIONS', 'OLAP QUERIES'],
  },
};

// ============================
// INITIALIZE ALL DATABASES
// ============================

export const initAllDatabases = async () => {
  console.log('🔄 Initializing database architecture…\n');

  const results = { postgres: false, duckdb: false };

  try {
    await initPostgres();
    results.postgres = true;
  } catch {
    console.error('⚠️  PostgreSQL initialization failed, continuing…');
  }

  try {
    await initDuckDB();
    results.duckdb = true;
  } catch {
    console.error('⚠️  DuckDB initialization failed, continuing…');
  }

  console.log('\n📊 Database Architecture Status:');
  console.log(`   PostgreSQL (Primary):    ${results.postgres ? '✅' : '❌'}`);
  console.log(`   DuckDB     (Analytics):  ${results.duckdb  ? '✅' : '❌'}\n`);

  return results;
};

export const closeAllDatabases = async () => {
  console.log('Closing all database connections…');
  if (postgresPool) {
    await closePostgres();
    postgresPool = null;
    console.log('✅ PostgreSQL closed');
  }
  await closeDuckDB();
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
  closeDuckDB,
  closeAllDatabases,
  DATABASE_USAGE,
};
