/**
 * WhatsApp Template Model
 * Persists WhatsApp message templates to PostgreSQL
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const WhatsAppTemplate = sequelize.define('WhatsAppTemplate', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },

  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },

  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },

  category: {
    type: DataTypes.ENUM('UTILITY', 'MARKETING', 'AUTHENTICATION'),
    allowNull: false,
    defaultValue: 'UTILITY'
  },

  language: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'en_US'
  },

  header: {
    type: DataTypes.STRING(255),
    defaultValue: ''
  },

  body: {
    type: DataTypes.TEXT,
    allowNull: false
  },

  footer: {
    type: DataTypes.STRING(255),
    defaultValue: ''
  },

  lastUsed: {
    type: DataTypes.DATE
  },

  usageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'whatsapp_templates',
  timestamps: true,
  indexes: [
    { fields: ['status'] },
    { fields: ['category'] },
    { fields: ['name'] }
  ]
});

export default WhatsAppTemplate;
