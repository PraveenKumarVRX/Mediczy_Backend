import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

// Lead model for CRM pipeline
// Stages kept intentionally small; can be extended later and reflected in UI enums
export const Lead = sequelize.define('Lead', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  company: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING },
  source: { type: DataTypes.STRING }, // e.g. Referral, Website, Event, Outbound
  stage: { 
    type: DataTypes.ENUM('New', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'),
    defaultValue: 'New'
  },
  value: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  assignedTo: { type: DataTypes.INTEGER, allowNull: true }, // User ID (internal user / sales rep)
  corporateId: { type: DataTypes.INTEGER, allowNull: true }, // potential link if converted
  // Metadata
  tags: { 
    type: DataTypes.TEXT,
    get() { const raw = this.getDataValue('tags'); return raw ? JSON.parse(raw) : []; },
    set(v) { this.setDataValue('tags', JSON.stringify(v || [])); }
  },
  customFields: {
    type: DataTypes.TEXT,
    get() { const raw = this.getDataValue('customFields'); return raw ? JSON.parse(raw) : {}; },
    set(v) { this.setDataValue('customFields', JSON.stringify(v || {})); }
  },
  notesSnapshot: { type: DataTypes.TEXT }, // optional cached latest note text for quick listing
  lastActivityAt: { type: DataTypes.DATE },
  closedAt: { type: DataTypes.DATE },
  statusReason: { type: DataTypes.STRING },
  isArchived: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'crm_leads',
  timestamps: true,
  indexes: [
    { fields: ['stage'] },
    { fields: ['assignedTo'] },
    { fields: ['corporateId'] }
  ]
});

export default Lead;
