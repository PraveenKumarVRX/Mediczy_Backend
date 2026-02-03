/**
 * Role Management Model
 * Allows admin to create custom roles with module access and CRUD privileges
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

/**
 * Role Model
 * Stores admin-defined custom roles
 */
const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  
  // Unique role name/code (e.g., 'clinic_receptionist', 'senior_doctor')
  roleCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique role identifier code'
  },
  
  // Human-readable role name
  roleName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Display name for the role'
  },
  
  // Role description
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed description of this role'
  },
  
  // Base user type this role extends (patient, doctor, etc.)
  baseUserType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Base user type this role is derived from'
  },
  
  // Role category for grouping (e.g., 'clinical', 'administrative', 'support')
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'custom',
    comment: 'Category for grouping roles'
  },
  
  // Priority level (higher = more privileges)
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Priority level for role hierarchy'
  },
  
  // Whether this role is active
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this role is currently active'
  },
  
  // Whether this is a system role (cannot be deleted)
  isSystem: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'System roles cannot be deleted'
  },
  
  // Organization ID (for multi-tenant)
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Organization this role belongs to (null = global)'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional role metadata'
  },
  
  // Who created this role
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Admin who created this role'
  },
  
  // Who last modified
  modifiedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Admin who last modified this role'
  }
}, {
  tableName: 'roles',
  timestamps: true,
  underscored: true,
  paranoid: true, // Soft delete
  indexes: [
    { fields: ['role_code'], unique: true },
    { fields: ['base_user_type'] },
    { fields: ['category'] },
    { fields: ['is_active'] },
    { fields: ['organization_id'] },
    { fields: ['priority'] }
  ]
});

/**
 * RoleModuleAccess Model
 * Maps modules to roles with CRUD permissions
 */
const RoleModuleAccess = sequelize.define('RoleModuleAccess', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  
  // Reference to the role
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    },
    comment: 'Role this access applies to'
  },
  
  // Module identifier
  moduleId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Module identifier from SYSTEM_MODULES'
  },
  
  // Module display name (cached for performance)
  moduleName: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Cached module name'
  },
  
  // Module category
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Module category'
  },
  
  // Whether module is enabled for this role
  isEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this module is enabled for the role'
  },
  
  // CRUD Permissions
  canView: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Read/View permission'
  },
  
  canCreate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Create permission'
  },
  
  canEdit: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Update/Edit permission'
  },
  
  canDelete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Delete permission'
  },
  
  canExport: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Export data permission'
  },
  
  canImport: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Import data permission'
  },
  
  canApprove: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Approval permission'
  },
  
  canManage: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Full management permission'
  },
  
  // Additional permissions as JSONB for flexibility
  additionalPermissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Module-specific additional permissions'
  },
  
  // Conditions for access (e.g., only own data)
  accessConditions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Conditional access rules (e.g., own_data_only: true)'
  },
  
  // Display order
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Icon
  icon: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  // Route path
  routePath: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  
  // Who last modified
  modifiedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'role_module_access',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['role_id'] },
    { fields: ['module_id'] },
    { fields: ['role_id', 'module_id'], unique: true },
    { fields: ['is_enabled'] },
    { fields: ['category'] }
  ]
});

/**
 * UserRole Model
 * Assigns roles to users (many-to-many)
 */
const UserRole = sequelize.define('UserRole', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  
  // User ID
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User this role is assigned to'
  },
  
  // Role ID
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    },
    comment: 'Role assigned to the user'
  },
  
  // Whether this assignment is active
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Assignment expiry (for temporary roles)
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When this role assignment expires'
  },
  
  // Who assigned this role
  assignedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  
  // Assignment notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'user_roles',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['role_id'] },
    { fields: ['user_id', 'role_id'], unique: true },
    { fields: ['is_active'] },
    { fields: ['expires_at'] }
  ]
});

// Set up associations
Role.hasMany(RoleModuleAccess, { foreignKey: 'roleId', as: 'moduleAccess' });
RoleModuleAccess.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

Role.hasMany(UserRole, { foreignKey: 'roleId', as: 'userAssignments' });
UserRole.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

/**
 * Get effective module access for a user based on their assigned roles
 */
