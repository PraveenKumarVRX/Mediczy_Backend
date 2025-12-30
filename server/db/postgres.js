import dotenv from 'dotenv';
import pkg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root first (Mediczy/.env has all settings)
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
// server/.env can override (but only if variable not already set)
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pkg;

let pool = null;
let isConnected = false;
let schemaInitialized = false;
let extensionsEnabled = false;
let pgvectorEnabled = false;
let citusConfigured = false;
let timescaleConfigured = false;
let columnarEnabled = false;
let vectorIndexCreated = false;

// PostgreSQL Extension Configuration
const PGVECTOR_ENABLED = process.env.PGVECTOR_ENABLED !== 'false';
const PGVECTOR_DIMENSION = parseInt(
  process.env.PGVECTOR_DIMENSION || process.env.VECTOR_DIMENSION || '1536',
  10
);
const PGVECTOR_DISTANCE = (process.env.PGVECTOR_DISTANCE || 'cosine').toLowerCase();
const PGVECTOR_IVFFLAT_LISTS = parseInt(
  process.env.PGVECTOR_IVFFLAT_LISTS || '100',
  10
);

// Citus Configuration (Distributed PostgreSQL)
const CITUS_ENABLED = process.env.CITUS_ENABLED === 'true';
const CITUS_WORKERS = (process.env.CITUS_WORKERS || '')
  .split(',')
  .map(worker => worker.trim())
  .filter(Boolean);

// TimescaleDB Configuration (Time-series data)
const TIMESCALE_ENABLED = process.env.TIMESCALE_ENABLED === 'true';

// Columnar Storage Configuration
const COLUMNAR_ENABLED = process.env.COLUMNAR_ENABLED === 'true';

// Debug: Log extension config at load time
console.log(`🔧 PostgreSQL Extension Config: CITUS=${CITUS_ENABLED}, TIMESCALE=${TIMESCALE_ENABLED}, COLUMNAR=${COLUMNAR_ENABLED}, PGVECTOR=${PGVECTOR_ENABLED}`);

// JSONB is native to PostgreSQL - always enabled
const JSONB_ENABLED = true;

const CITUS_TABLES = [
  { table: 'chatbot_sessions', distributionColumn: 'session_id' },
  { table: 'helper_replicas', distributionColumn: 'collection' },
  { table: 'medical_embeddings', distributionColumn: 'embedding_id' }
];

function buildConfig() {
  const connectionString = process.env.POSTGRES_URI || process.env.PG_URI;
  if (connectionString) {
    return {
      connectionString,
      max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      application_name: process.env.POSTGRES_APP_NAME || 'mediczy_helper',
      ssl: process.env.POSTGRES_SSL === 'true' || process.env.PG_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined
    };
  }

  return {
    host: process.env.POSTGRES_HOST || process.env.PG_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || process.env.PG_PORT || '5432', 10),
    database: process.env.POSTGRES_DATABASE || process.env.PG_DATABASE || 'mediczy_ai',
    user: process.env.POSTGRES_USER || process.env.PG_USER || 'mediczy_ai',
    password: process.env.POSTGRES_PASSWORD || process.env.PG_PASSWORD || 'change_me',
    max: parseInt(process.env.POSTGRES_POOL_MAX || process.env.PG_POOL_MAX || '10', 10),
    min: parseInt(process.env.POSTGRES_POOL_MIN || process.env.PG_POOL_MIN || '0', 10),
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    connectionTimeoutMillis: 5000,
    application_name: process.env.POSTGRES_APP_NAME || 'mediczy_helper',
    ssl: process.env.POSTGRES_SSL === 'true' || process.env.PG_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined
  };
}

