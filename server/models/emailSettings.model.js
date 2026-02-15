import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

/**
 * Email Settings Model - Stores SMTP configurations for team members
 * Links users to their email accounts with SMTP/IMAP settings
 */
const EmailSettings = postgresSequelize.define('EmailSettings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: false,
    comment: 'Team member/user who owns these settings'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Email address for this configuration'
  },
  displayName: {
    type: DataTypes.STRING,
    comment: 'Display name for email replies'
  },
  
  // SMTP Configuration (for sending emails)
  smtpHost: {
    type: DataTypes.STRING,
    comment: 'SMTP server host'
  },
  smtpPort: {
    type: DataTypes.INTEGER,
    defaultValue: 587,
    comment: 'SMTP server port'
  },
  smtpSecure: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Use secure connection (TLS/SSL) for SMTP'
  },
  smtpUsername: {
    type: DataTypes.STRING,
    comment: 'SMTP authentication username'
  },
  smtpPassword: {
    type: DataTypes.STRING,
    comment: 'SMTP authentication password (encrypted in production)'
  },
  
  // IMAP Configuration (for receiving emails)
  imapHost: {
    type: DataTypes.STRING,
    comment: 'IMAP server host'
  },
  imapPort: {
    type: DataTypes.INTEGER,
    defaultValue: 993,
    comment: 'IMAP server port'
  },
  imapSecure: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Use secure connection (TLS/SSL) for IMAP'
  },
  imapUsername: {
    type: DataTypes.STRING,
    comment: 'IMAP authentication username'
  },
  imapPassword: {
    type: DataTypes.STRING,
    comment: 'IMAP authentication password (encrypted in production)'
  },
  
  // Email Provider Configuration
  provider: {
    type: DataTypes.ENUM('gmail', 'outlook', 'zoho', 'custom'),
    defaultValue: 'custom',
    comment: 'Email service provider'
  },
  
  // Configuration Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this email configuration is active'
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this is the default email for this user'
  },
  
  // Configuration Testing
  lastTestedAt: {
    type: DataTypes.DATE,
    comment: 'Last time SMTP/IMAP connection was tested'
  },
  testResult: {
    type: DataTypes.STRING,
    comment: 'Result of last connection test (success, failed, etc.)'
  },
  testDetails: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Detailed test results with error messages if any'
  },
  
  // Rate Limiting & Usage
  rateLimitPerHour: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    comment: 'Maximum emails to send per hour'
  },
  rateLimitPerDay: {
    type: DataTypes.INTEGER,
    defaultValue: 1000,
    comment: 'Maximum emails to send per day'
  },
  emailsSentToday: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Count of emails sent today'
  },
  emailsSentThisHour: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Count of emails sent this hour'
  },
  
  // Sync Configuration
  syncEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Enable automatic email sync'
  },
  syncFrequencyMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 15,
    comment: 'Frequency of automatic sync in minutes'
  },
  lastSyncAt: {
    type: DataTypes.DATE,
    comment: 'Last time emails were synced'
  },
  lastSyncStatus: {
    type: DataTypes.STRING,
    comment: 'Status of last sync (success, failed, pending)'
  },
  
  // Additional Settings
  autoReplyEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Enable auto-reply for this email'
  },
  autoReplyMessage: {
    type: DataTypes.TEXT,
    comment: 'Auto-reply message template'
  },
  
  // Metadata
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  deletedAt: {
    type: DataTypes.DATE,
    comment: 'Soft delete timestamp'
  }
}, {
  tableName: 'email_settings',
  timestamps: true,
  underscored: true,
  paranoid: true,
  indexes: [
    {
      fields: ['userId', 'email']
    },
    {
      fields: ['userId', 'isDefault']
    },
    {
      fields: ['email'],
      unique: false
    },
    {
      fields: ['isActive']
    }
  ]
});

export default EmailSettings;
