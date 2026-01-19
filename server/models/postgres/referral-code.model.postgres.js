import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const ReferralCode = sequelize.define('ReferralCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique referral code'
  },
  type: {
    type: DataTypes.ENUM('USER', 'CORPORATE', 'AFFILIATE', 'PROMOTIONAL'),
    allowNull: false,
    defaultValue: 'USER'
  },
  ownerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
    comment: 'User who owns this referral code'
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Corporate entity if corporate referral'
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'subscription_plans',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
    comment: 'Specific plan this code grants access to'
  },
  discount: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Discount percentage (0-100)'
  },
  bonusCoins: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Health coins awarded on signup'
  },
  maxUses: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Max number of times code can be used (null = unlimited)'
  },
  usedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of times code has been used'
  },
  validFrom: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Expiry date (null = no expiry)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional referral metadata'
  }
}, {
  tableName: 'referral_codes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['owner_id'] },
    { fields: ['corporate_id'] },
    { fields: ['type'] },
    { fields: ['is_active'] },
    { 
      fields: ['code', 'is_active'],
      name: 'idx_active_codes'
    }
  ]
});

export default ReferralCode;
