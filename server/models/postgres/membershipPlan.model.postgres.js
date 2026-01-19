import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

/**
 * Membership plans + user subscriptions (PostgreSQL)
 * Model reflects actual database schema with camelCase columns
 */

export const MembershipPlan = sequelize.define('MembershipPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  discountedPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  durationMonths: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  benefits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  limitations: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  
  // Master Plan & Customization
  isMaster: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if this is a super admin master template plan'
  },
  masterPlanId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'membership_plans',
      key: 'id'
    },
    comment: 'Reference to master plan if this is a customized version'
  },
  
  // Organization Context
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Tenant/Organization ID if this is org-specific customization'
  },
  organizationType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'hospital, clinic, lab, pharmacy, homecare, etc.'
  },
  
  // Customization Info
  customizedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID who customized this plan'
  },
  customizationNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes about customization from master plan'
  },
  
  // Plan Type & Tier (for upgrades and addons)
  planType: {
    type: DataTypes.ENUM('primary', 'addon'),
    defaultValue: 'primary',
    comment: 'primary = main plan (one per user), addon = optional additional plan'
  },
  tier: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Plan tier level (1=basic, 2=standard, 3=premium, etc.) for upgrade path'
  },
  tierName: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Display name for tier: basic, standard, premium, enterprise'
  }
}, {
  tableName: 'membership_plans',
  timestamps: true
});

// Association for master plan relationship
MembershipPlan.belongsTo(MembershipPlan, {
  as: 'masterPlan',
  foreignKey: 'masterPlanId'
});

MembershipPlan.hasMany(MembershipPlan, {
  as: 'customizations',
  foreignKey: 'masterPlanId'
});

export const UserPlan = sequelize.define('UserPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  membershipPlanId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'active'
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  paymentId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paidAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'user_plans',
  timestamps: true
});

UserPlan.belongsTo(MembershipPlan, {
  foreignKey: 'membershipPlanId',
  as: 'plan'
});

export default MembershipPlan;
