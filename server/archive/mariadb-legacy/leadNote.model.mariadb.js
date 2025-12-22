import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

export const LeadNote = sequelize.define('LeadNote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  leadId: { type: DataTypes.INTEGER, allowNull: false },
  authorId: { type: DataTypes.INTEGER, allowNull: true },
  content: { type: DataTypes.TEXT, allowNull: false },
  pinned: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'crm_lead_notes',
  timestamps: true,
  indexes: [ { fields: ['leadId'] } ]
});

export default LeadNote;
