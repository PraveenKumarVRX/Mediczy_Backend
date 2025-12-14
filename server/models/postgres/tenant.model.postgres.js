/**
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
      'homecare'
    ),
    allowNull: false,
    comment: 'Type of healthcare organization'
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
    comment: 'Primary admin user ID'
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

export default Tenant;
