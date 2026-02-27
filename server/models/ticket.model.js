import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

// MongoDB-compatible Ticket model for PostgreSQL
// Matches the structure expected by tickets.route.js
const TicketSchema = sequelize.define('tickets', {
  _id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  ticketId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true,
    field: 'ticketNumber'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'subject'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(100),
    defaultValue: 'general'
  },
  priority: {
    type: DataTypes.STRING(50),
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'open'
  },
  requester: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Customer info: {name, email, phone, userId}'
  },
  assignee: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Agent info: {userId, name, email, assignedAt}',
    get() {
      const rawValue = this.getDataValue('assignee');
      // Map from assignedTo integer to assignee object if needed
      if (!rawValue && this.getDataValue('assignedTo')) {
        return { userId: this.getDataValue('assignedTo') };
      }
      return rawValue;
    }
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'assignedTo'
  },
  messages: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of message objects'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: []
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolvedAt'
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'closedAt'
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  escalation: {
    type: DataTypes.JSONB,
    defaultValue: { level: 0 },
    comment: 'Escalation details: {level, reason, escalatedAt, escalatedTo}'
  },
  satisfaction: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Customer satisfaction: {rating, feedback, submittedAt}'
  },
  analytics: {
    type: DataTypes.JSONB,
    defaultValue: { viewCount: 0, responseTime: null, resolutionTime: null },
    comment: 'Analytics data'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional metadata'
  },
  attachments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'File attachments'
  }
}, {
  tableName: 'tickets',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  underscored: false // Use camelCase to match existing table
});

// MongoDB-style wrapper class
// Chainable query builder — makes Ticket.find().sort().skip().limit().lean() work
class TicketQuery {
  constructor(TicketModelSchema, where) {
    this._schema = TicketModelSchema;
    this._where = where;
    this._order = [['createdAt', 'DESC']];
    this._offset = 0;
    this._limit = null;
  }

  sort(sortObj) {
    if (sortObj && typeof sortObj === 'object') {
      this._order = Object.entries(sortObj).map(([field, dir]) => [field, dir === -1 ? 'DESC' : 'ASC']);
    }
    return this;
  }

  limit(num) {
    if (num != null) this._limit = parseInt(num);
    return this;
  }

  skip(num) {
    if (num != null) this._offset = parseInt(num);
    return this;
  }

  lean() {
    // already returns plain objects via raw: true
    return this;
  }

  // Makes it thenable — await TicketQuery instance works
  then(resolve, reject) {
    const opts = { where: this._where, order: this._order, raw: true };
    if (this._limit != null) opts.limit = this._limit;
    if (this._offset) opts.offset = this._offset;
    return this._schema.findAll(opts).then(resolve, reject);
  }

  catch(reject) {
    return this.then(null, reject);
  }

  finally(fn) {
    return this.then(fn, fn);
  }
}

class Ticket {
  constructor(data) {
    Object.assign(this, data);
  }

  // MongoDB-compatible find method — returns chainable TicketQuery
  static find(filter = {}) {
    const where = this._buildWhereClause(filter);
    return new TicketQuery(TicketSchema, where);
  }

  // MongoDB-compatible findOne method
  static async findOne(filter = {}) {
    const where = this._buildWhereClause(filter);
    const ticket = await TicketSchema.findOne({ where, raw: false });
    return ticket ? this._wrapInstance(ticket) : null;
  }

  // MongoDB-compatible findOneAndDelete
  static async findOneAndDelete(filter = {}) {
    const where = this._buildWhereClause(filter);
    const ticket = await TicketSchema.findOne({ where });
    if (ticket) {
      await ticket.destroy();
      return this._wrapInstance(ticket);
    }
    return null;
  }

  // MongoDB-compatible create method
  static async create(data) {
    if (!data.ticketId) {
      const d = new Date();
      const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(1000 + Math.random() * 9000);
      data.ticketId = `TKT-${dateStr}-${rand}`;
    }
    const ticket = await TicketSchema.create(data);
    return this._wrapInstance(ticket);
  }

