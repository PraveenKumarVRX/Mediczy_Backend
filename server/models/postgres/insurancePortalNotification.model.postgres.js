import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsurancePortalNotification = sequelize.define('InsurancePortalNotification', {
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
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  priority: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'low',
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_read',
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at',
  },
  occurredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'occurred_at',
  },
  actionRoute: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'action_route',
  },
  relatedThreadId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_thread_id',
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'insurance_portal_notifications',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['hospital_id'] },
    { fields: ['organization_id'] },
    { fields: ['type'] },
    { fields: ['priority'] },
    { fields: ['is_read'] },
    { fields: ['occurred_at'] },
  ],
});

export default InsurancePortalNotification;