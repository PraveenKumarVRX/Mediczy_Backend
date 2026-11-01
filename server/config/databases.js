import dotenv from 'dotenv';
import { connectPostgres, closePostgres, getPool as getPostgresPool } from '../db/postgres.js';

if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config();
}

// ============================================================================
// DATABASE ARCHITECTURE (PostgreSQL Primary)
// ============================================================================
// PostgreSQL — PRIMARY DATABASE  (OLTP: CRUD, ACID, JSONB, full-text, pgvector)
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
      'Business intelligence dashboards, reports and aggregations',
    ],
    operations: ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'JOIN', 'TRANSACTION', 'JSONB', 'CTE', 'GROUP BY', 'WINDOW FUNCTIONS'],
  },
};

// ============================
// INITIALIZE ALL DATABASES
// ============================

export const initAllDatabases = async () => {
  console.log('🔄 Initializing database architecture…\n');

  const results = { postgres: false };

  try {
    await initPostgres();
    results.postgres = true;
  } catch {
    console.error('⚠️  PostgreSQL initialization failed, continuing…');
  }

  console.log('\n📊 Database Architecture Status:');
  console.log(`   PostgreSQL (Primary):    ${results.postgres ? '✅' : '❌'}\n`);

  return results;
};

export const closeAllDatabases = async () => {
  console.log('Closing all database connections…');
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
  initAllDatabases,
  getPostgres,
  getPostgresHelper,
  closeAllDatabases,
  DATABASE_USAGE,
};
