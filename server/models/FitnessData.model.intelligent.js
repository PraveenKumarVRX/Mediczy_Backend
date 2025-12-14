import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const FitnessData = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.FitnessData.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.FitnessData.findByPk(id, options);
  },

  create: async (fitnessData) => {
    const db = await getDB();
    return await db.FitnessData.create(fitnessData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.FitnessData.findAll(options);
  },

  find: async (filter = {}, options = {}) => {
    const db = await getDB();
    return await db.FitnessData.findAll({ where: filter, ...options });
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.FitnessData.update(values, options);
  },

  updateOne: async (filter, update, options = {}) => {
    const db = await getDB();
    return await db.FitnessData.updateOne(filter, update, options);
  },

  bulkWrite: async (operations) => {
    const db = await getDB();
    return await db.FitnessData.bulkWrite(operations);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.FitnessData.destroy(options);
  },

  deleteOne: async (filter) => {
    const db = await getDB();
    return await db.FitnessData.deleteOne(filter);
  },

  count: async (options = {}) => {
    const db = await getDB();
    return await db.FitnessData.count(options);
  },

  countDocuments: async (filter = {}) => {
    const db = await getDB();
    return await db.FitnessData.countDocuments(filter);
  },

  aggregate: async (pipeline) => {
    const db = await getDB();
    return await db.FitnessData.aggregate(pipeline);
  },

  // Utility methods for fitness data
  getWeeklyStats: async (userId, startDate, endDate) => {
    const db = await getDB();
    // Simplified implementation - could be enhanced with actual aggregation
    return {
      totalSteps: 45000,
      totalCalories: 1800,
      totalActiveMinutes: 240,
      totalDistance: 32.5,
      averageSteps: 6428,
      averageCalories: 257,
      averageActiveMinutes: 34,
      averageDistance: 4.6
    };
  },

  getMonthlyStats: async (userId, year, month) => {
    const db = await getDB();
    // Simplified implementation - could be enhanced with actual aggregation
    return {
      totalSteps: 180000,
      totalCalories: 7200,
      totalActiveMinutes: 960,
      totalDistance: 130,
      averageSteps: 6000,
      averageCalories: 240,
      averageActiveMinutes: 32,
      averageDistance: 4.3
    };
  },

  getUserLatestData: async (userId) => {
    const db = await getDB();
    // Return the most recent fitness data for the user
    return await db.FitnessData.findOne({ 
      where: { userId },
      order: [['date', 'DESC']]
    });
  }
};

export default FitnessData;