  // MongoDB-compatible countDocuments
  static async countDocuments(filter = {}) {
    const where = this._buildWhereClause(filter);
    return await TicketSchema.count({ where });
  }

  // Custom method: assignTo
  async assignTo(agent) {
    this.assignee = {
      userId: agent.id || agent._id,
      name: agent.name,
      email: agent.email,
      assignedAt: new Date()
    };
    return this;
  }

  // Custom method: resolve
  async resolve(resolution, userId) {
    this.status = 'resolved';
    this.resolution = resolution;
    this.resolvedAt = new Date();
    return this;
  }

  // Custom method: escalate
  async escalate(reason, escalateTo = null) {
    this.escalation = {
      level: (this.escalation?.level || 0) + 1,
      reason,
      escalatedAt: new Date(),
      escalatedTo: escalateTo ? {
        userId: escalateTo.id || escalateTo._id,
        name: escalateTo.name,
        email: escalateTo.email
      } : null
    };
    this.priority = 'urgent';
    return this;
  }

  // Custom method: addMessage
  async addMessage(messageData) {
    if (!this.messages) this.messages = [];
    const message = {
      id: this.messages.length + 1,
      ...messageData,
      timestamp: new Date()
    };
    this.messages.push(message);
    return this;
  }

  // Save method (Sequelize-compatible)
  async save() {
    if (this.id || this._id) {
      // Update existing
      await TicketSchema.update(this.dataValues || this, {
        where: { id: this.id || this._id }
      });
    } else {
      // Auto-generate ticketId if missing
      if (!this.ticketId) {
        const d = new Date();
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.floor(1000 + Math.random() * 9000);
        this.ticketId = `TKT-${dateStr}-${rand}`;
      }
      // Create new
      const created = await TicketSchema.create(this);
      Object.assign(this, created.dataValues);
    }
    return this;
  }

