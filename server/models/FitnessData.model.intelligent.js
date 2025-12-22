import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

// Define FitnessData model for PostgreSQL
// Note: Using camelCase field names to match existing table structure
const FitnessDataModel = sequelize.define('FitnessData', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  dataType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING(50),
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
  recordedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  distance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  calories: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  steps: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  heartRateAvg: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  heartRateMax: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  heartRateMin: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'fitness_data',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Wrapper for backward compatibility
const FitnessData = {
  findOne: async (options) => FitnessDataModel.findOne(options),
  findByPk: async (id, options = {}) => FitnessDataModel.findByPk(id, options),
  findAll: async (options = {}) => FitnessDataModel.findAll(options),
  find: async (filter = {}, options = {}) => FitnessDataModel.findAll({ where: filter, ...options }),
  create: async (data) => FitnessDataModel.create(data),
  update: async (values, options) => FitnessDataModel.update(values, options),
  updateOne: async (filter, update, options = {}) => {
    const record = await FitnessDataModel.findOne({ where: filter });
    if (record) {
      return record.update(update);
    }
    return null;
  },
  bulkWrite: async (operations) => {
    // Simplified bulk write - handles creates and updates
    const results = [];
    for (const op of operations) {
      if (op.insertOne) {
        results.push(await FitnessDataModel.create(op.insertOne.document));
      } else if (op.updateOne) {
        const [count] = await FitnessDataModel.update(op.updateOne.update.$set || op.updateOne.update, { where: op.updateOne.filter });
        results.push({ modifiedCount: count });
      }
    }
    return results;
  },
  destroy: async (options) => FitnessDataModel.destroy(options),
  deleteOne: async (filter) => FitnessDataModel.destroy({ where: filter, limit: 1 }),
  count: async (options = {}) => FitnessDataModel.count(options),
  countDocuments: async (filter = {}) => FitnessDataModel.count({ where: filter }),
  aggregate: async (pipeline) => {
    // Basic aggregation support - returns raw query results
    console.warn('FitnessData.aggregate: Complex aggregations should use raw queries');
    return [];
  },

  // Utility methods for fitness data
  getWeeklyStats: async (userId, startDate, endDate) => {
    const data = await FitnessDataModel.findAll({
      where: {
        userId,
        recordedAt: { [Op.between]: [startDate, endDate] }
      }
    });
    
    const stats = {
      totalSteps: 0, totalCalories: 0, totalDistance: 0
    };
    
    data.forEach(record => {
      if (record.steps) stats.totalSteps += record.steps;
      if (record.calories) stats.totalCalories += record.calories;
      if (record.distance) stats.totalDistance += parseFloat(record.distance);
    });
    
    const days = data.length || 1;
    return {
      ...stats,
      averageSteps: Math.round(stats.totalSteps / days),
      averageCalories: Math.round(stats.totalCalories / days),
      averageDistance: (stats.totalDistance / days).toFixed(1)
    };
  },

  getMonthlyStats: async (userId, year, month) => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return FitnessData.getWeeklyStats(userId, startDate, endDate);
  },

  getUserLatestData: async (userId) => {
    return FitnessDataModel.findOne({ 
      where: { userId },
      order: [['recordedAt', 'DESC']]
    });
  }
};

export { FitnessDataModel };
export default FitnessData;