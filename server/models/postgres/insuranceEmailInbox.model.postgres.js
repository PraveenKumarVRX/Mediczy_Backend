/**
 * InsuranceEmailInbox model
 * Stores IMAP-fetched + AI-parsed emails for the insurance desk portal.
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsuranceEmailInbox = sequelize.define('InsuranceEmailInbox', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

  // Which hospital / insurance desk this belongs to
  hospitalId: { type: DataTypes.STRING(100), allowNull: false, field: 'hospital_id' },

  // Raw email fields
  messageId:  { type: DataTypes.STRING(500), allowNull: true, field: 'message_id' },
  fromEmail:  { type: DataTypes.STRING(255), allowNull: false, field: 'from_email' },
  fromName:   { type: DataTypes.STRING(255), allowNull: true,  field: 'from_name' },
  fromOrg:    { type: DataTypes.STRING(255), allowNull: true,  field: 'from_org' },
  toEmail:    { type: DataTypes.STRING(255), allowNull: true,  field: 'to_email' },
  ccEmail:    { type: DataTypes.STRING(500), allowNull: true,  field: 'cc_email' },
  subject:    { type: DataTypes.TEXT,        allowNull: false },
  bodyText:   { type: DataTypes.TEXT,        allowNull: true,  field: 'body_text' },
  bodyHtml:   { type: DataTypes.TEXT,        allowNull: true,  field: 'body_html' },
  receivedAt: { type: DataTypes.DATE,        allowNull: true,  field: 'received_at' },

  // User actions
  isRead:    { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
  isStarred: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_starred' },
  isArchived:{ type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_archived' },

  // AI-parsed classifications
  aiCategory: {
    type: DataTypes.ENUM(
      'payment_advice', 'pre_auth_approval', 'pre_auth_rejection',
      'pre_auth_query', 'pre_auth_partial', 'claim_repudiation', 'general'
    ),
    allowNull: true,
    field: 'ai_category',
  },
  aiSummary:        { type: DataTypes.TEXT,          allowNull: true,  field: 'ai_summary' },
  aiPriority:       { type: DataTypes.STRING(20),    allowNull: true,  field: 'ai_priority' },
  aiSuggestedAction:{ type: DataTypes.TEXT,          allowNull: true,  field: 'ai_suggested_action' },
  aiConfidence:     { type: DataTypes.FLOAT,         allowNull: true,  field: 'ai_confidence' },

  // Extracted payment fields
  utr:          { type: DataTypes.STRING(60),  allowNull: true },
  paymentAmount:{ type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'payment_amount' },
  paymentDate:  { type: DataTypes.DATEONLY,     allowNull: true, field: 'payment_date' },
  paymentMode:  { type: DataTypes.STRING(20),   allowNull: true, field: 'payment_mode' },

  // Deductions extracted
  nmeAmount:         { type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'nme_amount' },
  tdsAmount:         { type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'tds_amount' },
  discountAmount:    { type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'discount_amount' },
  disallowanceAmount:{ type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'disallowance_amount' },

  // Pre-auth extracted fields
  preAuthStatus:{ type: DataTypes.STRING(30), allowNull: true, field: 'pre_auth_status' },
  approvedAmount:{ type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'approved_amount' },

  // Insurer and claim references
  insurerName:   { type: DataTypes.STRING(200), allowNull: true, field: 'insurer_name' },
  claimNumbers:  { type: DataTypes.JSONB, allowNull: true, field: 'claim_numbers' }, // [ "CLM-2026-0001", ... ]
  tpaReference:  { type: DataTypes.STRING(100), allowNull: true, field: 'tpa_reference' },

  // Status-update tracking
  portalUpdated:  { type: DataTypes.BOOLEAN, defaultValue: false, field: 'portal_updated' },
  portalUpdateLog:{ type: DataTypes.JSONB, allowNull: true, field: 'portal_update_log' },

  // Label for UI
  label: {
    type: DataTypes.ENUM('pre-auth', 'payment', 'query', 'rejection', 'general'),
    defaultValue: 'general',
  },

  attachments: { type: DataTypes.JSONB, allowNull: true }, // [{ filename, contentType, size }]
}, {
  tableName:  'insurance_email_inbox',
  timestamps: true,
  indexes: [
    { fields: ['hospital_id'] },
    { fields: ['ai_category'] },
    { fields: ['utr'] },
    { fields: ['is_read'] },
    { fields: ['received_at'] },
  ],
});

export default InsuranceEmailInbox;
