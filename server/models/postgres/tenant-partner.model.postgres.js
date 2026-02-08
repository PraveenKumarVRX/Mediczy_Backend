import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const TenantPartner = sequelize.define('TenantPartner', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  corporate_tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Corporate tenant ID'
  },
  partner_tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Partner clinic tenant ID'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Partner relationship metadata'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'tenant_partners',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['corporate_tenant_id', 'partner_tenant_id'],
      name: 'unique_corporate_partner'
    },
    {
      fields: ['corporate_tenant_id']
    },
    {
      fields: ['partner_tenant_id']
    },
    {
      fields: ['status']
    }
  ]
});

export default TenantPartner;
export { TenantPartner };
