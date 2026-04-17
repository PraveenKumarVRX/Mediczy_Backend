/**
 * Coupon Model - PostgreSQL
 * For corporate HC purchase coupons
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../../db/postgres-sequelize.js';

const Coupon = postgresSequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      isUppercase: true,
      len: [4, 50]
    }
  },
  type: {
    type: DataTypes.ENUM('PERCENTAGE', 'FIXED_HC', 'FREE_HC'),
    defaultValue: 'FIXED_HC',
    comment: 'PERCENTAGE: discount %, FIXED_HC: buy X get Y HC, FREE_HC: get X HC free'
  },
  value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Discount percentage or HC amount'
  },
  minPurchase: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Minimum HC purchase required (for PERCENTAGE type)'
  },
  maxUsage: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Maximum times this coupon can be used globally'
  },
  maxUsagePerUser: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Maximum times a single user can use this coupon'
  },
  usageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Current usage count'
  },
  validFrom: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'corporate_id',
    comment: 'If linked to a specific corporate account'
  },
  corporateName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Corporate name for reference'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  termsAndConditions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Admin ID who created this coupon'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional coupon metadata'
  }
}, {
  tableName: 'coupons',
  timestamps: true,
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['corporate_id'] },
    { fields: ['isActive'] },
    { fields: ['validFrom', 'validUntil'] }
  ]
});

export default Coupon;
