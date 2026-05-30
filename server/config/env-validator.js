import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (parent of server directory)
if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const REQUIRED_ENV_VARS = {
  // Security
  JWT_SECRET: 'JWT secret key for token signing',
  ENCRYPTION_KEY: 'Encryption key for sensitive data (PHI/PII)',

  // Node Environment
  NODE_ENV: 'Node environment (production/development)',
};

const OPTIONAL_ENV_VARS = {
  // Server Config
  PORT: { default: '8000', description: 'Server port' },
  CORS_ORIGIN: { default: '', description: 'Comma-separated allowed origins' },
  POSTGRES_PORT: { default: '5432', description: 'PostgreSQL helper port' },
  POSTGRES_POOL_MAX: { default: '10', description: 'PostgreSQL helper max pool size' },
  POSTGRES_POOL_MIN: { default: '0', description: 'PostgreSQL helper min pool size' },
  CITUS_ENABLED: { default: 'false', description: 'Enable Citus distributed coordinator for PostgreSQL helper' },
  CITUS_WORKERS: { default: '', description: 'Comma-separated list of host:port worker nodes' },
  PGVECTOR_ENABLED: { default: 'true', description: 'Enable PGVector extension for embeddings' },
  PGVECTOR_DIMENSION: { default: '1536', description: 'Vector dimension for PGVector embeddings' },
  PGVECTOR_DISTANCE: { default: 'cosine', description: 'Distance metric (cosine|l2|ip)' },
  PGVECTOR_IVFFLAT_LISTS: { default: '100', description: 'IVFFlat list count for PGVector index' },
  VECTOR_NAMESPACE: { default: 'default', description: 'Default namespace for embeddings' },
  VECTOR_STORE_TYPE: { default: 'pgvector', description: 'Vector database backend type' },
  
  // Feature Flags
  DISABLE_KAFKA: { default: 'false', description: 'Disable Kafka integration' },
  DUCKDB_ENABLED: { default: 'false', description: 'Enable DuckDB analytics engine' },
  
  // Integrations
  GROQ_API_KEY: { default: '', description: 'Groq AI API key' },
  ADMIN_EMAIL: { default: 'admin@mediczy.com', description: 'Admin email' },
  
  // Database URLs
  DUCKDB_PATH: { default: './data/mediczy.duckdb', description: 'DuckDB file path' },
  VECTOR_DB_URL: { default: 'http://localhost:8001', description: 'Vector DB URL' },
  INTELLIGENT_DB_URL: { default: 'http://localhost:5005', description: 'Intelligent DB service URL' },
};

export function validateEnvironment() {
  const errors = [];
  const warnings = [];
  
  console.log('\n🔍 Validating environment configuration...\n');
  
  // Check required variables
  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    if (!process.env[key] || process.env[key].trim() === '') {
      errors.push(`❌ Missing required env var: ${key} - ${description}`);
    } else {
      console.log(`✅ ${key}: configured`);
    }
  }

  const postgresUri = process.env.POSTGRES_URI || process.env.PG_URI;
  const postgresConfigSet = process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_DATABASE;
  if (!postgresUri && !postgresConfigSet) {
    errors.push('❌ Missing PostgreSQL configuration (set POSTGRES_URI or POSTGRES_HOST/USER/PASSWORD/DATABASE).');
  }

  if (process.env.CITUS_ENABLED === 'true' && !process.env.CITUS_WORKERS) {
    warnings.push('⚠️  CITUS_ENABLED is true but CITUS_WORKERS is empty - coordinator will run without workers.');
  }

  if (process.env.PGVECTOR_ENABLED !== 'false') {
    const dimension = parseInt(process.env.PGVECTOR_DIMENSION || '0', 10);
    if (Number.isNaN(dimension) || dimension <= 0) {
      errors.push('❌ PGVECTOR_DIMENSION must be a positive integer when PGVector is enabled');
    }
  }
  
  // Check optional variables and set defaults
  for (const [key, config] of Object.entries(OPTIONAL_ENV_VARS)) {
    if (!process.env[key] || process.env[key].trim() === '') {
      if (config.default) {
        process.env[key] = config.default;
        warnings.push(`⚠️  Using default for ${key}: ${config.default}`);
      }
    } else {
      console.log(`✅ ${key}: configured`);
    }
  }
  
  // Security checks
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      errors.push('❌ JWT_SECRET must be at least 32 characters in production');
    }
    
    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
      errors.push('❌ ENCRYPTION_KEY must be at least 32 characters in production');
    }
    
    if (!process.env.CORS_ORIGIN) {
      warnings.push('⚠️  CORS_ORIGIN not set - will use permissive defaults');
    }
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => console.log(w));
  }
  
  // Exit if there are errors
  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:\n');
    errors.forEach(e => console.error(e));
    console.error('\nPlease set all required environment variables and restart.\n');
    process.exit(1);
  }
  
  console.log('\n✅ Environment validation passed\n');
}

export default validateEnvironment;
