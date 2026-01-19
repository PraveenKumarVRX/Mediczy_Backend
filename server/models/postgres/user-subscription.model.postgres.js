import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const UserSubscription = sequelize.define('UserSubscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subscription_plans',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'PENDING'),
    allowNull: false,
    defaultValue: 'ACTIVE'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Null for lifetime plans'
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  billingCycle: {
    type: DataTypes.ENUM('MONTHLY', 'ANNUAL', 'LIFETIME'),
    allowNull: false,
    defaultValue: 'MONTHLY'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Price at time of subscription'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'INR'
  },
  referralCodeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'referral_codes',
      key: 'id'
    },
    comment: 'Referral code used for enrollment'
  },
  corporateSponsorshipId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'corporate_plan_sponsorships',
      key: 'id'
    },
    comment: 'If sponsored by corporate'
  },
  paymentId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Payment gateway transaction ID'
  },
  paymentMethod: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'razorpay, stripe, corporate, referral'
  },
  paymentStatus: {
    type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'),
    allowNull: true,
    defaultValue: 'PENDING'
  },
  isUpgrade: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'True if upgraded from lower plan'
  },
  previousSubscriptionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'user_subscriptions',
      key: 'id'
    },
    comment: 'Previous subscription if upgraded'
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional subscription metadata'
  }
}, {
  tableName: 'user_subscriptions',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['plan_id'] },
    { fields: ['status'] },
    { fields: ['start_date'] },
    { fields: ['end_date'] },
    { fields: ['referral_code_id'] },
    { fields: ['corporate_sponsorship_id'] },
    { 
      fields: ['user_id', 'status'],
      name: 'idx_user_active_subscription'
    }
  ]
});

export default UserSubscription;
