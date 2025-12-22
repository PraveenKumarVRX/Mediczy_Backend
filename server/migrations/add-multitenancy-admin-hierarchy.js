/**
 * Database Migration: Add Multitenancy Admin Hierarchy
 * 
 * This migration adds support for organization-level super admins across all tenant types
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface) {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🔄 Starting multitenancy admin hierarchy migration...');
    
    // 1. Add new tenant types to enum
    console.log('📝 Step 1: Adding new tenant types (TPA, PSU, NGO, Insurer)...');
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'tpa';
      ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'psu';
      ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'ngo';
      ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'insurer';
    `, { transaction });
    
    // 2. Add admin fields to tenants table
    console.log('📝 Step 2: Adding admin fields to tenants table...');
    
    // Check if admin_user_id exists
    const adminUserIdExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='tenants' AND column_name='admin_user_id';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (adminUserIdExists.length === 0) {
      await queryInterface.addColumn('tenants', 'admin_user_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Primary organization admin user ID',
        references: {
          model: 'users',
          key: 'id'
        }
      }, { transaction });
    }
    
    // Check if admin_email exists
    const adminEmailExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='tenants' AND column_name='admin_email';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (adminEmailExists.length === 0) {
      await queryInterface.addColumn('tenants', 'admin_email', {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Primary admin email for organization setup'
      }, { transaction });
    }
    
    // Check if admin_users exists
    const adminUsersExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='tenants' AND column_name='admin_users';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (adminUsersExists.length === 0) {
      await queryInterface.addColumn('tenants', 'admin_users', {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of admin user IDs for this organization'
      }, { transaction });
    }
    
    // 3. Add organization context fields to users table
    console.log('📝 Step 3: Adding organization context fields to users table...');
    
    // Check if tenant_id exists
    const tenantIdExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='tenant_id';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (tenantIdExists.length === 0) {
      await queryInterface.addColumn('users', 'tenant_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Reference to tenant (organization) this user belongs to'
      }, { transaction });
    }
    
    // Check if department_id exists
    const departmentIdExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='department_id';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (departmentIdExists.length === 0) {
      await queryInterface.addColumn('users', 'department_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Department/unit ID within organization'
      }, { transaction });
    }
    
    // Check if department_name exists
    const departmentNameExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='department_name';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (departmentNameExists.length === 0) {
      await queryInterface.addColumn('users', 'department_name', {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Department name (e.g., Cardiology, HR, Pathology)'
      }, { transaction });
    }
    
    // Check if permissions exists
    const permissionsExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='permissions';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (permissionsExists.length === 0) {
      await queryInterface.addColumn('users', 'permissions', {
        type: DataTypes.JSONB,
        defaultValue: [],
        comment: 'Array of permission strings'
      }, { transaction });
    }
    
    // Check if scope exists
    const scopeExists = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='scope';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (scopeExists.length === 0) {
      await queryInterface.addColumn('users', 'scope', {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: 'Access scope restrictions'
      }, { transaction });
    }
    
    // 4. Create organization_admins table
    console.log('📝 Step 4: Creating organization_admins table...');
    
    const tableExists = await queryInterface.sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name='organization_admins';
    `, { transaction, type: queryInterface.sequelize.QueryTypes.SELECT });
    
    if (tableExists.length === 0) {
      await queryInterface.createTable('organization_admins', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        tenant_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'tenants',
            key: 'id'
          }
        },
        admin_role: {
          type: DataTypes.ENUM('org_admin', 'dept_admin', 'billing_admin', 'hr_admin', 'reports_admin', 'support_admin'),
          allowNull: false,
          defaultValue: 'org_admin'
        },
        department_id: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        department_name: {
          type: DataTypes.STRING(100),
          allowNull: true
        },
        permissions: {
          type: DataTypes.JSONB,
          defaultValue: []
        },
        scope: {
          type: DataTypes.JSONB,
          defaultValue: {}
        },
        is_primary: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        },
        status: {
          type: DataTypes.ENUM('active', 'inactive', 'suspended'),
          defaultValue: 'active'
        },
        appointed_by: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        appointed_at: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW
        },
        valid_from: {
          type: DataTypes.DATE,
          allowNull: true
        },
        valid_until: {
          type: DataTypes.DATE,
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSONB,
          defaultValue: {}
        },
        last_access_at: {
          type: DataTypes.DATE,
          allowNull: true
        },
        access_count: {
          type: DataTypes.INTEGER,
          defaultValue: 0
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      }, { transaction });
      
      // Add indexes
      await queryInterface.addIndex('organization_admins', ['user_id'], { transaction });
      await queryInterface.addIndex('organization_admins', ['tenant_id'], { transaction });
      await queryInterface.addIndex('organization_admins', ['user_id', 'tenant_id'], { 
        unique: true, 
        name: 'unique_user_tenant',
        transaction 
      });
      await queryInterface.addIndex('organization_admins', ['status'], { transaction });
      await queryInterface.addIndex('organization_admins', ['is_primary'], { transaction });
    }
    
    // 5. Update existing system admins
    console.log('📝 Step 5: Updating existing system admin roles...');
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET role = 'system_admin' 
      WHERE "isAdmin" = true 
      AND (role = 'admin' OR role = 'super_admin')
      AND organization_id IS NULL;
    `, { transaction });
    
    // 6. Sync tenant_id with organization_id for existing users
    console.log('📝 Step 6: Syncing tenant_id with organization_id...');
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET tenant_id = organization_id 
      WHERE organization_id IS NOT NULL 
      AND tenant_id IS NULL;
    `, { transaction });
    
    await transaction.commit();
    console.log('✅ Multitenancy admin hierarchy migration completed successfully!');
    
    console.log('\n📊 Migration Summary:');
    console.log('  ✅ Added 4 new tenant types: TPA, PSU, NGO, Insurer');
    console.log('  ✅ Added admin fields to tenants table');
    console.log('  ✅ Added organization context fields to users table');
    console.log('  ✅ Created organization_admins table');
    console.log('  ✅ Updated existing system admin roles');
    console.log('  ✅ Synced tenant_id with organization_id');
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down(queryInterface) {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🔄 Rolling back multitenancy admin hierarchy migration...');
    
    // Drop organization_admins table
    await queryInterface.dropTable('organization_admins', { transaction });
    
    // Remove columns from users table
    await queryInterface.removeColumn('users', 'scope', { transaction });
    await queryInterface.removeColumn('users', 'permissions', { transaction });
    await queryInterface.removeColumn('users', 'department_name', { transaction });
    await queryInterface.removeColumn('users', 'department_id', { transaction });
    await queryInterface.removeColumn('users', 'tenant_id', { transaction });
    
    // Remove columns from tenants table
    await queryInterface.removeColumn('tenants', 'admin_users', { transaction });
    await queryInterface.removeColumn('tenants', 'admin_email', { transaction });
    await queryInterface.removeColumn('tenants', 'admin_user_id', { transaction });
    
    // Note: Cannot remove enum values in PostgreSQL, they remain but unused
    
    await transaction.commit();
    console.log('✅ Rollback completed successfully!');
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  up(sequelize.getQueryInterface())
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