async function ensureSchema(client) {
  if (schemaInitialized) {
    return;
  }

  // Enable PostgreSQL extensions
  const extensionStatements = [];
  
  if (PGVECTOR_ENABLED) {
    extensionStatements.push('CREATE EXTENSION IF NOT EXISTS vector;');
  }
  
  if (TIMESCALE_ENABLED) {
    extensionStatements.push('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
  }
  
  if (CITUS_ENABLED) {
    extensionStatements.push('CREATE EXTENSION IF NOT EXISTS citus;');
  }
  
  if (COLUMNAR_ENABLED) {
    extensionStatements.push('CREATE EXTENSION IF NOT EXISTS columnar;');
  }
  
  // Always enable these useful extensions
  extensionStatements.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  extensionStatements.push('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  extensionStatements.push('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  
  for (const stmt of extensionStatements) {
    try {
      await client.query(stmt);
    } catch (err) {
      console.warn(`Extension setup: ${err.message}`);
    }
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS chatbot_sessions (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      user_role TEXT DEFAULT 'user',
      language TEXT DEFAULT 'en',
      context_snapshot JSONB DEFAULT '{}'::jsonb,
      last_intent TEXT,
      last_provider TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      messages JSONB DEFAULT '[]'::jsonb,
      message_count INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    'CREATE INDEX IF NOT EXISTS idx_chatbot_session_user_id ON chatbot_sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_chatbot_session_last_interaction ON chatbot_sessions(last_interaction_at DESC)',
    `CREATE TABLE IF NOT EXISTS helper_replicas (
      id BIGSERIAL PRIMARY KEY,
      collection TEXT NOT NULL,
      source_id TEXT,
      payload JSONB NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      replicated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT helper_replicas_collection_source UNIQUE (collection, source_id)
    )`
  ];

  if (PGVECTOR_ENABLED) {
    statements.push(
      `CREATE TABLE IF NOT EXISTS medical_embeddings (
        id BIGSERIAL PRIMARY KEY,
        embedding_id TEXT NOT NULL UNIQUE,
        namespace TEXT DEFAULT 'default',
        metadata JSONB DEFAULT '{}'::jsonb,
        vector vector(${PGVECTOR_DIMENSION}) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`
    );
    statements.push('CREATE INDEX IF NOT EXISTS idx_medical_embeddings_namespace ON medical_embeddings(namespace)');
    statements.push('CREATE INDEX IF NOT EXISTS idx_medical_embeddings_created_at ON medical_embeddings(created_at DESC)');
  }

  for (const statement of statements) {
    await client.query(statement);
  }

  schemaInitialized = true;
}

async function enableExtensions(client) {
  if (extensionsEnabled) {
    return;
  }

  // Enable pgvector for AI embeddings
  if (PGVECTOR_ENABLED) {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      pgvectorEnabled = true;
      console.log('✅ PostgreSQL: PGVector extension ensured');
    } catch (error) {
      console.warn('⚠️  PostgreSQL pgvector extension warning:', error.message);
    }
  }

  // Enable TimescaleDB for time-series data
  if (TIMESCALE_ENABLED) {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
      timescaleConfigured = true;
      console.log('✅ PostgreSQL: TimescaleDB extension ensured');
    } catch (error) {
      console.warn('⚠️  PostgreSQL TimescaleDB extension warning:', error.message);
    }
  }

  // Enable Citus for distributed PostgreSQL
  if (CITUS_ENABLED) {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS citus');
      citusConfigured = true;
      console.log('✅ PostgreSQL: Citus extension ensured');
    } catch (error) {
      console.warn('⚠️  PostgreSQL Citus extension warning:', error.message);
    }
  }

  // Enable Columnar for analytics (citus_columnar in Citus 11+)
  if (COLUMNAR_ENABLED) {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS citus_columnar');
      columnarEnabled = true;
      console.log('✅ PostgreSQL: Columnar storage ensured');
    } catch (error) {
      console.warn('⚠️  PostgreSQL Columnar extension warning:', error.message);
    }
  }

  extensionsEnabled = true;
}

function getVectorOperatorClass() {
  switch (PGVECTOR_DISTANCE) {
    case 'l2':
    case 'euclidean':
      return 'vector_l2_ops';
    case 'ip':
    case 'inner_product':
      return 'vector_ip_ops';
    case 'cosine':
    default:
      return 'vector_cosine_ops';
  }
}

async function ensureVectorIndex(client) {
  if (!PGVECTOR_ENABLED || vectorIndexCreated) {
    return;
  }

  try {
    const opClass = getVectorOperatorClass();
    await client.query(
      `CREATE INDEX IF NOT EXISTS medical_embeddings_vector_idx
       ON medical_embeddings
       USING ivfflat (vector ${opClass})
       WITH (lists = ${PGVECTOR_IVFFLAT_LISTS})`
    );
    vectorIndexCreated = true;
    console.log('✅ PostgreSQL: PGVector IVFFlat index ensured');
  } catch (error) {
    console.warn('⚠️  PGVector index creation skipped:', error.message);
  }
}

