import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes, Op } from 'sequelize';

// Define Lead model for PostgreSQL
// Note: Using camelCase field names to match existing table structure
const LeadModel = sequelize.define('Lead', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  source: {
    type: DataTypes.STRING(50),
    defaultValue: 'website'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'new'
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  lastContactAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  nextFollowUpAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'crm_leads',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Define LeadActivity model
const LeadActivityModel = sequelize.define('LeadActivity', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  activityType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  performedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  outcome: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'crm_lead_activities',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Define LeadNote model
const LeadNoteModel = sequelize.define('LeadNote', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'crm_lead_notes',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Define LeadTask model
const LeadTaskModel = sequelize.define('LeadTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  taskType: {
    type: DataTypes.STRING(50),
    defaultValue: 'other'
  },
  priority: {
    type: DataTypes.STRING(20),
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'crm_lead_tasks',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Define Corporate model (use existing corporates table)
const CorporateModel = sequelize.define('Corporate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  industry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  employeeCount: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  contactPerson: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  contactEmail: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  contactPhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'prospect'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'corporates',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// Helper function to create wrapper
const createWrapper = (Model) => ({
  findOne: async (options) => Model.findOne(options),
  findByPk: async (id, options = {}) => Model.findByPk(id, options),
  findAll: async (options = {}) => Model.findAll(options),
  create: async (data) => Model.create(data),
  update: async (values, options) => Model.update(values, options),
  destroy: async (options) => Model.destroy(options),
  count: async (options = {}) => Model.count(options)
});

// Create wrappers
const Lead = {
  ...createWrapper(LeadModel),
  
  // Additional Lead methods
  getStatsByStatus: async () => {
    const statuses = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];
    const results = await Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await LeadModel.count({ where: { status } })
      }))
    );
    return results;
  },
  
  getUpcomingFollowUps: async (userId = null) => {
    const where = {
      nextFollowUpAt: {
        [Op.gte]: new Date(),
        [Op.lte]: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
      }
    };
    if (userId) where.assignedTo = userId;
    return LeadModel.findAll({ where, order: [['nextFollowUpAt', 'ASC']] });
  }
};

const LeadActivity = createWrapper(LeadActivityModel);
const LeadNote = createWrapper(LeadNoteModel);
const LeadTask = {
  ...createWrapper(LeadTaskModel),
  
  getPendingTasks: async (userId = null) => {
    const where = { status: { [Op.in]: ['pending', 'in_progress'] } };
    if (userId) where.assignedTo = userId;
    return LeadTaskModel.findAll({ where, order: [['dueDate', 'ASC']] });
  },
  
  getOverdueTasks: async () => {
    return LeadTaskModel.findAll({
      where: {
        status: { [Op.in]: ['pending', 'in_progress'] },
        dueDate: { [Op.lt]: new Date() }
      }
    });
  }
};

const Corporate = createWrapper(CorporateModel);

export { Lead, LeadActivity, LeadNote, LeadTask, Corporate };
export { LeadModel, LeadActivityModel, LeadNoteModel, LeadTaskModel, CorporateModel };
export default Lead;