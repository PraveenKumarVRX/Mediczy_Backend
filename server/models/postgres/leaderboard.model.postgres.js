import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const Leaderboard = sequelize.define('Leaderboard', {
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
  leaderboardType: {
    type: DataTypes.ENUM('GLOBAL', 'FRIENDS', 'CORPORATE', 'CHALLENGE', 'GOAL_CATEGORY'),
    allowNull: false,
    defaultValue: 'GLOBAL'
  },
  referenceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Challenge ID, Corporate ID, or Category ID depending on type'
  },
  period: {
    type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ALL_TIME'),
    allowNull: false,
    defaultValue: 'ALL_TIME'
  },
  periodStart: {
    type: DataTypes.DATE,
    allowNull: true
  },
  periodEnd: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  previousRank: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  totalPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  goalsCompleted: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  challengesWon: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  currentStreak: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  longestStreak: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  achievements: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of achievement IDs earned'
  },
  stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Detailed stats by category'
  },
  lastUpdated: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'leaderboards',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['leaderboard_type'] },
    { fields: ['period'] },
    { fields: ['rank'] },
    { fields: ['reference_id'] },
    {
      fields: ['leaderboard_type', 'period', 'rank'],
      name: 'idx_leaderboard_rankings'
    },
    {
      fields: ['user_id', 'leaderboard_type', 'period'],
      unique: true,
      name: 'idx_user_leaderboard_period'
    },
    {
      fields: ['leaderboard_type', 'reference_id', 'period', 'rank'],
      name: 'idx_specific_leaderboard'
    }
  ]
});

export default Leaderboard;
