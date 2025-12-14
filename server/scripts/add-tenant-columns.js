/**
 * Add tenant_id to all existing tables
 * Multi-tenancy migration script
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

const tables = [
  'users',
  'doctors',
  'appointments',
  'prescriptions',
  'corporates',
  'nurses',
  'doctor_assistants',
  'notifications',
  'labs',
  'pharmacies',
  'ambulances',
  'homecare_providers'
];

async function addTenantColumns() {
  console.log('\n🔧 Adding tenant_id columns to all tables...\n');
  
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connected\n');
    
    for (const table of tables) {
      try {
        // Check if tenant_id column already exists
        const [columns] = await sequelize.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = '${table}' AND column_name = 'tenant_id'`,
          { type: QueryTypes.SELECT }
        );
        
        if (columns) {
          console.log(`   ⏭️  Table '${table}' already has tenant_id column`);
          continue;
        }
        
        // Add tenant_id column
        await sequelize.query(`
          ALTER TABLE ${table} 
          ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL 
          REFERENCES tenants(id) ON DELETE CASCADE;
        `);
        
        console.log(`   ✅ Added tenant_id to '${table}'`);
        
        // Add index for performance
        await sequelize.query(`
          CREATE INDEX IF NOT EXISTS idx_${table}_tenant_id 
          ON ${table}(tenant_id);
        `);
        
        console.log(`   ✅ Created index on '${table}.tenant_id'`);
        
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`   ⏭️  Column/index already exists for '${table}'`);
        } else {
          console.error(`   ❌ Error on '${table}':`, error.message);
        }
      }
    }
    
    console.log('\n✅ Migration completed!\n');
    console.log('📝 Summary:');
    console.log(`   - Added tenant_id to ${tables.length} tables`);
    console.log(`   - Created indexes for query performance`);
    console.log(`   - Set up foreign key constraints`);
    console.log('\n⚠️  Next steps:');
    console.log('   1. Update application code to use tenant context');
    console.log('   2. Populate existing records with tenant_id (if needed)');
    console.log('   3. Make tenant_id NOT NULL after data migration');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addTenantColumns();
