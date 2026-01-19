import { postgresSequelize } from '../db/postgres-sequelize.js';

const runMigration = async () => {
  try {
    const queryInterface = postgresSequelize.getQueryInterface();
    const Sequelize = postgresSequelize.Sequelize;

    console.log('Creating module_access table...');
    
    // Create module_access table
    await queryInterface.createTable('module_access', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userType: {
        type: Sequelize.STRING(50),
        allowNull: false,
        field: 'user_type'
      },
      moduleId: {
        type: Sequelize.STRING(100),
        allowNull: false,
        field: 'module_id'
      },
      moduleName: {
        type: Sequelize.STRING(200),
        allowNull: false,
        field: 'module_name'
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      isEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        field: 'is_enabled'
      },
      canView: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        field: 'can_view'
      },
      canCreate: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        field: 'can_create'
      },
      canEdit: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        field: 'can_edit'
      },
      canDelete: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        field: 'can_delete'
      },
      canExport: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        field: 'can_export'
      },
      displayOrder: {
        type: Sequelize.INTEGER,
        defaultValue: 999,
        field: 'display_order'
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      customPermissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        field: 'custom_permissions'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'created_at'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'updated_at'
      }
    });

    console.log('Creating indexes for module_access...');
    
    await queryInterface.addIndex('module_access', ['user_type', 'module_id'], {
      unique: true,
      name: 'unique_user_type_module'
    });
    await queryInterface.addIndex('module_access', ['user_type']);
    await queryInterface.addIndex('module_access', ['module_id']);
    await queryInterface.addIndex('module_access', ['category']);
    await queryInterface.addIndex('module_access', ['is_enabled']);

    console.log('Creating user_module_overrides table...');
    
    await queryInterface.createTable('user_module_overrides', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: 'user_id'
      },
      moduleId: {
        type: Sequelize.STRING(100),
        allowNull: false,
        field: 'module_id'
      },
      isEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        field: 'is_enabled'
      },
      canView: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        field: 'can_view'
      },
      canCreate: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        field: 'can_create'
      },
      canEdit: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        field: 'can_edit'
      },
      canDelete: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        field: 'can_delete'
      },
      canExport: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        field: 'can_export'
      },
      customPermissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        field: 'custom_permissions'
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      grantedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: 'granted_by'
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'expires_at'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'created_at'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'updated_at'
      }
    });

    console.log('Creating indexes for user_module_overrides...');
    
    await queryInterface.addIndex('user_module_overrides', ['user_id', 'module_id'], {
      unique: true,
      name: 'unique_user_module_override'
    });
    await queryInterface.addIndex('user_module_overrides', ['user_id']);
    await queryInterface.addIndex('user_module_overrides', ['module_id']);
    await queryInterface.addIndex('user_module_overrides', ['expires_at']);

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
