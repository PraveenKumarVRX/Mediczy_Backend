import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define VitalsRecord model for PostgreSQL
// Note: Using camelCase field names to match existing table structure
const VitalsRecord = sequelize.define('VitalsRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  recordedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  recordedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  bloodPressureSystolic: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  bloodPressureDiastolic: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  heartRate: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  temperature: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true
  },
  respiratoryRate: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  oxygenSaturation: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  height: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  bmi: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true
  },
  bloodSugar: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  source: {
    type: DataTypes.STRING(50),
    defaultValue: 'manual'
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'vitals_records',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Wrapper for backward compatibility
const vitalsRecordModel = {
  findOne: async (options) => VitalsRecord.findOne(options),
  findByPk: async (id, options = {}) => VitalsRecord.findByPk(id, options),
  findAll: async (options = {}) => VitalsRecord.findAll(options),
  create: async (data) => VitalsRecord.create(data),
  update: async (values, options) => VitalsRecord.update(values, options),
  destroy: async (options) => VitalsRecord.destroy(options),
  count: async (options = {}) => VitalsRecord.count(options),
  
  // Helper methods
  getLatestForUser: async (userId) => {
    return VitalsRecord.findOne({
      where: { userId },
      order: [['recordedAt', 'DESC']]
    });
  },
  
  getHistoryForUser: async (userId, startDate, endDate, limit = 100) => {
    const { Op } = require('sequelize');
    const where = { userId };
    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) where.recordedAt[Op.gte] = startDate;
      if (endDate) where.recordedAt[Op.lte] = endDate;
    }
    return VitalsRecord.findAll({
      where,
      order: [['recordedAt', 'DESC']],
      limit
    });
  }
};

export { VitalsRecord };
export default vitalsRecordModel;
