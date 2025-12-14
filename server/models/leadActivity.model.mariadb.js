import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

export const LeadActivity = sequelize.define('LeadActivity', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  leadId: { type: DataTypes.INTEGER, allowNull: false },
  type: { 
    type: DataTypes.ENUM('Call','Email','Meeting','Note','Task','Reminder','Status Change'),
    allowNull: false
  },
  subject: { type: DataTypes.STRING },
  content: { type: DataTypes.TEXT },
  // For tasks / reminders
  dueDate: { type: DataTypes.DATE },
  completedAt: { type: DataTypes.DATE },
  createdBy: { type: DataTypes.INTEGER, allowNull: true }, // user id
  metadata: {
    type: DataTypes.TEXT,
    get() { const raw = this.getDataValue('metadata'); return raw ? JSON.parse(raw) : {}; },
    set(v) { this.setDataValue('metadata', JSON.stringify(v || {})); }
  }
}, {
  tableName: 'crm_lead_activities',
  timestamps: true,
  indexes: [
    { fields: ['leadId'] },
    { fields: ['type'] }
  ]
});

export default LeadActivity;
