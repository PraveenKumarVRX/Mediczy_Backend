/**
 * Communication Log Model
 * Tracks all communication (email, SMS, WhatsApp) across different user types
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const CommunicationLog = sequelize.define(
  'CommunicationLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('email', 'sms', 'whatsapp'),
      allowNull: false,
      comment: 'Type of communication'
    },
    recipient: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Email address or phone number of recipient'
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Subject line (for emails)'
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Message content'
    },
    status: {
      type: DataTypes.ENUM('sent', 'delivered', 'read', 'failed', 'pending'),
      defaultValue: 'pending',
      comment: 'Delivery status'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User ID who initiated the communication'
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Organization/Tenant ID for multi-tenant support'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional data (message SID, template ID, error details, etc.)'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when message was sent'
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when message was delivered'
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when message was read (WhatsApp only)'
    }
  },
  {
    tableName: 'communication_logs',
    timestamps: true,
    indexes: [
      {
        fields: ['createdBy']
      },
      {
        fields: ['organizationId']
      },
      {
        fields: ['type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['createdAt']
      },
      {
        fields: ['recipient']
      }
    ]
  }
);

export default CommunicationLog;
