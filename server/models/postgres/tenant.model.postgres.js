/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PostgreSQL Tenant Model
 * Multi-tenant organization management
 * 
 * Supports: Hospitals, Clinics, Labs, Pharmacies, Ambulances, Corporates, Homecare
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // UUID for public-facing identifier
  uid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false,
    comment: 'Public-facing unique identifier (UUID)'
  },
  
  // Tenant Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Organization name'
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'URL-safe identifier (e.g., apollo-hospital-chennai)'
  },
  subdomain: {
    type: DataTypes.STRING(63),
    allowNull: true,
    unique: true,
    comment: 'Subdomain for tenant (e.g., apollo.mayden.in)'
  },
  custom_domain: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    comment: 'Custom domain (e.g., health.apollohospitals.com)'
  },
  
  // Organization Type
  type: {
    type: DataTypes.ENUM(
      'hospital',
      'clinic', 
      'lab',
      'pharmacy',
      'ambulance',
      'corporate',
      'homecare',
      'tpa',        // Third Party Administrator
      'psu',        // Public Sector Undertaking
      'ngo',        // Non-Governmental Organization
      'insurer',    // Insurance Company
      'broker'      // Insurance Broker / Aggregator
    ),
    allowNull: false,
    comment: 'Type of healthcare organization'
  },
  
  // Aggregator UID (for brokers only) - Format: A + 5 alphanumeric (e.g., A1B2C)
  aggregator_uid: {
    type: DataTypes.STRING(6),
    allowNull: true,
    unique: true,
    comment: 'Unique ID for brokers/aggregators - Format: A + 5 alphanumeric'
  },
  
  // Parent Organization (for hierarchical relationships - e.g., corporates tagged to broker/aggregator)
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    },
    onDelete: 'SET NULL',
    comment: 'Parent organization ID (e.g., broker/aggregator for corporates)'
  },
  
  // Contact Information
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  website: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Address
  address: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Complete address object'
  },
  
  // Geolocation
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  
  // Organization Details
  registration_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Government registration/license number'
  },
  tax_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Tax identification number'
  },
  
  // Subscription & Billing
  plan: {
    type: DataTypes.ENUM('free', 'basic', 'professional', 'enterprise', 'custom'),
    allowNull: false,
    defaultValue: 'free'
  },
  plan_start_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  plan_end_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'quarterly', 'annual'),
    allowNull: true
  },
  
  // Usage Limits
  limits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      users: 10,
      doctors: 5,
      appointments_per_month: 100,
      storage_gb: 5
    },
    comment: 'Plan-based usage limits'
  },
  
  // Current Usage
  usage: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      users: 0,
      doctors: 0,
      appointments_this_month: 0,
      storage_gb: 0
    },
    comment: 'Current usage statistics'
  },
  
  // Settings & Configuration
  settings: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      timezone: 'Asia/Kolkata',
      language: 'en',
      currency: 'INR',
      date_format: 'DD/MM/YYYY',
      time_format: '24h'
    },
    comment: 'Tenant-specific settings'
  },
  
  // Branding
  branding: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      logo_url: null,
      primary_color: '#0066cc',
      secondary_color: '#00994d',
      favicon_url: null
    },
    comment: 'Customizable branding'
  },
  
  // Feature Flags
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      appointments: true,
      telemedicine: false,
      prescriptions: true,
      lab_tests: false,
      pharmacy: false,
      insurance: false,
      ai_assistant: false,
      analytics: false
    },
    comment: 'Enabled features per plan'
  },
  
  // Integration Keys (encrypted)
  integrations: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Third-party integrations (payment, SMS, email)'
  },
  
  // Admin User
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Primary admin user ID (references users table)'
  },
  admin_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Primary organization admin user ID (same as owner_id)',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  admin_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    comment: 'Primary admin email for organization setup'
  },
  admin_password: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Hashed password for clinic admin (bcrypt)'
  },
  admin_metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      login_attempts: 0,
      last_login: null,
      locked_until: null,
      last_password_change: null
    },
    comment: 'Admin authentication metadata (login attempts, lockout status)'
  },
  admin_users: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of admin user IDs for this organization (supports multi-admin)'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('pending', 'active', 'suspended', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Additional tenant metadata'
  },
  
  // Timestamps
  onboarded_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_activity_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tenants',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['slug'],
      unique: true
    },
    {
      fields: ['subdomain'],
      unique: true,
      where: {
        subdomain: { [Op.ne]: null }
      }
    },
    {
      fields: ['custom_domain'],
      unique: true,
      where: {
        custom_domain: { [Op.ne]: null }
      }
    },
    {
      fields: ['type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['plan']
    },
    {
      using: 'GIN',
      fields: ['settings']
    },
    {
      using: 'GIN',
      fields: ['features']
    }
  ]
});

