#!/usr/bin/env node

/**
 * Migrate Membership Plans to Support Hierarchy
 * 
 * Adds support for:
 * - Master plans (created by super admin)
 * - Organization-specific customized plans
 * - Plan inheritance and customization tracking
 * 
 * Usage: node scripts/migrate-membership-plans-hierarchy.cjs
 */

const { Pool } = require('pg');
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

async function migrateSchema() {
  const client = await pool.connect();
  
  try {
    console.log('\n🔄 Starting Membership Plans Hierarchy Migration...\n');
    
    await client.query('BEGIN');
    
    // 1. Add new columns to membership_plans table
    console.log('1️⃣  Adding hierarchy columns...');
    
    const alterQueries = [
      // Master plan indicator
      `ALTER TABLE membership_plans 
       ADD COLUMN IF NOT EXISTS "isMaster" BOOLEAN DEFAULT FALSE`,
      
      // Master plan reference
      `ALTER TABLE membership_plans 
       ADD COLUMN IF NOT EXISTS "masterPlanId" INTEGER REFERENCES membership_plans(id) ON DELETE SET NULL`,
      
      // Organization context
      `ALTER TABLE membership_plans 
       ADD COLUMN IF NOT EXISTS "organizationId" INTEGER`,
      
      `ALTER TABLE membership_plans 
       ADD COLUMN IF NOT EXISTS "organizationType" VARCHAR(50)`,
      
      // Customization tracking
      `ALTER TABLE membership_plans 
       ADD COLUMN IF NOT EXISTS "customizedBy" INTEGER`,
      
      `ALTER TABLE membership_plans 
       ADD COLUMN IF NOT EXISTS "customizationNotes" TEXT`,
    ];
    
    for (const query of alterQueries) {
      await client.query(query);
    }
    
    console.log('   ✅ Columns added successfully\n');
    
    // 2. Add indexes for performance
    console.log('2️⃣  Creating indexes...');
    
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_membership_plans_is_master 
       ON membership_plans("isMaster")`,
      
      `CREATE INDEX IF NOT EXISTS idx_membership_plans_master_plan_id 
       ON membership_plans("masterPlanId")`,
      
      `CREATE INDEX IF NOT EXISTS idx_membership_plans_organization 
       ON membership_plans("organizationId", "organizationType")`,
      
      `CREATE INDEX IF NOT EXISTS idx_membership_plans_customized_by 
       ON membership_plans("customizedBy")`,
    ];
    
    for (const query of indexQueries) {
      await client.query(query);
    }
    
    console.log('   ✅ Indexes created successfully\n');
    
    // 3. Mark existing plans as master plans
    console.log('3️⃣  Migrating existing plans...');
    
    const result = await client.query(`
      UPDATE membership_plans 
      SET "isMaster" = TRUE,
          "organizationId" = NULL,
          "organizationType" = NULL
      WHERE "organizationId" IS NULL
      RETURNING id, name
    `);
    
    console.log(`   ✅ Marked ${result.rowCount} existing plans as master plans\n`);
    
    if (result.rowCount > 0) {
      console.log('   Migrated Plans:');
      result.rows.forEach(plan => {
        console.log(`   • ${plan.name} (ID: ${plan.id})`);
      });
      console.log();
    }
    
    // 4. Add comments to columns
    console.log('4️⃣  Adding column comments...');
    
    const commentQueries = [
      `COMMENT ON COLUMN membership_plans."isMaster" IS 'True if this is a super admin master template plan'`,
      `COMMENT ON COLUMN membership_plans."masterPlanId" IS 'Reference to master plan if this is a customized version'`,
      `COMMENT ON COLUMN membership_plans."organizationId" IS 'Tenant/Organization ID if this is org-specific customization'`,
      `COMMENT ON COLUMN membership_plans."organizationType" IS 'hospital, clinic, lab, pharmacy, homecare, etc.'`,
      `COMMENT ON COLUMN membership_plans."customizedBy" IS 'User ID who customized this plan'`,
      `COMMENT ON COLUMN membership_plans."customizationNotes" IS 'Notes about customization from master plan'`,
    ];
    
    for (const query of commentQueries) {
      await client.query(query);
    }
    
    console.log('   ✅ Comments added successfully\n');
    
    await client.query('COMMIT');
    
    // 5. Display final statistics
    console.log('📊 Migration Statistics:\n');
    
    const stats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE "isMaster" = TRUE) as master_plans,
        COUNT(*) FILTER (WHERE "isMaster" = FALSE) as customized_plans,
        COUNT(*) as total_plans
      FROM membership_plans
    `);
    
    const { master_plans, customized_plans, total_plans } = stats.rows[0];
    
    console.log(`   Total Plans:       ${total_plans}`);
    console.log(`   Master Plans:      ${master_plans}`);
    console.log(`   Customized Plans:  ${customized_plans}`);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));
    console.log('\n📝 Next Steps:');
    console.log('   1. Restart your server to load new schema');
    console.log('   2. Super admins can create master plans via /api/membership/admin/plans');
    console.log('   3. Org admins can customize via /api/org-membership-plans/customize/:id');
    console.log('   4. Test with: hospital_admin, clinic_admin, lab_admin, etc.\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration Failed:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute migration
migrateSchema()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
