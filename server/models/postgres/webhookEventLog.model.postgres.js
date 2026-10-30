import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const WebhookEventLog = sequelize.define('WebhookEventLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  eventId: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    field: 'event_id',
    comment: 'Idempotency key — once recorded, duplicate deliveries are rejected'
  },
  source: {
    type: DataTypes.STRING(80),
    allowNull: false,
    field: 'source',
    comment: 'Webhook source: tpa, insurer, nhcx, razorpay, etc.'
  },
  provider: {
    type: DataTypes.STRING(80),
    allowNull: false,
    field: 'provider',
    comment: 'Specific provider: heritage, mdindia, starhealth, nhcx, etc.'
  },
  eventType: {
    type: DataTypes.STRING(80),
    allowNull: false,
    field: 'event_type',
    comment: 'Event type: claim.status, preauth.decision, remittance, payment, etc.'
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'organization_id'
  },
  claimNumber: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'claim_number',
    comment: 'Linked insurance claim number, if any'
  },
  payload: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'payload'
  },
  headers: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'headers'
  },
  hmacSignature: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'hmac_signature'
  },
  hmacVerified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'hmac_verified'
  },
  processed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'processed'
  },
  processingStatus: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'pending',
    field: 'processing_status',
    validate: {
      isIn: [['pending', 'processed', 'failed', 'duplicate']]
    }
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message'
  },
  retryCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'retry_count'
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    field: 'max_retries'
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'processed_at'
  }
}, {
  tableName: 'webhook_event_log',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['event_id'], unique: true },
    { fields: ['source', 'provider'] },
    { fields: ['organization_id', 'processing_status'] },
    { fields: ['claim_number'] },
    { fields: ['received_at'] },
    { fields: ['processing_status'] }
  ]
});

export default WebhookEventLog;