import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const UserGoalProgress = sequelize.define('UserGoalProgress', {
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
  goalId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'health_goals',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  status: {
    type: DataTypes.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED'),
    allowNull: false,
    defaultValue: 'NOT_STARTED'
  },
  currentValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Current progress value'
  },
  targetValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Target value to achieve (copied from goal)'
  },
  progressPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Percentage complete (0-100)'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Calculated based on goal duration'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pointsEarned: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  streak: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Consecutive days of progress'
  },
  lastActivityDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  checkIns: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of daily check-ins with timestamps and values'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isShared: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Share progress with friends/group'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'user_goal_progress',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['goal_id'] },
    { fields: ['status'] },
    { fields: ['start_date'] },
    { fields: ['end_date'] },
    {
      fields: ['user_id', 'goal_id'],
      unique: false,
      name: 'idx_user_goal'
    },
    {
      fields: ['user_id', 'status'],
      name: 'idx_user_status'
    }
  ]
});

export default UserGoalProgress;
