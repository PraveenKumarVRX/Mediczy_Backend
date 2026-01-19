import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Achievement = sequelize.define('Achievement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.ENUM(
      'GOALS', 'CHALLENGES', 'STREAKS', 'SOCIAL', 'MILESTONES', 
      'CONSISTENCY', 'CHAMPION', 'SPECIAL'
    ),
    allowNull: false
  },
  badgeIcon: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  badgeColor: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  tier: {
    type: DataTypes.ENUM('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'),
    allowNull: false,
    defaultValue: 'BRONZE'
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  coinReward: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  criteria: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Conditions to unlock this achievement'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  isSecret: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Hidden until unlocked'
  },
  unlockOrder: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'For sequential achievements'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'achievements',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['tier'] },
    { fields: ['is_active'] }
  ]
});

const UserAchievement = sequelize.define('UserAchievement', {
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
  achievementId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'achievements',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  unlockedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  progress: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 100,
    comment: 'Percentage progress (100 = completed)'
  },
  isNotified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  isDisplayed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Show on profile'
  }
}, {
  tableName: 'user_achievements',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['achievement_id'] },
    { fields: ['unlocked_at'] },
    {
      fields: ['user_id', 'achievement_id'],
      unique: true,
      name: 'idx_user_achievement_unique'
    }
  ]
});

export { Achievement, UserAchievement };
