/**
 * Health Coins Transaction Model (PostgreSQL)
 * Records all wallet transactions (earn, spend, purchase)
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const HealthCoinsTransaction = sequelize.define('HealthCoinsTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // User reference
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Transaction details
  type: {
    type: DataTypes.ENUM(
      'EARN',      // Earned through activities
      'SPEND',     // Spent on services/products
      'PURCHASE',  // Purchased with real money
      'REFUND',    // Refund of spent coins
      'BONUS',     // Bonus/promotional coins
      'TRANSFER',  // Transfer between users
      'ADJUSTMENT' // Admin adjustment
    ),
    allowNull: false
  },
  
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Amount of health coins (positive for credit, negative for debit)'
  },
  
  balanceAfter: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Wallet balance after transaction'
  },
  
  // Activity source (for EARN type)
  activityType: {
    type: DataTypes.ENUM(
      'DAILY_LOGIN',           // Daily app access
      'STEPS_MILESTONE',       // 100 steps achieved
      'HEALTH_ASSESSMENT',     // Completed health assessment
      'APPOINTMENT_BOOKING',   // Booked appointment
      'APPOINTMENT_COMPLETED', // Completed appointment
      'PROFILE_COMPLETION',    // Completed profile
      'MEDICATION_ADHERENCE',  // Took medication on time
      'VITAL_SIGNS_LOG',       // Logged vital signs
      'HEALTH_DIARY_ENTRY',    // Created health diary entry
      'REFERRAL',              // Referred a friend
      'REVIEW',                // Left a review
      'STREAK_BONUS',          // Consecutive days streak
      'WEEKLY_GOAL',           // Achieved weekly goal
      'MONTHLY_GOAL',          // Achieved monthly goal
      'PURCHASE',              // Purchased coins
      'CONSULTATION',          // Spent on consultation
      'LAB_TEST',              // Spent on lab test
      'MEDICATION',            // Spent on medication
      'OTHER'                  // Other activities
    ),
    allowNull: true
  },
  
  // Description
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Reference to related entity
  referenceType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of related entity (appointment, order, etc.)'
  },
  
  referenceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of related entity'
  },
  
  // Payment details (for PURCHASE type)
  paymentMethod: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  paymentTransactionId: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  amountPaid: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Real money amount paid (in INR)'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional transaction data'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'),
    defaultValue: 'COMPLETED'
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'health_coins_transactions',
  timestamps: false,
  
  indexes: [
    { fields: ['userId'] },
    { fields: ['type'] },
    { fields: ['activityType'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
    { fields: ['referenceType', 'referenceId'] }
  ]
});

export default HealthCoinsTransaction;
