import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

/**
 * UserHealthAssessment Model
 * Field names match the health-assessment route exactly.
 */
const UserHealthAssessment = sequelize.define('UserHealthAssessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },

  // Demographics
  age:    { type: DataTypes.INTEGER,    allowNull: true },
  gender: { type: DataTypes.STRING(20), allowNull: true },

  // Physical measurements
  height: { type: DataTypes.DECIMAL(5,2), allowNull: true },
  weight: { type: DataTypes.DECIMAL(5,2), allowNull: true },
  waist:  { type: DataTypes.DECIMAL(5,2), allowNull: true },
  hip:    { type: DataTypes.DECIMAL(5,2), allowNull: true },
  bmi:    { type: DataTypes.DECIMAL(5,2), allowNull: true },
  whr:    { type: DataTypes.DECIMAL(5,3), allowNull: true },

  // Lifestyle
  smoking:            { type: DataTypes.STRING(50), allowNull: true },
  alcohol:            { type: DataTypes.STRING(50), allowNull: true },
  exercise_frequency: { type: DataTypes.STRING(50), allowNull: true },
  stress_level:       { type: DataTypes.INTEGER,    allowNull: true },
  sleep_hours:        { type: DataTypes.DECIMAL(3,1), allowNull: true },
  diet_quality:       { type: DataTypes.STRING(50), allowNull: true },

  // Medical history
  hypertension:  { type: DataTypes.STRING(10), allowNull: true },
  diabetes:      { type: DataTypes.STRING(10), allowNull: true },
  heart_disease: { type: DataTypes.STRING(10), allowNull: true },
  cholesterol:   { type: DataTypes.STRING(10), allowNull: true },
  mental_health: { type: DataTypes.STRING(50), allowNull: true },

  // Family history
  family_heart_disease: { type: DataTypes.STRING(10), allowNull: true },
  family_diabetes:      { type: DataTypes.STRING(10), allowNull: true },
  family_cancer:        { type: DataTypes.STRING(10), allowNull: true },

  // Risk results
  riskScore:   { type: DataTypes.DECIMAL(5,2), allowNull: true, field: 'risk_score' },
  riskLevel:   { type: DataTypes.STRING(20),   allowNull: true, field: 'risk_level'  },
  riskFactors: { type: DataTypes.JSONB, defaultValue: [], field: 'risk_factors' },

  // Full questionnaire responses
  allResponses: { type: DataTypes.JSONB, defaultValue: {}, field: 'all_responses' },

  // Assessment timestamp (set explicitly by route)
  assessedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'assessed_at' },
}, {
  tableName: 'user_health_assessments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['assessed_at'] },
  ]
});

export default UserHealthAssessment;
