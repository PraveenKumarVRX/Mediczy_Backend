/**
 * Coupon Usage Model - PostgreSQL
 * Tracks coupon usage by users
 */

import { DataTypes } from 'sequelize';
import postgresSequelize from '../../config/database.postgres.js';

const CouponUsage = postgresSequelize.define('CouponUsage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  couponId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'coupons',
      key: 'id'
    }
  },
  couponCode: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  hcPurchased: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'HC amount purchased with this coupon'
  },
  hcBonus: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Bonus HC received from coupon'
  },
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Discount amount in INR'
  },
  amountPaid: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Final amount paid after discount'
  },
  paymentId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Razorpay payment ID'
  },
  usedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'coupon_usages',
  timestamps: true,
  indexes: [
    { fields: ['couponId'] },
    { fields: ['userId'] },
    { fields: ['couponCode'] },
    { fields: ['usedAt'] }
  ]
});

export default CouponUsage;
