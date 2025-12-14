import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

export const LeadTask = sequelize.define('LeadTask', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  leadId: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  dueDate: { type: DataTypes.DATE },
  completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  completedAt: { type: DataTypes.DATE },
  priority: { type: DataTypes.ENUM('Low','Medium','High'), defaultValue: 'Medium' },
  assignedTo: { type: DataTypes.INTEGER, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'crm_lead_tasks',
  timestamps: true,
  indexes: [ { fields: ['leadId'] }, { fields: ['assignedTo'] } ]
});

export default LeadTask;
