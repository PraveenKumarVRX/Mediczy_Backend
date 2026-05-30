#!/usr/bin/env node

/**
 * Add New Tenant with Custom Instance
 * 
 * Usage:
 *   node add-new-tenant.cjs
 * 
 * This script creates a new tenant with:
 * - Custom database strategy (SHARED/SCHEMA/DEDICATED)
 * - Dedicated entity (headquarters)
 * - Admin credentials
 * - Automatic provisioning
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).toLowerCase() === 'true';
}

const useSSL = envFlag('POSTGRES_SSL') || String(process.env.PGSSLMODE || '').toLowerCase() === 'require';
const pgSsl = useSSL ? { rejectUnauthorized: false } : false;

// PostgreSQL Configuration
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: pgSsl })
  : new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
      user: process.env.POSTGRES_USER || 'mediczy_helper',
      password: process.env.POSTGRES_PASSWORD || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined),
      ssl: pgSsl,
    });

// ============================================================================
// CONFIGURATION - Edit these values
// ============================================================================

const TENANT_CONFIG = {
  // Basic Info
  tenantName: 'Apollo Hospitals',
  tenantType: 'HOSPITAL', // HOSPITAL, CLINIC, LAB, PHARMACY, CORPORATE, etc.
  
  // Database Strategy
  dbStrategy: 'SCHEMA', // SHARED, SCHEMA, or DEDICATED
  
  // Contact Info
  contactEmail: 'admin@apollo.com',
  contactPhone: '+91-9876543210',
  
  // Subscription
  subscriptionPlan: 'ENTERPRISE', // STARTER, PROFESSIONAL, ENTERPRISE
  
  // Location
  address: {
    street: '123 MG Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    country: 'India'
  },
  timezone: 'Asia/Kolkata',
  
  // Admin User
  adminEmail: 'admin@apollo.com',
  adminFirstName: 'Admin',
  adminLastName: 'User',
  adminPassword: 'Apollo@123' // Will be hashed
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateTenantCode(tenantType) {
  const prefix = {
    CLINIC: 'CLN',
    HOSPITAL: 'HSP',
    CORPORATE: 'CRP',
    LAB: 'LAB',
    PHARMACY: 'PHR',
    AMBULANCE: 'AMB'
  }[tenantType] || 'TEN';
  
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${timestamp}`;
}

function generateSubdomain(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

function getDefaultLimits(plan) {
  const limits = {
    STARTER: {
      maxUsers: 50,
      maxDoctors: 10,
      maxEntities: 1,
      maxStorageGB: 10,
      maxAppointmentsPerMonth: 500
    },
    PROFESSIONAL: {
      maxUsers: 200,
      maxDoctors: 50,
      maxEntities: 5,
      maxStorageGB: 50,
      maxAppointmentsPerMonth: 2000
    },
    ENTERPRISE: {
      maxUsers: -1, // unlimited
      maxDoctors: -1,
      maxEntities: -1,
      maxStorageGB: -1,
      maxAppointmentsPerMonth: -1
    }
  };
  
  return limits[plan] || limits.STARTER;
}

// ============================================================================
// Main Functions
// ============================================================================

async function createTenant() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('\n🚀 Creating New Tenant...\n');
    
    // 1. Generate tenant identifiers
    const tenantCode = generateTenantCode(TENANT_CONFIG.tenantType);
    const subdomain = generateSubdomain(TENANT_CONFIG.tenantName);
    const primaryDomain = `${subdomain}.mediqzy.com`;
    
    console.log(`📋 Tenant Code: ${tenantCode}`);
    console.log(`🌐 Subdomain: ${primaryDomain}`);
    
    // 2. Calculate trial period
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    
    // 3. Get plan limits
    const limits = getDefaultLimits(TENANT_CONFIG.subscriptionPlan);
    
    // 4. Create tenant
    const tenantResult = await client.query(`
      INSERT INTO platform_tenants (
        tenant_code,
        tenant_name,
        tenant_type,
        db_strategy,
        primary_domain,
        contact_email,
        contact_phone,
        address,
        country_code,
        timezone,
        subscription_plan,
        subscription_status,
        trial_ends_at,
        limits,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING tenant_id, tenant_code, primary_domain;
    `, [
      tenantCode,
      TENANT_CONFIG.tenantName,
      TENANT_CONFIG.tenantType,
      TENANT_CONFIG.dbStrategy,
      primaryDomain,
      TENANT_CONFIG.contactEmail,
      TENANT_CONFIG.contactPhone,
      JSON.stringify(TENANT_CONFIG.address),
      'IND',
      TENANT_CONFIG.timezone,
      TENANT_CONFIG.subscriptionPlan,
      'TRIAL',
      trialEndsAt,
      JSON.stringify(limits),
      'PENDING',
      1 // System user
    ]);
    
    const tenant = tenantResult.rows[0];
    console.log(`\n✅ Tenant Created: ID ${tenant.tenant_id}`);
    
    // 5. Provision based on database strategy
    let dbInfo = null;
    
    if (TENANT_CONFIG.dbStrategy === 'SCHEMA') {
      const schemaName = `tenant_${tenantCode.toLowerCase()}`;
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      
      await client.query(`
        UPDATE platform_tenants 
        SET db_name = $1, updated_at = NOW()
        WHERE tenant_id = $2
      `, [schemaName, tenant.tenant_id]);
      
      dbInfo = { schemaName };
      console.log(`📊 Schema Created: ${schemaName}`);
    } else if (TENANT_CONFIG.dbStrategy === 'DEDICATED') {
      const dbName = `mediqzy_${tenantCode.toLowerCase()}`;
      // Note: Database creation requires superuser privileges
      console.log(`⚠️  Dedicated database strategy selected: ${dbName}`);
      console.log(`   Manual step required: CREATE DATABASE ${dbName};`);
      dbInfo = { dbName };
    } else {
      console.log(`📊 Using SHARED database strategy`);
    }
    
    // 6. Create default entity (headquarters)
    const entityResult = await client.query(`
      INSERT INTO platform_entities (
        tenant_id, entity_code, entity_name, entity_type, 
        email, phone, address, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
      RETURNING entity_id, entity_code;
    `, [
      tenant.tenant_id,
      'HQ',
      `${TENANT_CONFIG.tenantName} - Headquarters`,
      TENANT_CONFIG.tenantType,
      TENANT_CONFIG.contactEmail,
      TENANT_CONFIG.contactPhone,
      JSON.stringify(TENANT_CONFIG.address)
    ]);
    
    const entity = entityResult.rows[0];
    console.log(`🏢 Default Entity Created: ${entity.entity_code}`);
    
    // 7. Create admin user
    const hashedPassword = await bcrypt.hash(TENANT_CONFIG.adminPassword, 10);
    
    const userResult = await client.query(`
      INSERT INTO users (
        "firstName", "lastName", email, password, "phoneNumber",
        "dateOfBirth", gender, role,
        tenant_id, organization_id, organization_type,
        "isVerified", metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, email;
    `, [
      TENANT_CONFIG.adminFirstName,
      TENANT_CONFIG.adminLastName,
      TENANT_CONFIG.adminEmail,
      hashedPassword,
      TENANT_CONFIG.contactPhone,
      new Date('1990-01-01'), // Placeholder
      'Other',
      'admin',
      tenant.tenant_id,
      tenant.tenant_id,
      TENANT_CONFIG.tenantType,
      true,
      JSON.stringify({
        is_tenant_owner: true,
        entity_id: entity.entity_id,
        requirePasswordChange: true
      })
    ]);
    
    const adminUser = userResult.rows[0];
    console.log(`👤 Admin User Created: ${adminUser.email}`);
    
    // 8. Activate tenant
    await client.query(`
      UPDATE platform_tenants 
      SET status = 'ACTIVE', provisioned_at = NOW(), activated_at = NOW()
      WHERE tenant_id = $1
    `, [tenant.tenant_id]);
    
    await client.query('COMMIT');
    
    // ========================================================================
    // SUCCESS SUMMARY
    // ========================================================================
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 TENANT PROVISIONING COMPLETE');
    console.log('='.repeat(70));
    console.log('\n📊 Tenant Details:');
    console.log(`   ID:           ${tenant.tenant_id}`);
    console.log(`   Code:         ${tenant.tenant_code}`);
    console.log(`   Name:         ${TENANT_CONFIG.tenantName}`);
    console.log(`   Type:         ${TENANT_CONFIG.tenantType}`);
    console.log(`   Plan:         ${TENANT_CONFIG.subscriptionPlan}`);
    console.log(`   DB Strategy:  ${TENANT_CONFIG.dbStrategy}`);
    
    console.log('\n🌐 Access Information:');
    console.log(`   Domain:       https://${tenant.primary_domain}`);
    console.log(`   Email:        ${adminUser.email}`);
    console.log(`   Password:     ${TENANT_CONFIG.adminPassword}`);
    
    console.log('\n🏢 Default Entity:');
    console.log(`   ID:           ${entity.entity_id}`);
    console.log(`   Code:         ${entity.entity_code}`);
    
    if (dbInfo) {
      console.log('\n📊 Database:');
      if (dbInfo.schemaName) {
        console.log(`   Schema:       ${dbInfo.schemaName}`);
      } else if (dbInfo.dbName) {
        console.log(`   Database:     ${dbInfo.dbName} (requires manual creation)`);
      }
    }
    
    console.log('\n⚠️  Next Steps:');
    console.log('   1. Test login at domain above');
    console.log('   2. Change admin password on first login');
    console.log('   3. Configure additional entities if needed');
    console.log('   4. Set up custom domain (optional)');
    console.log('\n' + '='.repeat(70) + '\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error creating tenant:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// Execute
// ============================================================================

createTenant()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