async function registerCitusWorkers(client) {
  if (!CITUS_ENABLED || citusConfigured || !CITUS_WORKERS.length) {
    return;
  }

  try {
    const { rows } = await client.query('SELECT node_name, node_port FROM master_get_active_worker_nodes()');
    const existingNodes = new Set(rows.map(row => `${row.node_name}:${row.node_port}`));

    for (const worker of CITUS_WORKERS) {
      const [host, port] = worker.split(':').map(part => part.trim());
      if (!host || !port) {
        console.warn(`⚠️  Invalid CITUS_WORKERS entry skipped: ${worker}`);
        continue;
      }

      const key = `${host}:${port}`;
      if (existingNodes.has(key)) {
        continue;
      }

      try {
        await client.query('SELECT master_add_node($1, $2)', [host, parseInt(port, 10)]);
        console.log(`✅ Citus: Registered worker ${key}`);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.warn(`⚠️  Unable to add Citus worker ${key}:`, error.message);
        }
      }
    }

    citusConfigured = true;
  } catch (error) {
    console.warn('⚠️  Citus worker registration skipped:', error.message);
  }
}

async function distributeTables(client) {
  if (!CITUS_ENABLED) {
    return;
  }

  try {
    const { rows } = await client.query('SELECT table_name FROM citus_distributed_tables');
    const distributed = new Set(rows.map(row => row.table_name));

    for (const { table, distributionColumn } of CITUS_TABLES) {
      if (distributed.has(table)) {
        continue;
      }

      try {
        await client.query('SELECT create_distributed_table($1, $2)', [table, distributionColumn]);
        console.log(`✅ Citus: Distributed table ${table} using ${distributionColumn}`);
      } catch (error) {
        if (!error.message.includes('already distributed')) {
          console.warn(`⚠️  Citus distribution skipped for ${table}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Citus distribution check failed:', error.message);
  }
}

export async function connectPostgres() {
  if (pool && isConnected) {
    return pool;
  }

  const config = buildConfig();
  pool = new Pool(config);

  pool.on('error', (err) => {
    console.error('❌ PostgreSQL: Unexpected error on idle client', err.message);
    isConnected = false;
  });

  await pool.query('SELECT 1');
  await enableExtensions(pool);
  await ensureSchema(pool);
  await registerCitusWorkers(pool);
  await distributeTables(pool);
  await ensureVectorIndex(pool);

  isConnected = true;
  console.log('✅ PostgreSQL: Connected successfully');
  return pool;
}

export function getPostgresPool() {
  if (!pool) {
    throw new Error('PostgreSQL pool has not been initialized. Call connectPostgres() first.');
  }
  return pool;
}

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
    schemaInitialized = false;
    console.log('✅ PostgreSQL: Connection closed');
  }
}

export function getPostgresStatus() {
  return {
    connected: isConnected,
    host: process.env.POSTGRES_HOST || process.env.PG_HOST || '127.0.0.1',
    database: process.env.POSTGRES_DATABASE || process.env.PG_DATABASE || 'mediczy_ai',
    poolSize: pool?.totalCount || 0,
    citusEnabled: CITUS_ENABLED && citusConfigured,
    vectorEnabled: PGVECTOR_ENABLED && pgvectorEnabled,
    timescaleEnabled: TIMESCALE_ENABLED && timescaleConfigured,
    columnarEnabled: COLUMNAR_ENABLED && columnarEnabled,
    jsonbEnabled: JSONB_ENABLED, // Always true - native PostgreSQL feature
    vectorDimension: PGVECTOR_DIMENSION,
    extensionsEnabled: {
      pgvector: pgvectorEnabled,
      timescale: timescaleConfigured,
      citus: citusConfigured,
      columnar: columnarEnabled,
      jsonb: true
    }
  };
}

export async function testPostgres() {
  try {
    const client = await connectPostgres();
    const [{ rows: [{ now }] }] = await Promise.all([
      client.query('SELECT NOW()')
    ]);
    return {
      success: true,
      message: 'PostgreSQL connection successful',
      metadata: {
        pgvector: PGVECTOR_ENABLED,
        citus: CITUS_ENABLED,
        timestamp: now
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

process.on('SIGINT', async () => {
  await closePostgres();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePostgres();
  process.exit(0);
});

export default connectPostgres;
