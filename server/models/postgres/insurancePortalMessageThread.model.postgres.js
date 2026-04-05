import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsurancePortalMessageThread = sequelize.define('InsurancePortalMessageThread', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  hospitalId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'hospital_id',
  },
  organizationId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'organization_id',
  },
  claimNo: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'claim_no',
  },
  patientName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'patient_name',
  },
  insurer: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  tpa: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  subject: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  lastMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'last_message',
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_message_at',
  },
  unreadCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'unread_count',
  },
  priority: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'normal',
  },
  status: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'pending',
  },
  messages: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'created_by',
  },
  lastUpdatedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'last_updated_by',
  },
}, {
  tableName: 'insurance_portal_message_threads',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['hospital_id'] },
    { fields: ['organization_id'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { fields: ['last_message_at'] },
  ],
});

export default InsurancePortalMessageThread;