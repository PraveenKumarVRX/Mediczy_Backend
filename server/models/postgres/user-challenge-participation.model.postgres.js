import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const UserChallengeParticipation = sequelize.define('UserChallengeParticipation', {
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
  challengeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'health_challenges',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'For team-based challenges'
  },
  status: {
    type: DataTypes.ENUM('REGISTERED', 'ACTIVE', 'COMPLETED', 'WITHDRAWN', 'DISQUALIFIED'),
    allowNull: false,
    defaultValue: 'REGISTERED'
  },
  currentValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  progressPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Current rank in leaderboard'
  },
  previousRank: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  pointsEarned: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  bonusPointsEarned: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  joinedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastActivityDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  checkIns: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of progress check-ins'
  },
  achievements: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Milestones and achievements earned in this challenge'
  },
  isWinner: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  prizeWon: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Health coins won as prize'
  },
  entryFeePaid: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'user_challenge_participation',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['challenge_id'] },
    { fields: ['status'] },
    { fields: ['rank'] },
    { fields: ['team_id'] },
    {
      fields: ['user_id', 'challenge_id'],
      unique: true,
      name: 'idx_user_challenge_unique'
    },
    {
      fields: ['challenge_id', 'rank'],
      name: 'idx_challenge_leaderboard'
    },
    {
      fields: ['challenge_id', 'current_value'],
      name: 'idx_challenge_progress'
    }
  ]
});

export default UserChallengeParticipation;