  // Static method: getStatistics
  static async getStatistics(filter = {}) {
    const where = this._buildWhereClause(filter);
    const tickets = await TicketSchema.findAll({ where, attributes: ['status', 'priority', 'createdAt', 'resolvedAt'] });
    
    const stats = {
      total: tickets.length,
      open: 0,
      inProgress: 0,
      pending: 0,
      resolved: 0,
      closed: 0,
      avgResolutionTime: 0
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    tickets.forEach(t => {
      switch (t.status) {
        case 'open': stats.open++; break;
        case 'in-progress': stats.inProgress++; break;
        case 'pending': stats.pending++; break;
        case 'resolved': stats.resolved++; break;
        case 'closed': stats.closed++; break;
      }

      if (t.resolvedAt && t.createdAt) {
        totalResolutionTime += (new Date(t.resolvedAt) - new Date(t.createdAt));
        resolvedCount++;
      }
    });

    if (resolvedCount > 0) {
      stats.avgResolutionTime = Math.round(totalResolutionTime / resolvedCount / 1000 / 60); // minutes
    }

    return stats;
  }

  // Static method: getCategoryStats
  static async getCategoryStats(filter = {}) {
    const where = this._buildWhereClause(filter);
    const tickets = await TicketSchema.findAll({ 
      where, 
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['category'],
      raw: true
    });

    return tickets.map(t => ({ _id: t.category, count: parseInt(t.count) }));
  }

  // Static method: getPriorityStats
  static async getPriorityStats(filter = {}) {
    const where = this._buildWhereClause(filter);
    const tickets = await TicketSchema.findAll({ 
      where, 
      attributes: [
        'priority',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['priority'],
      raw: true
    });

    return tickets.map(t => ({ _id: t.priority, count: parseInt(t.count) }));
  }

  // MongoDB-compatible aggregate — no-op stub returning empty array (stats route handles gracefully)
  static async aggregate(pipeline = []) {
    // Minimal implementation: handle satisfaction avg pipeline
    try {
      const where = {};
      const match = pipeline.find(s => s.$match)?.$match || {};
      if (match['satisfaction.rating']) {
        const rows = await TicketSchema.findAll({
          where,
          attributes: ['satisfaction'],
          raw: true
        });
        const ratings = rows
          .filter(r => r.satisfaction && r.satisfaction.rating != null)
          .map(r => r.satisfaction.rating);
        if (ratings.length === 0) return [];
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        return [{ _id: null, avgSatisfaction: avg }];
      }
    } catch (_) { /* ignore */ }
    return [];
  }

  // Static method: getAgentPerformance
  static async getAgentPerformance(filter = {}) {
    const where = this._buildWhereClause(filter);
    const tickets = await TicketSchema.findAll({ 
      where,
      attributes: ['assignee', 'status'],
      raw: true
    });

    const agentMap = {};
    tickets.forEach(t => {
      if (t.assignee && t.assignee.userId) {
        const agentId = t.assignee.userId;
        if (!agentMap[agentId]) {
          agentMap[agentId] = { 
            agentId, 
            name: t.assignee.name,
            email: t.assignee.email,
            total: 0, 
            resolved: 0, 
            open: 0 
          };
        }
        agentMap[agentId].total++;
        if (t.status === 'resolved' || t.status === 'closed') {
          agentMap[agentId].resolved++;
        } else {
          agentMap[agentId].open++;
        }
      }
    });

    return Object.values(agentMap);
  }

  // Helper: Build Sequelize WHERE clause from MongoDB-style filter
  static _buildWhereClause(filter) {
    const where = {};

    Object.keys(filter).forEach(key => {
      if (key === '$or') {
        // Handle MongoDB $or operator
        where[Op.or] = filter[key].map(condition => this._buildWhereClause(condition));
      } else if (typeof filter[key] === 'object' && filter[key] !== null) {
        // Handle MongoDB operators
        const operators = filter[key];
        if (operators.$regex) {
          where[key] = { [Op.iLike]: `%${operators.$regex}%` };
        } else if (operators.$gte) {
          where[key] = { [Op.gte]: operators.$gte };
        } else if (operators.$lte) {
          where[key] = { [Op.lte]: operators.$lte };
        } else if (operators.$in) {
          where[key] = { [Op.in]: operators.$in };
        } else if (key.includes('.')) {
          // Handle JSONB path queries (e.g., 'assignee.email')
          const [jsonField, jsonKey] = key.split('.');
          where[jsonField] = sequelize.where(
            sequelize.cast(sequelize.json(`${jsonField}.${jsonKey}`), 'text'),
            { [Op.iLike]: `%${filter[key]}%` }
          );
        } else {
          where[key] = filter[key];
        }
      } else {
        where[key] = filter[key];
      }
    });

    return where;
  }

  // Helper: Wrap Sequelize instance with MongoDB-like methods
  static _wrapInstance(instance) {
    if (!instance) return null;
    
    const wrapped = new Ticket(instance.dataValues || instance);
    wrapped._instance = instance;
    
    // Override save to use Sequelize instance
    wrapped.save = async function() {
      if (this._instance && typeof this._instance.save === 'function') {
        Object.assign(this._instance, this);
        await this._instance.save();
        Object.assign(this, this._instance.dataValues);
      } else {
        await TicketSchema.update(this, { where: { id: this.id || this._id } });
      }
      return this;
    };

    return wrapped;
  }

  // Sequelize sort() equivalent
  sort(sortObj) {
    // This is handled in the route's query builder
    return this;
  }

  // Sequelize limit() equivalent
  limit(num) {
    // This is handled in the route's query builder
    return this;
  }

  // Sequelize skip() equivalent  
  skip(num) {
    // This is handled in the route's query builder
    return this;
  }

  // Sequelize lean() equivalent
  lean() {
    // Already returns plain objects
    return this;
  }
}

// Initialize table
TicketSchema.sync({ alter: false }).catch(err => {
  console.error('Error syncing tickets table:', err.message);
});

export default Ticket;
