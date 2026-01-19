import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const MembershipPlan = sequelize.define('MembershipPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  slug: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'URL-friendly identifier: basic, premium, corporate-basic, corporate-premium'
  },
  type: {
    type: DataTypes.ENUM('PERSONAL', 'CORPORATE'),
    allowNull: false,
    defaultValue: 'PERSONAL'
  },
  tier: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Tier level for upgrade logic: 1=Basic, 2=Premium, 3=Enterprise'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Monthly price in INR'
  },
  annualPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Annual price with discount'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'INR'
  },
  billingCycle: {
    type: DataTypes.ENUM('MONTHLY', 'ANNUAL', 'LIFETIME'),
    allowNull: false,
    defaultValue: 'MONTHLY'
  },
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Plan features and limits'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  isPopular: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  requiresReferral: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'If true, requires referral code to enroll'
  },
  allowsUpgrade: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Max users allowed (for corporate plans)'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional plan metadata'
  }
}, {
  tableName: 'subscription_plans',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['type'] },
    { fields: ['tier'] },
    { fields: ['is_active'] }
  ]
});

export default MembershipPlan;
