import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const HealthGoal = sequelize.define('HealthGoal', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.ENUM(
      'FITNESS',
      'NUTRITION',
      'WEIGHT',
      'MENTAL_HEALTH',
      'SLEEP',
      'HYDRATION',
      'STEPS',
      'EXERCISE',
      'MEDITATION',
      'SCREENING',
      'MEDICATION',
      'QUIT_SMOKING',
      'CUSTOM'
    ),
    allowNull: false,
    defaultValue: 'CUSTOM'
  },
  type: {
    type: DataTypes.ENUM('PERSONAL', 'GROUP', 'CORPORATE'),
    allowNull: false,
    defaultValue: 'PERSONAL'
  },
  targetType: {
    type: DataTypes.ENUM('COUNT', 'DURATION', 'DISTANCE', 'WEIGHT', 'BOOLEAN', 'PERCENTAGE'),
    allowNull: false,
    comment: 'Type of measurement for the goal'
  },
  targetValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Target value to achieve'
  },
  targetUnit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Unit of measurement (steps, km, kg, min, etc.)'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30,
    comment: 'Duration in days to complete goal'
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    comment: 'Points awarded on completion'
  },
  difficulty: {
    type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD', 'EXPERT'),
    allowNull: false,
    defaultValue: 'MEDIUM'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'If false, only visible to creator'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'User who created this goal (null for system goals)'
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Corporate entity if corporate goal'
  },
  icon: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  color: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  milestones: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Progress milestones [25%, 50%, 75%, 100%]'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'health_goals',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['type'] },
    { fields: ['is_active'] },
    { fields: ['created_by'] },
    { fields: ['corporate_id'] }
  ]
});

export default HealthGoal;
