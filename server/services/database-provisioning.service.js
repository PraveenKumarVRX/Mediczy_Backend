import { mobileDeploymentEnvironment } from './tenant-mobile-runtime.js';
import { postgresTls } from '../db/postgres-tls.js';
/**
 * Database Provisioning Service
 * Handles automatic database creation for Professional and Enterprise tenants
 * 
 * Tier-based provisioning:
 * - Free: Shared database with tenant_id filtering
 * - Professional: Dedicated database, shared infrastructure
 * - Enterprise: Dedicated database + dedicated server option
 */

import pkg from 'pg';
import { Sequelize } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const { Client } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connection pools for tenant databases
const tenantConnections = new Map();

// Base port for dedicated tenant servers (8010, 8011, 8012, ...)
const TENANT_SERVER_BASE_PORT = 8010;

/**
 * Admin client configuration for database operations
 */
const getAdminClient = () => {
  return new Client({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: 'postgres', // Connect to default postgres DB for admin operations
    user: process.env.POSTGRES_USER || 'mediczy_ai',
    password: process.env.POSTGRES_PASSWORD || 'change_me',
    ssl: postgresTls()
  });
};

/**
 * Plan tier definitions
 */
export const PLAN_TIERS = {
  free: {
    name: 'Free',
    database_isolation: false, // Shared database with tenant_id
    dedicated_server: false,
    subdomain: true,
    custom_domain: false,
    features: {
      appointments: true,
      telemedicine: false,
      prescriptions: true,
      lab_tests: false,
      pharmacy: false,
      insurance: false,
      ai_assistant: false,
      analytics: false,
      custom_branding: false,
      api_access: false,
      webhooks: false,
      sla: false,
      dedicated_support: false
    },
    limits: {
      users: 10,
      doctors: 3,
      appointments_per_month: 50,
      storage_gb: 2,
      api_calls_per_day: 0
    },
    price: {
      monthly: 0,
      quarterly: 0,
      annual: 0
    }
  },
  
  professional: {
    name: 'Professional',
    database_isolation: true, // Dedicated database
    dedicated_server: false,  // Shared server infrastructure
    subdomain: true,
    custom_domain: true,
    features: {
      appointments: true,
      telemedicine: true,
      prescriptions: true,
      lab_tests: true,
      pharmacy: true,
      insurance: true,
      ai_assistant: true,
      analytics: true,
      custom_branding: true,
      api_access: true,
      webhooks: true,
      sla: false,
      dedicated_support: false
    },
    limits: {
      users: 200,
      doctors: 50,
      appointments_per_month: 2000,
      storage_gb: 100,
      api_calls_per_day: 10000
    },
    price: {
      monthly: 9999,  // ₹9,999/month
      quarterly: 26997, // ₹8,999/month
      annual: 95988    // ₹7,999/month
    }
  },
  
  enterprise: {
    name: 'Enterprise',
    database_isolation: true,  // Dedicated database
    dedicated_server: true,    // Dedicated server instance
    subdomain: true,
    custom_domain: true,
    features: {
      appointments: true,
      telemedicine: true,
      prescriptions: true,
      lab_tests: true,
      pharmacy: true,
      insurance: true,
      ai_assistant: true,
      analytics: true,
      custom_branding: true,
      api_access: true,
      webhooks: true,
      sla: true,
      dedicated_support: true,
      white_label: true,
      multi_location: true,
      advanced_reporting: true,
      hipaa_compliance: true,
      audit_logs: true
    },
    limits: {
      users: -1,  // Unlimited
      doctors: -1,
      appointments_per_month: -1,
      storage_gb: -1,
      api_calls_per_day: -1
    },
    price: {
      monthly: 49999,   // ₹49,999/month
      quarterly: 134997, // ₹44,999/month
      annual: 479988    // ₹39,999/month
    }
  }
};

/**
 * Create a dedicated database for tenant
 * Used for Professional and Enterprise tiers
 */
export async function createTenantDatabase(tenant) {
  const dbName = `mediczy_tenant_${tenant.id}`;
  const adminClient = getAdminClient();
  
  try {
    await adminClient.connect();
    
    // Check if database already exists
    const checkResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    
    if (checkResult.rows.length > 0) {
      console.log(`Database ${dbName} already exists`);
      return { success: true, database_name: dbName, already_exists: true };
    }
    
    // Create the database
    await adminClient.query(`CREATE DATABASE ${dbName} WITH OWNER ${process.env.POSTGRES_USER || 'mediczy_ai'}`);
    console.log(`✅ Created database: ${dbName}`);
    
    // Run migrations on the new database
    await runMigrations(dbName);
    
    // Seed initial data
    await seedTenantDatabase(dbName, tenant);
    
    return {
      success: true,
      database_name: dbName,
      already_exists: false,
      connection_string: buildConnectionString(dbName)
    };
    
  } catch (error) {
    console.error(`❌ Failed to create database ${dbName}:`, error);
    throw error;
  } finally {
    await adminClient.end();
  }
}

