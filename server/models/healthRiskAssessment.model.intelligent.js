import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define HealthRiskAssessment model for PostgreSQL
// Note: Using camelCase field names to match existing table structure
const HealthRiskAssessment = sequelize.define('HealthRiskAssessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  assessmentType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  assessmentDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  responses: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  scores: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  riskLevel: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  recommendations: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  followUpDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'health_risk_assessments',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Wrapper for backward compatibility
const healthRiskAssessmentModel = {
  findOne: async (options) => HealthRiskAssessment.findOne(options),
  findByPk: async (id, options = {}) => HealthRiskAssessment.findByPk(id, options),
  findAll: async (options = {}) => HealthRiskAssessment.findAll(options),
  findAndCountAll: async (options = {}) => HealthRiskAssessment.findAndCountAll(options),
  create: async (data) => HealthRiskAssessment.create(data),
  update: async (values, options) => HealthRiskAssessment.update(values, options),
  destroy: async (options) => HealthRiskAssessment.destroy(options),
  count: async (options = {}) => HealthRiskAssessment.count(options),
  
  // Helper methods
  getLatestForUser: async (userId, assessmentType = null) => {
    const where = { userId };
    if (assessmentType) where.assessmentType = assessmentType;
    return HealthRiskAssessment.findOne({
      where,
      order: [['createdAt', 'DESC']]
    });
  },
  
  getUserAssessmentHistory: async (userId) => {
    return HealthRiskAssessment.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
  }
};

export { HealthRiskAssessment };
export default healthRiskAssessmentModel;
