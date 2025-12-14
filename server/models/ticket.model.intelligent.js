import { connectToDb } from '../db/mariadb.js';

let intelligentDB = null;

async function getDB() {
  if (!intelligentDB) {
    intelligentDB = await connectToDb();
  }
  return intelligentDB;
}

const Ticket = {
  findOne: async (options) => {
    const db = await getDB();
    return await db.Ticket.findOne(options);
  },

  findByPk: async (id, options = {}) => {
    const db = await getDB();
    return await db.Ticket.findByPk(id, options);
  },

  create: async (ticketData) => {
    const db = await getDB();
    return await db.Ticket.create(ticketData);
  },

  findAll: async (options = {}) => {
    const db = await getDB();
    return await db.Ticket.findAll(options);
  },

  find: async (filter = {}, options = {}) => {
    const db = await getDB();
    return await db.Ticket.findAll({ where: filter, ...options });
  },

  update: async (values, options) => {
    const db = await getDB();
    return await db.Ticket.update(values, options);
  },

  updateOne: async (filter, update, options = {}) => {
    const db = await getDB();
    return await db.Ticket.findOneAndUpdate(filter, update, options);
  },

  findOneAndUpdate: async (filter, update, options = {}) => {
    const db = await getDB();
    return await db.Ticket.findOneAndUpdate(filter, update, options);
  },

  destroy: async (options) => {
    const db = await getDB();
    return await db.Ticket.destroy(options);
  },

  deleteOne: async (filter) => {
    const db = await getDB();
    return await db.Ticket.destroy({ where: filter });
  },

  count: async (options = {}) => {
    const db = await getDB();
    return await db.Ticket.count(options);
  },

  countDocuments: async (filter = {}) => {
    const db = await getDB();
    return await db.Ticket.countDocuments({ where: filter });
  },

  aggregate: async (pipeline) => {
    const db = await getDB();
    return await db.Ticket.aggregate(pipeline);
  },

  // Static methods for statistics
  getStatistics: async (filter = {}) => {
    // Simplified implementation for now
    return {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      overdue: 0
    };
  },

  getCategoryStats: async (filter = {}) => {
    // Simplified implementation for now
    return [];
  },

  getPriorityStats: async (filter = {}) => {
    // Simplified implementation for now
    return [];
  },

  getAgentStats: async (filter = {}) => {
    // Simplified implementation for now
    return [];
  }
};

export default Ticket;