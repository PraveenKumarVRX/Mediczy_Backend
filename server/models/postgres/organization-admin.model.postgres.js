/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Organization Admin Model - PostgreSQL
 * Multi-tenant organization administrator management
 * 
 * Supports: Hospital Admin, Clinic Admin, Lab Admin, TPA Admin, etc.
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const OrganizationAdmin = sequelize.define('OrganizationAdmin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // User Reference
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'User ID who is an admin'
  },
  
  // Organization Reference
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: 'Tenant (organization) this admin manages'
  },
  
  // Admin Role Level
  admin_role: {
    type: DataTypes.ENUM(
      'org_admin',      // Full organization admin
      'dept_admin',     // Department admin
      'billing_admin',  // Billing/finance only
      'hr_admin',       // HR/staff management only
      'reports_admin',  // Analytics/reports only
      'support_admin'   // Support/helpdesk only
    ),
    allowNull: false,
    defaultValue: 'org_admin',
    comment: 'Level of admin access within organization'
  },
  
  // Department Context (for dept_admin)
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Department ID for dept_admin role'
  },
  department_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Department name (e.g., Cardiology, ICU, HR)'
  },
  
  // Permissions
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Specific permissions array (e.g., ["manage_staff", "view_analytics"])'
  },
  
  // Access Scope
  scope: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Access restrictions (e.g., { departments: [1,2,3], features: ["billing"] })'
  },
  
  // Primary Admin Flag
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Is this the primary/main admin for the organization?'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active'
  },
  
  // Appointment Details
  appointed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID who appointed this admin'
  },
  appointed_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  // Validity Period
  valid_from: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Admin role valid from date'
  },
  valid_until: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Admin role expiry date (null = no expiry)'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional admin metadata'
  },
  
  // Activity Tracking
  last_access_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  access_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'organization_admins',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['tenant_id']
    },
    {
      fields: ['user_id', 'tenant_id'],
      unique: true,
      name: 'unique_user_tenant'
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_primary']
    }
  ]
});

// Class Methods
OrganizationAdmin.findAdminsForTenant = async function(tenantId) {
  return await this.findAll({
    where: { 
      tenant_id: tenantId,
      status: 'active'
    },
    order: [
      ['is_primary', 'DESC'],
      ['appointed_at', 'ASC']
    ]
  });
};

OrganizationAdmin.findPrimaryAdmin = async function(tenantId) {
  return await this.findOne({
    where: { 
      tenant_id: tenantId,
      is_primary: true,
      status: 'active'
    }
  });
};

OrganizationAdmin.findUserOrganizations = async function(userId) {
  return await this.findAll({
    where: { 
      user_id: userId,
      status: 'active'
    },
    order: [['is_primary', 'DESC']]
  });
};

// Instance Methods
OrganizationAdmin.prototype.hasPermission = function(permission) {
  if (!this.permissions || !Array.isArray(this.permissions)) {
    return false;
  }
  return this.permissions.includes(permission) || this.permissions.includes('*');
};

OrganizationAdmin.prototype.isActive = function() {
  if (this.status !== 'active') return false;
  
  const now = new Date();
  if (this.valid_from && now < new Date(this.valid_from)) return false;
  if (this.valid_until && now > new Date(this.valid_until)) return false;
  
  return true;
};

export default OrganizationAdmin;
