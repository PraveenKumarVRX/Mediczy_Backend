/**
 * Email Configuration and Template Models (PostgreSQL/Sequelize)
 * Replaces in-memory storage with database persistence
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const sequelize = postgresSequelize;

// Email Configuration Model
export const EmailConfig = sequelize.define('EmailConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  host: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  port: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 587
  },
  secure: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  username: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  password: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  fromEmail: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  fromName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  replyTo: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  provider: {
    type: DataTypes.STRING(100),
    defaultValue: 'Custom SMTP'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastTested: {
    type: DataTypes.DATE,
    allowNull: true
  },
  testResult: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  rateLimits: {
    type: DataTypes.JSONB,
    defaultValue: {
      perHour: 100,
      perDay: 1000,
      perMonth: 30000
    }
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  retryDelay: {
    type: DataTypes.INTEGER,
    defaultValue: 5000
  },
  createdBy: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'email_configs',
  timestamps: true,
  indexes: [
    { fields: ['isActive'] },
    { fields: ['isDefault'] },
    { fields: ['provider'] }
  ]
});

// Email Template Model
export const EmailTemplate = sequelize.define('EmailTemplate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  category: {
    type: DataTypes.ENUM('notification', 'welcome', 'reminder', 'billing', 'system', 'marketing'),
    allowNull: false,
    defaultValue: 'notification'
  },
  subject: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  htmlContent: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  textContent: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  variables: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  createdBy: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'email_templates',
  timestamps: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['isActive'] }
  ]
});

// Email Log Model
export const EmailLog = sequelize.define('EmailLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  configId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'email_configs',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  templateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'email_templates',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  to: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  from: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  subject: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal'
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  openedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  clickedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'email_logs',
  timestamps: true,
  indexes: [
    { fields: ['status'] },
    { fields: ['to'] },
    { fields: ['sentAt'] },
    { fields: ['configId'] },
    { fields: ['templateId'] }
  ]
});

// Define relationships
EmailLog.belongsTo(EmailConfig, { foreignKey: 'configId', as: 'config' });
EmailLog.belongsTo(EmailTemplate, { foreignKey: 'templateId', as: 'template' });
EmailConfig.hasMany(EmailLog, { foreignKey: 'configId', as: 'logs' });
EmailTemplate.hasMany(EmailLog, { foreignKey: 'templateId', as: 'logs' });

export default { EmailConfig, EmailTemplate, EmailLog };