export const getUserRoleModuleAccess = async (userId) => {
  try {
    // Get user's active roles
    const userRoles = await UserRole.findAll({
      where: {
        userId,
        isActive: true,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      include: [{
        model: Role,
        as: 'role',
        where: { isActive: true },
        include: [{
          model: RoleModuleAccess,
          as: 'moduleAccess',
          where: { isEnabled: true },
          required: false
        }]
      }]
    });
    
    // Merge permissions from all roles (highest permission wins)
    const moduleMap = {};
    
    for (const userRole of userRoles) {
      const role = userRole.role;
      if (!role || !role.moduleAccess) continue;
      
      for (const access of role.moduleAccess) {
        const existing = moduleMap[access.moduleId];
        if (!existing) {
          moduleMap[access.moduleId] = {
            moduleId: access.moduleId,
            moduleName: access.moduleName,
            category: access.category,
            icon: access.icon,
            routePath: access.routePath,
            displayOrder: access.displayOrder,
            isEnabled: access.isEnabled,
            canView: access.canView,
            canCreate: access.canCreate,
            canEdit: access.canEdit,
            canDelete: access.canDelete,
            canExport: access.canExport,
            canImport: access.canImport,
            canApprove: access.canApprove,
            canManage: access.canManage,
            additionalPermissions: access.additionalPermissions,
            accessConditions: access.accessConditions,
            roles: [role.roleName]
          };
        } else {
          // Merge permissions (OR logic - if any role grants permission, user has it)
          existing.canView = existing.canView || access.canView;
          existing.canCreate = existing.canCreate || access.canCreate;
          existing.canEdit = existing.canEdit || access.canEdit;
          existing.canDelete = existing.canDelete || access.canDelete;
          existing.canExport = existing.canExport || access.canExport;
          existing.canImport = existing.canImport || access.canImport;
          existing.canApprove = existing.canApprove || access.canApprove;
          existing.canManage = existing.canManage || access.canManage;
          existing.roles.push(role.roleName);
          // Merge additional permissions
          existing.additionalPermissions = {
            ...existing.additionalPermissions,
            ...access.additionalPermissions
          };
        }
      }
    }
    
    return Object.values(moduleMap).sort((a, b) => a.displayOrder - b.displayOrder);
  } catch (error) {
    console.error('Error getting user role module access:', error);
    return [];
  }
};

/**
 * Initialize system default roles
 */
export const initializeSystemRoles = async () => {
  try {
    const systemRoles = [
      {
        roleCode: 'super_admin',
        roleName: 'Super Admin',
        description: 'Full system access with all permissions',
        category: 'system',
        priority: 100,
        isSystem: true
      },
      {
        roleCode: 'org_admin',
        roleName: 'Organization Admin',
        description: 'Full access within organization',
        category: 'administrative',
        priority: 90,
        isSystem: true
      },
      {
        roleCode: 'senior_doctor',
        roleName: 'Senior Doctor',
        description: 'Doctor with additional management privileges',
        baseUserType: 'doctor',
        category: 'clinical',
        priority: 80,
        isSystem: true
      },
      {
        roleCode: 'doctor',
        roleName: 'Doctor',
        description: 'Standard doctor access',
        baseUserType: 'doctor',
        category: 'clinical',
        priority: 70,
        isSystem: true
      },
      {
        roleCode: 'nurse',
        roleName: 'Nurse',
        description: 'Nursing staff access',
        baseUserType: 'nurse',
        category: 'clinical',
        priority: 60,
        isSystem: true
      },
      {
        roleCode: 'receptionist',
        roleName: 'Receptionist',
        description: 'Front desk staff access',
        category: 'administrative',
        priority: 40,
        isSystem: true
      },
      {
        roleCode: 'lab_technician',
        roleName: 'Lab Technician',
        description: 'Laboratory staff access',
        baseUserType: 'lab_technician',
        category: 'clinical',
        priority: 50,
        isSystem: true
      },
      {
        roleCode: 'pharmacist',
        roleName: 'Pharmacist',
        description: 'Pharmacy staff access',
        baseUserType: 'pharmacy_staff',
        category: 'clinical',
        priority: 50,
        isSystem: true
      },
      {
        roleCode: 'billing_staff',
        roleName: 'Billing Staff',
        description: 'Billing and finance access',
        category: 'administrative',
        priority: 45,
        isSystem: true
      },
      {
        roleCode: 'patient',
        roleName: 'Patient',
        description: 'Standard patient access',
        baseUserType: 'patient',
        category: 'patient',
        priority: 10,
        isSystem: true
      }
    ];
    
    for (const role of systemRoles) {
      await Role.upsert(role);
    }
    
    console.log('✅ System roles initialized');
    return true;
  } catch (error) {
    console.error('Error initializing system roles:', error);
    return false;
  }
};

export { Role, RoleModuleAccess, UserRole };
export default Role;
