import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const BrokerIntegration = sequelize.define('BrokerIntegration', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  brokerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'broker_id'
  },
  integrationName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'integration_name'
  },
  brokerBaseUrl: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'broker_base_url'
  },
  outboundApiKey: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'outbound_api_key'
  },
  webhookSecret: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'webhook_secret'
  },
  allowedIps: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'allowed_ips'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'broker_integrations',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export { BrokerIntegration };
export default BrokerIntegration;
