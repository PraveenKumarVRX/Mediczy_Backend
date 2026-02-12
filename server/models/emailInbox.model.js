import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

/**
 * Email Inbox Model - Stores received emails
 */
const EmailInbox = postgresSequelize.define('EmailInbox', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  teamMemberId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Team member who owns this inbox'
  },
  messageId: {
    type: DataTypes.STRING,
    unique: true,
    comment: 'IMAP message ID for de-duplication'
  },
  from: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Sender email address'
  },
  fromName: {
    type: DataTypes.STRING,
    comment: 'Sender display name'
  },
  to: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    comment: 'Recipient addresses'
  },
  cc: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    comment: 'CC addresses'
  },
  bcc: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    comment: 'BCC addresses'
  },
  subject: {
    type: DataTypes.STRING,
    comment: 'Email subject'
  },
  body: {
    type: DataTypes.TEXT,
    comment: 'Email body (plain text)'
  },
  htmlBody: {
    type: DataTypes.TEXT,
    comment: 'Email body (HTML)'
  },
  attachments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of attachments with metadata'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isStarred: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  labels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['inbox'],
    comment: 'Email labels/categories'
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal'
  },
  
  // AI Processing Fields
  aiProcessed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether email has been processed by AI'
  },
  aiSummary: {
    type: DataTypes.TEXT,
    comment: 'AI-generated summary of email'
  },
  aiIntent: {
    type: DataTypes.ENUM(
      'appointment_request',
      'patient_query',
      'test_result',
      'prescription',
      'billing',
      'feedback',
      'other'
    ),
    comment: 'AI-detected intent of email'
  },
  aiEntities: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Named entities extracted by AI (patient name, disease, etc.)'
  },
  aiSentiment: {
    type: DataTypes.ENUM('positive', 'neutral', 'negative'),
    comment: 'AI-detected sentiment'
  },
  aiConfidence: {
    type: DataTypes.DECIMAL(3, 2),
    comment: 'AI processing confidence score (0-1)'
  },
  
  // Portal Update Fields
  linkedResourceType: {
    type: DataTypes.STRING,
    comment: 'Type of resource to update (appointment, patient, test, etc.)'
  },
  linkedResourceId: {
    type: DataTypes.STRING,
    comment: 'ID of the linked resource'
  },
  autoUpdatesApplied: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of auto-updates applied based on this email'
  },
  
  // Metadata
  receivedAt: {
    type: DataTypes.DATE,
    comment: 'When email was received'
  },
  hasReplied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether team member has replied'
  },
  threadId: {
    type: DataTypes.STRING,
    comment: 'Email thread ID for conversation grouping'
  },
  inReplyTo: {
    type: DataTypes.STRING,
    comment: 'Message ID this email replies to'
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
  tableName: 'email_inboxes',
  timestamps: true,
  underscored: true
});

export default EmailInbox;