/**
 * Build connection string for tenant database
 */
function buildConnectionString(dbName) {
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER || 'mediczy_ai';
  const password = process.env.POSTGRES_PASSWORD || 'change_me';
  
  return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
}

/**
 * Run migrations on tenant database
 */
async function runMigrations(dbName) {
  const sequelize = new Sequelize({
    database: dbName,
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'mediczy_ai',
    password: process.env.POSTGRES_PASSWORD || 'change_me',
    dialect: 'postgres',
    dialectOptions: { ssl: postgresTls() },
    logging: false
  });
  
  try {
    await sequelize.authenticate();
    
    // Create base tenant schema
    await sequelize.query(`
      -- Users table (local to tenant)
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20),
        password VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'patient',
        is_verified BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Doctors table
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        specialization VARCHAR(100),
        qualifications JSONB DEFAULT '[]',
        experience_years INTEGER DEFAULT 0,
        consultation_fee DECIMAL(10,2),
        availability JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Patients table
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(20),
        date_of_birth DATE,
        gender VARCHAR(20),
        blood_type VARCHAR(5),
        address JSONB DEFAULT '{}',
        emergency_contact JSONB DEFAULT '{}',
        medical_history JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Appointments table
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        doctor_id INTEGER REFERENCES doctors(id),
        patient_id INTEGER REFERENCES patients(id),
        scheduled_date DATE NOT NULL,
        scheduled_time TIME NOT NULL,
        duration_minutes INTEGER DEFAULT 30,
        type VARCHAR(50) DEFAULT 'consultation',
        status VARCHAR(50) DEFAULT 'scheduled',
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Lab Tests table
      CREATE TABLE IF NOT EXISTS lab_tests (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        patient_id INTEGER REFERENCES patients(id),
        doctor_id INTEGER REFERENCES doctors(id),
        test_name VARCHAR(255) NOT NULL,
        test_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        results JSONB DEFAULT '{}',
        ordered_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Prescriptions table
      CREATE TABLE IF NOT EXISTS prescriptions (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        doctor_id INTEGER REFERENCES doctors(id),
        patient_id INTEGER REFERENCES patients(id),
        appointment_id INTEGER REFERENCES appointments(id),
        diagnosis TEXT,
        medications JSONB DEFAULT '[]',
        instructions TEXT,
        valid_until DATE,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Pharmacy Inventory table (if pharmacy feature enabled)
      CREATE TABLE IF NOT EXISTS pharmacy_inventory (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        drug_name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        category VARCHAR(100),
        manufacturer VARCHAR(255),
        batch_number VARCHAR(100),
        quantity INTEGER DEFAULT 0,
        unit_price DECIMAL(10,2),
        expiry_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Billing table
      CREATE TABLE IF NOT EXISTS billing (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        patient_id INTEGER REFERENCES patients(id),
        appointment_id INTEGER REFERENCES appointments(id),
        items JSONB DEFAULT '[]',
        subtotal DECIMAL(10,2),
        tax DECIMAL(10,2),
        discount DECIMAL(10,2),
        total DECIMAL(10,2),
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_method VARCHAR(50),
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Departments table
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        description TEXT,
        head_doctor_id INTEGER REFERENCES doctors(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Staff table
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        uid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        department_id INTEGER REFERENCES departments(id),
        employee_id VARCHAR(50),
        designation VARCHAR(100),
        role VARCHAR(50),
        shift JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Activity Logs table
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id INTEGER,
        details JSONB DEFAULT '{}',
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_doctors_specialization ON doctors(specialization);
      CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
    `);
    
    console.log(`✅ Migrations completed for database: ${dbName}`);
    
  } catch (error) {
    console.error(`❌ Migration failed for ${dbName}:`, error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

/**
 * Seed initial data for tenant database
 */
async function seedTenantDatabase(dbName, tenant) {
  const sequelize = new Sequelize({
    database: dbName,
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'mediczy_ai',
    password: process.env.POSTGRES_PASSWORD || 'change_me',
    dialect: 'postgres',
    dialectOptions: { ssl: postgresTls() },
    logging: false
  });
  
  try {
    await sequelize.authenticate();
    
    // Create default admin user
    await sequelize.query(`
      INSERT INTO users (email, first_name, last_name, role, is_verified, is_active, metadata)
      VALUES ($1, $2, $3, 'admin', true, true, $4)
      ON CONFLICT (email) DO NOTHING
    `, {
      bind: [
        tenant.email,
        tenant.name.split(' ')[0],
        'Admin',
        JSON.stringify({ tenant_owner: true, created_at: new Date() })
      ]
    });
    
    // Create default departments based on organization type
    const defaultDepartments = getDefaultDepartments(tenant.type);
    for (const dept of defaultDepartments) {
      await sequelize.query(`
        INSERT INTO departments (name, code, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT DO NOTHING
      `, {
        bind: [dept.name, dept.code, dept.description]
      });
    }
    
    console.log(`✅ Seeded database: ${dbName} for tenant: ${tenant.name}`);
    
  } catch (error) {
    console.error(`❌ Seeding failed for ${dbName}:`, error);
    // Don't throw - seeding errors shouldn't fail provisioning
  } finally {
    await sequelize.close();
  }
}

/**
 * Get default departments by organization type
 */
function getDefaultDepartments(orgType) {
  const departments = {
    hospital: [
      { name: 'Emergency', code: 'ER', description: 'Emergency Department' },
      { name: 'Outpatient', code: 'OPD', description: 'Outpatient Department' },
      { name: 'Inpatient', code: 'IPD', description: 'Inpatient Department' },
      { name: 'Laboratory', code: 'LAB', description: 'Pathology Laboratory' },
      { name: 'Radiology', code: 'RAD', description: 'Radiology & Imaging' },
      { name: 'Pharmacy', code: 'PHR', description: 'Pharmacy' },
      { name: 'Administration', code: 'ADM', description: 'Hospital Administration' }
    ],
    clinic: [
      { name: 'Reception', code: 'REC', description: 'Front Desk' },
      { name: 'Consultation', code: 'CON', description: 'Consultation Rooms' },
      { name: 'Dispensary', code: 'DIS', description: 'Medicine Dispensary' }
    ],
    lab: [
      { name: 'Sample Collection', code: 'SAM', description: 'Sample Collection' },
      { name: 'Pathology', code: 'PATH', description: 'Pathology Testing' },
      { name: 'Microbiology', code: 'MICRO', description: 'Microbiology' },
      { name: 'Biochemistry', code: 'BIO', description: 'Biochemistry' }
    ],
    pharmacy: [
      { name: 'Retail', code: 'RET', description: 'Retail Counter' },
      { name: 'Inventory', code: 'INV', description: 'Stock Management' },
      { name: 'Prescription', code: 'RX', description: 'Prescription Handling' }
    ],
    corporate: [
      { name: 'HR', code: 'HR', description: 'Human Resources' },
      { name: 'Wellness', code: 'WEL', description: 'Employee Wellness' },
      { name: 'Claims', code: 'CLM', description: 'Insurance Claims' }
    ],
    default: [
      { name: 'General', code: 'GEN', description: 'General Department' },
      { name: 'Administration', code: 'ADM', description: 'Administration' }
    ]
  };
  
  return departments[orgType] || departments.default;
}

/**
 * Get or create connection for tenant database
 */
export function getTenantConnection(tenant) {
  const tier = PLAN_TIERS[tenant.plan];
  
  // Free tier uses shared database
  if (!tier.database_isolation) {
    return {
      type: 'shared',
      tenant_id: tenant.id,
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai'
    };
  }
  
  // Pro/Enterprise use dedicated database
  const dbName = tenant.database_name || `mediczy_tenant_${tenant.id}`;
  
  if (!tenantConnections.has(dbName)) {
    const sequelize = new Sequelize({
      database: dbName,
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.POSTGRES_USER || 'mediczy_ai',
      password: process.env.POSTGRES_PASSWORD || 'change_me',
      dialect: 'postgres',
    dialectOptions: { ssl: postgresTls() },
      logging: false,
      pool: {
        max: tier.dedicated_server ? 20 : 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
    
    tenantConnections.set(dbName, sequelize);
  }
  
  return {
    type: 'dedicated',
    tenant_id: tenant.id,
    database: dbName,
    sequelize: tenantConnections.get(dbName)
  };
}

/**
 * Drop tenant database (for cleanup/deletion)
 */
export async function dropTenantDatabase(tenantId) {
  const dbName = `mediczy_tenant_${tenantId}`;
  const adminClient = getAdminClient();
  
  try {
    await adminClient.connect();
    
    // Close any existing connections
    if (tenantConnections.has(dbName)) {
      await tenantConnections.get(dbName).close();
      tenantConnections.delete(dbName);
    }
    
    // Terminate active connections to the database
    await adminClient.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);
    
    // Drop the database
    await adminClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`✅ Dropped database: ${dbName}`);
    
    return { success: true, database_name: dbName };
    
  } catch (error) {
    console.error(`❌ Failed to drop database ${dbName}:`, error);
    throw error;
  } finally {
    await adminClient.end();
  }
}

/**
 * Get database stats for tenant
 */
export async function getTenantDatabaseStats(tenantId) {
  const dbName = `mediczy_tenant_${tenantId}`;
  const adminClient = getAdminClient();
  
  try {
    await adminClient.connect();
    
    // Check if database exists
    const checkResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    
    if (checkResult.rows.length === 0) {
      return { exists: false };
    }
    
    // Get database size
    const sizeResult = await adminClient.query(
      `SELECT pg_size_pretty(pg_database_size($1)) as size`,
      [dbName]
    );
    
    // Get active connections
    const connResult = await adminClient.query(
      `SELECT count(*) as connections FROM pg_stat_activity WHERE datname = $1`,
      [dbName]
    );
    
    return {
      exists: true,
      database_name: dbName,
      size: sizeResult.rows[0]?.size || 'Unknown',
      active_connections: parseInt(connResult.rows[0]?.connections || '0', 10)
    };
    
  } catch (error) {
    console.error(`Failed to get stats for ${dbName}:`, error);
    return { exists: false, error: error.message };
  } finally {
    await adminClient.end();
  }
}

/**
 * Provision infrastructure for tenant based on tier
 */
export async function provisionTenantInfrastructure(tenant) {
  const tier = PLAN_TIERS[tenant.plan];
  
  const result = {
    tenant_id: tenant.id,
    plan: tenant.plan,
    tier_name: tier.name,
    database_isolation: tier.database_isolation,
    dedicated_server: tier.dedicated_server
  };
  
  // Database provisioning for Pro/Enterprise
  if (tier.database_isolation) {
    const dbResult = await createTenantDatabase(tenant);
    result.database = dbResult;
  } else {
    result.database = {
      type: 'shared',
      database_name: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      isolation_method: 'tenant_id column'
    };
  }
  
  // Subdomain setup
  if (tier.subdomain && tenant.subdomain) {
    result.subdomain = {
      configured: true,
      url: `https://${tenant.subdomain}.mediqzy.com`
    };
  }
  
  // Custom domain setup for Pro/Enterprise
  if (tier.custom_domain && tenant.custom_domain) {
    result.custom_domain = {
      configured: true,
      url: `https://${tenant.custom_domain}`,
      ssl_status: 'pending' // Would be 'active' after SSL provisioning
    };
  }
  
  // Dedicated server placeholder for Enterprise
  if (tier.dedicated_server) {
    result.server = {
      type: 'dedicated',
      status: 'pending',
      port: TENANT_SERVER_BASE_PORT + tenant.id,
      estimated_ready: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes
    };
    // Server will be started separately via startTenantServer()
  }
  
  return result;
}

// ============================================================================
// PM2 DEDICATED SERVER MANAGEMENT
// ============================================================================

/**
 * Get allocated port for tenant's dedicated server
 */
export function getTenantServerPort(tenantId) {
  return TENANT_SERVER_BASE_PORT + parseInt(tenantId, 10);
}

/**
 * Get PM2 process name for tenant
 */
export function getTenantProcessName(tenant) {
  return `tenant-${tenant.slug || tenant.id}`;
}

/**
 * Check if tenant server is running
 */
export async function getTenantServerStatus(tenant) {
  const processName = getTenantProcessName(tenant);
  
  try {
    const { stdout } = await execAsync(`pm2 jlist`);
    const processes = JSON.parse(stdout);
    const tenantProcess = processes.find(p => p.name === processName);
    
    if (!tenantProcess) {
      return {
        running: false,
        status: 'stopped',
        process_name: processName,
        port: getTenantServerPort(tenant.id)
      };
    }
    
    return {
      running: tenantProcess.pm2_env.status === 'online',
      status: tenantProcess.pm2_env.status,
      process_name: processName,
      pm_id: tenantProcess.pm_id,
      port: getTenantServerPort(tenant.id),
      uptime: tenantProcess.pm2_env.pm_uptime ? Date.now() - tenantProcess.pm2_env.pm_uptime : 0,
      memory: tenantProcess.monit?.memory || 0,
      cpu: tenantProcess.monit?.cpu || 0,
      restarts: tenantProcess.pm2_env.restart_time || 0,
      created_at: tenantProcess.pm2_env.created_at
    };
  } catch (error) {
    console.error(`Failed to get server status for ${processName}:`, error);
    return {
      running: false,
      status: 'unknown',
      error: error.message,
      process_name: processName,
      port: getTenantServerPort(tenant.id)
    };
  }
}

/**
 * Start dedicated PM2 server for Enterprise tenant
 * @param {Object} tenant - Tenant object
 * @param {boolean} useDedicatedDb - Whether to use dedicated database or shared with tenant isolation
 */
export async function startTenantServer(tenant, useDedicatedDb = true) {
  const processName = getTenantProcessName(tenant);
  const port = getTenantServerPort(tenant.id);
  const dbName = useDedicatedDb ? `mediczy_tenant_${tenant.id}` : process.env.POSTGRES_DATABASE || 'mediczy_ai';
  
  // Check if already running
  const currentStatus = await getTenantServerStatus(tenant);
  if (currentStatus.running) {
    return {
      success: true,
      message: 'Server already running',
      ...currentStatus
    };
  }
  
  // Build environment variables for dedicated instance
  const envVars = {
    PORT: port,
    TENANT_MODE: 'dedicated',
    TENANT_ID: tenant.id,
    TENANT_SLUG: tenant.slug,
    TENANT_NAME: tenant.name,
    ...mobileDeploymentEnvironment(tenant),
    DATABASE_URL: useDedicatedDb ? buildConnectionString(dbName) : process.env.POSTGRES_URI || `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
    POSTGRES_DATABASE: dbName,
    NODE_ENV: process.env.NODE_ENV || 'production',
    JWT_SECRET: process.env.JWT_SECRET,
    // Copy other essential env vars
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: process.env.REDIS_PORT || '6379',
    SIB_API_URL: process.env.SIB_API_URL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    // Copy Postgres env vars for shared DB mode
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD
  };
  
  const serverPath = path.resolve(__dirname, '..', 'index.js');
  
  try {
    // Create PM2 ecosystem config for this tenant
    const ecosystemConfig = {
      name: processName,
      script: serverPath,
      cwd: path.resolve(__dirname, '..'),
      env: envVars,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: `/home/ubuntu/Mediczy/logs/${processName}-error.log`,
      out_file: `/home/ubuntu/Mediczy/logs/${processName}-out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    };
    
    // Write temp ecosystem file
    const ecosystemPath = `/tmp/${processName}-ecosystem.json`;
    fs.writeFileSync(ecosystemPath, JSON.stringify({ apps: [ecosystemConfig] }, null, 2));
    
    // Start with PM2
    const { stdout, stderr } = await execAsync(`pm2 start ${ecosystemPath}`);
    console.log(`✅ Started dedicated server for ${tenant.name} on port ${port}`);
    
    // Clean up temp file
    fs.unlinkSync(ecosystemPath);
    
    // Save PM2 process list
    await execAsync('pm2 save');
    
    // Get updated status
    const newStatus = await getTenantServerStatus(tenant);
    
    return {
      success: true,
      message: `Server started successfully on port ${port}`,
      ...newStatus,
      access_url: `https://${tenant.slug}.mediqzy.com`
    };
    
  } catch (error) {
    console.error(`❌ Failed to start server for ${tenant.name}:`, error);
    return {
      success: false,
      error: error.message,
      process_name: processName,
      port
    };
  }
}

/**
 * Stop dedicated PM2 server for tenant
 */
export async function stopTenantServer(tenant) {
  const processName = getTenantProcessName(tenant);
  
  try {
    // Check if running
    const currentStatus = await getTenantServerStatus(tenant);
    if (!currentStatus.running && currentStatus.status === 'stopped') {
      return {
        success: true,
        message: 'Server already stopped',
        ...currentStatus
      };
    }
    
    // Stop the process
    await execAsync(`pm2 stop ${processName}`);
    console.log(`✅ Stopped dedicated server for ${tenant.name}`);
    
    // Save PM2 process list
    await execAsync('pm2 save');
    
    return {
      success: true,
      message: 'Server stopped successfully',
      running: false,
      status: 'stopped',
      process_name: processName
    };
    
  } catch (error) {
    // Process might not exist
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      return {
        success: true,
        message: 'Server was not running',
        running: false,
        status: 'stopped',
        process_name: processName
      };
    }
    
    console.error(`❌ Failed to stop server for ${tenant.name}:`, error);
    return {
      success: false,
      error: error.message,
      process_name: processName
    };
  }
}

/**
 * Restart dedicated PM2 server for tenant
 */
export async function restartTenantServer(tenant) {
  const processName = getTenantProcessName(tenant);
  
  try {
    // Check current status
    const currentStatus = await getTenantServerStatus(tenant);
    
    if (!currentStatus.running && currentStatus.status !== 'online') {
      // Not running, start it instead
      return await startTenantServer(tenant);
    }
    
    // Restart the process (0 downtime reload)
    await execAsync(`pm2 reload ${processName}`);
    console.log(`✅ Restarted dedicated server for ${tenant.name}`);
    
    // Save PM2 process list
    await execAsync('pm2 save');
    
    // Get updated status
    const newStatus = await getTenantServerStatus(tenant);
    
    return {
      success: true,
      message: 'Server restarted successfully',
      ...newStatus
    };
    
  } catch (error) {
    console.error(`❌ Failed to restart server for ${tenant.name}:`, error);
    return {
      success: false,
      error: error.message,
      process_name: processName
    };
  }
}

/**
 * Delete dedicated PM2 server for tenant (cleanup)
 */
export async function deleteTenantServer(tenant) {
  const processName = getTenantProcessName(tenant);
  
  try {
    // Stop and delete the process
    await execAsync(`pm2 delete ${processName}`);
    console.log(`✅ Deleted dedicated server for ${tenant.name}`);
    
    // Save PM2 process list
    await execAsync('pm2 save');
    
    // Clean up log files
    const errorLog = `/home/ubuntu/Mediczy/logs/${processName}-error.log`;
    const outLog = `/home/ubuntu/Mediczy/logs/${processName}-out.log`;
    
    if (fs.existsSync(errorLog)) fs.unlinkSync(errorLog);
    if (fs.existsSync(outLog)) fs.unlinkSync(outLog);
    
    return {
      success: true,
      message: 'Server deleted successfully',
      process_name: processName
    };
    
  } catch (error) {
    // Process might not exist
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      return {
        success: true,
        message: 'Server was not provisioned',
        process_name: processName
      };
    }
    
    console.error(`❌ Failed to delete server for ${tenant.name}:`, error);
    return {
      success: false,
      error: error.message,
      process_name: processName
    };
  }
}

/**
 * Get logs for tenant's dedicated server
 */
export async function getTenantServerLogs(tenant, lines = 100) {
  const processName = getTenantProcessName(tenant);
  
  try {
    const { stdout } = await execAsync(`pm2 logs ${processName} --nostream --lines ${lines} 2>&1`);
    
    return {
      success: true,
      process_name: processName,
      logs: stdout,
      lines_requested: lines
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      process_name: processName
    };
  }
}

/**
 * List all tenant servers (Enterprise)
 */
export async function listAllTenantServers() {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    
    // Filter for tenant processes
    const tenantProcesses = processes.filter(p => p.name.startsWith('tenant-'));
    
    return {
      success: true,
      total: tenantProcesses.length,
      servers: tenantProcesses.map(p => ({
        name: p.name,
        pm_id: p.pm_id,
        status: p.pm2_env.status,
        port: p.pm2_env.PORT || 'unknown',
        tenant_id: p.pm2_env.TENANT_ID,
        tenant_slug: p.pm2_env.TENANT_SLUG,
        memory: p.monit?.memory || 0,
        cpu: p.monit?.cpu || 0,
        uptime: p.pm2_env.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
        restarts: p.pm2_env.restart_time || 0
      }))
    };
    
  } catch (error) {
    console.error('Failed to list tenant servers:', error);
    return {
      success: false,
      error: error.message,
      servers: []
    };
  }
}

export default {
  PLAN_TIERS,
  createTenantDatabase,
  dropTenantDatabase,
  getTenantConnection,
  getTenantDatabaseStats,
  provisionTenantInfrastructure,
  // PM2 Server Management
  getTenantServerPort,
  getTenantProcessName,
  getTenantServerStatus,
  startTenantServer,
  stopTenantServer,
  restartTenantServer,
  deleteTenantServer,
  getTenantServerLogs,
  listAllTenantServers
};
