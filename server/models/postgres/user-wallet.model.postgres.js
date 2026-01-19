/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * User Wallet Model (PostgreSQL)
 * Stores user health coins balance and wallet information
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const UserWallet = sequelize.define('UserWallet', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Link to user
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'User account ID'
  },
  
  // Balance
  balance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    allowNull: false,
    comment: 'Current health coins balance'
  },
  
  // Lifetime statistics
  totalEarned: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    allowNull: false,
    comment: 'Total health coins earned'
  },
  
  totalSpent: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    allowNull: false,
    comment: 'Total health coins spent'
  },
  
  totalPurchased: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    allowNull: false,
    comment: 'Total health coins purchased'
  },
  
  // Tracking
  lastActivityDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last date user earned coins'
  },
  
  streakDays: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Consecutive days of app usage'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional wallet metadata'
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_wallets',
  timestamps: true,
  
  indexes: [
    { fields: ['userId'], unique: true },
    { fields: ['balance'] },
    { fields: ['isActive'] }
  ]
});

export default UserWallet;