// Instance Methods
Tenant.prototype.isFeatureEnabled = function(featureName) {
  return this.features?.[featureName] === true;
};

Tenant.prototype.hasReachedLimit = function(limitType) {
  const limit = this.limits?.[limitType];
  const usage = this.usage?.[limitType];
  return limit && usage >= limit;
};

Tenant.prototype.incrementUsage = async function(usageType, amount = 1) {
  if (!this.usage) this.usage = {};
  this.usage[usageType] = (this.usage[usageType] || 0) + amount;
  await this.save();
};

Tenant.prototype.resetMonthlyUsage = async function() {
  this.usage.appointments_this_month = 0;
  await this.save();
};

// Helper function to generate aggregator UID (A + 5 alphanumeric)
const generateAggregatorUID = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let uid = 'A'; // Always starts with 'A'
  for (let i = 0; i < 5; i++) {
    uid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return uid;
};

// Hooks for password hashing and aggregator UID generation
import bcrypt from 'bcryptjs';

Tenant.beforeCreate(async (tenant) => {
  if (tenant.admin_password) {
    tenant.admin_password = await bcrypt.hash(tenant.admin_password, 10);
  }
  
  // Auto-generate aggregator_uid for brokers
  if (tenant.type === 'broker' && !tenant.aggregator_uid) {
    let uid = generateAggregatorUID();
    // Ensure uniqueness
    let exists = await Tenant.findOne({ where: { aggregator_uid: uid } });
    while (exists) {
      uid = generateAggregatorUID();
      exists = await Tenant.findOne({ where: { aggregator_uid: uid } });
    }
    tenant.aggregator_uid = uid;
  }
});

Tenant.beforeUpdate(async (tenant) => {
  if (tenant.changed('admin_password') && tenant.admin_password) {
    tenant.admin_password = await bcrypt.hash(tenant.admin_password, 10);
  }
  
  // Generate aggregator_uid if type changed to broker
  if (tenant.changed('type') && tenant.type === 'broker' && !tenant.aggregator_uid) {
    let uid = generateAggregatorUID();
    let exists = await Tenant.findOne({ where: { aggregator_uid: uid } });
    while (exists) {
      uid = generateAggregatorUID();
      exists = await Tenant.findOne({ where: { aggregator_uid: uid } });
    }
    tenant.aggregator_uid = uid;
  }
});

// Instance method to verify admin password
Tenant.prototype.verifyAdminPassword = async function(password) {
  if (!this.admin_password) return false;
  return await bcrypt.compare(password, this.admin_password);
};

// Self-referential associations for parent-child hierarchy
// Example: Corporates belong to a Broker/Aggregator
Tenant.belongsTo(Tenant, { 
  foreignKey: 'parent_id', 
  as: 'parent'
});
Tenant.hasMany(Tenant, { 
  foreignKey: 'parent_id', 
  as: 'children'
});

// Instance method to get all child organizations
Tenant.prototype.getChildOrganizations = async function() {
  return await Tenant.findAll({
    where: { parent_id: this.id, status: 'active' }
  });
};

// Instance method to get parent organization
Tenant.prototype.getParentOrganization = async function() {
  if (!this.parent_id) return null;
  return await Tenant.findByPk(this.parent_id);
};

// Associations (will be set up by sequelize in initialization)
// Tenant has many Users (staff, patients, etc)
// Tenant.hasMany(User, { foreignKey: 'organization_id', as: 'users' });
// Tenant belongs to User (admin_user_id)
// Tenant.belongsTo(User, { foreignKey: 'admin_user_id', as: 'admin' });

export default Tenant;
