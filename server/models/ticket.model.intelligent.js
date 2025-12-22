import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

// Define Ticket model for PostgreSQL
// Note: Using camelCase field names to match existing table structure
const TicketModel = sequelize.define('Ticket', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ticketNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'general'
  },
  priority: {
    type: DataTypes.STRING(20),
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'open'
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'tickets',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeCreate: async (ticket) => {
      if (!ticket.ticketNumber) {
        const date = new Date();
        const prefix = `TKT${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
        const count = await TicketModel.count({
          where: { ticketNumber: { [Op.like]: `${prefix}%` } }
        });
        ticket.ticketNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;
      }
    }
  }
});

// Wrapper for backward compatibility
const Ticket = {
  findOne: async (options) => TicketModel.findOne(options),
  findByPk: async (id, options = {}) => TicketModel.findByPk(id, options),
  findAll: async (options = {}) => TicketModel.findAll(options),
  find: async (filter = {}, options = {}) => TicketModel.findAll({ where: filter, ...options }),
  create: async (data) => TicketModel.create(data),
  update: async (values, options) => TicketModel.update(values, options),
  updateOne: async (filter, update, options = {}) => {
    const record = await TicketModel.findOne({ where: filter });
    if (record) {
      return record.update(update);
    }
    return null;
  },
  findOneAndUpdate: async (filter, update, options = {}) => {
    const record = await TicketModel.findOne({ where: filter });
    if (record) {
      await record.update(update.$set || update);
      return record;
    }
    return null;
  },
  destroy: async (options) => TicketModel.destroy(options),
  deleteOne: async (filter) => TicketModel.destroy({ where: filter, limit: 1 }),
  count: async (options = {}) => TicketModel.count(options),
  countDocuments: async (filter = {}) => TicketModel.count({ where: filter }),
  aggregate: async (pipeline) => {
    console.warn('Ticket.aggregate: Complex aggregations should use raw queries');
    return [];
  },

  // Statistics methods
  getStatistics: async (filter = {}) => {
    const where = filter.where || filter;
    const [total, open, inProgress, resolved, closed] = await Promise.all([
      TicketModel.count({ where }),
      TicketModel.count({ where: { ...where, status: 'open' } }),
      TicketModel.count({ where: { ...where, status: 'in_progress' } }),
      TicketModel.count({ where: { ...where, status: 'resolved' } }),
      TicketModel.count({ where: { ...where, status: 'closed' } })
    ]);
    
    // Note: dueDate column doesn't exist in current schema, overdue count is 0
    const overdue = 0;
    
    return { total, open, inProgress, resolved, closed, overdue };
  },

  getCategoryStats: async (filter = {}) => {
    const categories = ['technical', 'billing', 'appointment', 'general', 'feedback', 'complaint'];
    const results = await Promise.all(
      categories.map(async (category) => ({
        category,
        count: await TicketModel.count({ where: { ...filter, category } })
      }))
    );
    return results.filter(r => r.count > 0);
  },

  getPriorityStats: async (filter = {}) => {
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const results = await Promise.all(
      priorities.map(async (priority) => ({
        priority,
        count: await TicketModel.count({ where: { ...filter, priority } })
      }))
    );
    return results.filter(r => r.count > 0);
  },

  getAgentStats: async (filter = {}) => {
    const tickets = await TicketModel.findAll({
      where: { ...filter, assignedTo: { [Op.not]: null } },
      attributes: ['assignedTo', 'status']
    });
    
    const agentMap = {};
    tickets.forEach(t => {
      if (!agentMap[t.assignedTo]) {
        agentMap[t.assignedTo] = { agentId: t.assignedTo, total: 0, resolved: 0, open: 0 };
      }
      agentMap[t.assignedTo].total++;
      if (t.status === 'resolved' || t.status === 'closed') agentMap[t.assignedTo].resolved++;
      else agentMap[t.assignedTo].open++;
    });
    
    return Object.values(agentMap);
  }
};

export { TicketModel };
export default Ticket;