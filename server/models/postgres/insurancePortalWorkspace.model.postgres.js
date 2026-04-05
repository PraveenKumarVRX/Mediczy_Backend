import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsurancePortalWorkspace = sequelize.define('InsurancePortalWorkspace', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  hospitalId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'hospital_id',
  },
  organizationId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'organization_id',
  },
  payerManagement: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'payer_management',
  },
  hospitalProfile: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'hospital_profile',
  },
  settings: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  govtSchemes: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'govt_schemes',
  },
  nhcx: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  abdm: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  tariff: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  empanelment: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'insurance_portal_workspaces',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['hospital_id'] },
    { fields: ['organization_id'] },
  ],
});

export default InsurancePortalWorkspace;