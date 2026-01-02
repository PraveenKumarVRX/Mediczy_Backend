import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

// Define HealthData model for PostgreSQL
const HealthDataModel = sequelize.define('HealthData', {
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
  dataType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'data_type'
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
    allowNull: true,
    field: 'device_id'
  },
  recordedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'recorded_at',
    defaultValue: DataTypes.NOW
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'health_data',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['data_type'] },
    { fields: ['device_id'] },
    { fields: ['recorded_at'] },
    { fields: ['user_id', 'data_type'] },
    { fields: ['user_id', 'recorded_at'] }
  ]
});

// Wrapper for backward compatibility with MongoDB-style operations
const HealthData = {
  // Basic CRUD operations
  findOne: async (options) => HealthDataModel.findOne(options),
  findByPk: async (id, options = {}) => HealthDataModel.findByPk(id, options),
  findAll: async (options = {}) => {
    // Convert MongoDB-style where clause
    if (options.where) {
      options.where = convertWhereClause(options.where);
    }
    return HealthDataModel.findAll(options);
  },
  find: async (filter = {}, options = {}) => {
    const where = convertWhereClause(filter);
    return HealthDataModel.findAll({ where, ...options });
  },
  create: async (data) => HealthDataModel.create(data),
  update: async (values, options) => HealthDataModel.update(values, options),
  destroy: async (options) => HealthDataModel.destroy(options),
  count: async (options = {}) => HealthDataModel.count(options),

  // Aggregation methods
  getLatestByType: async (userId, dataType) => {
    return HealthDataModel.findOne({
      where: { userId, dataType },
      order: [['recordedAt', 'DESC']]
    });
  },

  getLatestByUser: async (userId) => {
    return HealthDataModel.findOne({
      where: { userId },
      order: [['recordedAt', 'DESC']]
    });
  },

  getReadingsByDateRange: async (userId, dataType, startDate, endDate) => {
    return HealthDataModel.findAll({
      where: {
        userId,
        dataType,
        recordedAt: { [Op.between]: [startDate, endDate] }
      },
      order: [['recordedAt', 'ASC']]
    });
  },

  getAverageByType: async (userId, dataType, startDate, endDate) => {
    const result = await HealthDataModel.findOne({
      where: {
        userId,
        dataType,
        recordedAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('value')), 'avg'],
        [sequelize.fn('MIN', sequelize.col('value')), 'min'],
        [sequelize.fn('MAX', sequelize.col('value')), 'max'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      raw: true
    });
    return result;
  },

  getDailySummary: async (userId, date) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const readings = await HealthDataModel.findAll({
      where: {
        userId,
        recordedAt: { [Op.between]: [startOfDay, endOfDay] }
      },
      attributes: [
        'dataType',
        [sequelize.fn('AVG', sequelize.col('value')), 'avg'],
        [sequelize.fn('MIN', sequelize.col('value')), 'min'],
        [sequelize.fn('MAX', sequelize.col('value')), 'max'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('value')), 'sum']
      ],
      group: ['dataType'],
      raw: true
    });

    return readings.reduce((acc, r) => {
      acc[r.dataType] = {
        avg: parseFloat(r.avg) || 0,
        min: parseFloat(r.min) || 0,
        max: parseFloat(r.max) || 0,
        count: parseInt(r.count) || 0,
        sum: parseFloat(r.sum) || 0
      };
      return acc;
    }, {});
  },

  getDevicesByUser: async (userId) => {
    const devices = await HealthDataModel.findAll({
      where: { userId },
      attributes: [
        'deviceId',
        'source',
        [sequelize.fn('MAX', sequelize.col('recorded_at')), 'lastSync'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'readingCount']
      ],
      group: ['deviceId', 'source'],
      raw: true
    });
    return devices;
  }
};

// Helper function to convert MongoDB-style where clauses to Sequelize
function convertWhereClause(where) {
  const converted = {};
  
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Handle MongoDB operators
      if ('$gte' in value || '$lte' in value || '$gt' in value || '$lt' in value) {
        const ops = {};
        if (value.$gte) ops[Op.gte] = value.$gte;
        if (value.$lte) ops[Op.lte] = value.$lte;
        if (value.$gt) ops[Op.gt] = value.$gt;
        if (value.$lt) ops[Op.lt] = value.$lt;
        converted[key] = ops;
      } else if ('$in' in value) {
        converted[key] = { [Op.in]: value.$in };
      } else if ('$ne' in value) {
        converted[key] = { [Op.ne]: value.$ne };
      } else if ('$like' in value) {
        converted[key] = { [Op.like]: value.$like };
      } else {
        converted[key] = value;
      }
    } else {
      converted[key] = value;
    }
  }
  
  return converted;
}

// Sync table (create if not exists)
(async () => {
  try {
    await HealthDataModel.sync({ alter: false });
    console.log('✅ HealthData model synced');
  } catch (error) {
    console.warn('⚠️ HealthData model sync warning:', error.message);
  }
})();

export { HealthDataModel };
export default HealthData;
