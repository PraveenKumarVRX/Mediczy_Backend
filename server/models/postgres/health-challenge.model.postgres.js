import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const HealthChallenge = sequelize.define('HealthChallenge', {
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
      'FITNESS', 'NUTRITION', 'WEIGHT', 'MENTAL_HEALTH', 'SLEEP', 
      'HYDRATION', 'STEPS', 'EXERCISE', 'MEDITATION', 'SCREENING', 
      'MEDICATION', 'QUIT_SMOKING', 'CUSTOM'
    ),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('OPEN', 'PRIVATE', 'CORPORATE', 'FRIENDS'),
    allowNull: false,
    defaultValue: 'OPEN',
    comment: 'Open to all, private invite-only, corporate team, or friends group'
  },
  goalType: {
    type: DataTypes.ENUM('INDIVIDUAL', 'TEAM', 'CUMULATIVE'),
    allowNull: false,
    defaultValue: 'INDIVIDUAL',
    comment: 'Individual leaderboard, team competition, or cumulative group goal'
  },
  targetType: {
    type: DataTypes.ENUM('COUNT', 'DURATION', 'DISTANCE', 'WEIGHT', 'BOOLEAN', 'PERCENTAGE'),
    allowNull: false
  },
  targetValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  targetUnit: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100
  },
  bonusPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Extra points for top performers'
  },
  difficulty: {
    type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD', 'EXPERT'),
    allowNull: false,
    defaultValue: 'MEDIUM'
  },
  maxParticipants: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Max participants, null = unlimited'
  },
  minParticipants: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2
  },
  status: {
    type: DataTypes.ENUM('UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'UPCOMING'
  },
  isRecurring: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  recurringPattern: {
    type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'),
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to corporate entity if corporate challenge'
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  badgeIcon: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  entryFee: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Health coins required to join'
  },
  prizePool: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total prize pool in health coins'
  },
  prizeDistribution: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Prize distribution for winners, e.g., {1: 50%, 2: 30%, 3: 20%}'
  },
  rules: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Custom rules and conditions'
  },
  leaderboardConfig: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      updateFrequency: 'REAL_TIME',
      showTop: 10,
      showUserRank: true
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'health_challenges',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['start_date'] },
    { fields: ['end_date'] },
    { fields: ['created_by'] },
    { fields: ['corporate_id'] },
    {
      fields: ['status', 'start_date'],
      name: 'idx_active_challenges'
    }
  ]
});

export default HealthChallenge;
