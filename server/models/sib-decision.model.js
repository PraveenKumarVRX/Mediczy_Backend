/**
 * SIB Decision Log Model
 * 
 * Stores audit trail of all AI decisions processed through SIB Control Layer
 * Supports HIPAA/GDPR/DPDP compliance requirements
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const SIBDecision = sequelize.define('SIBDecision', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Decision identification
  decisionId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Unique decision identifier (decision_xxxxx)'
  },
  
  // Decision type (send_notification, escalate_emergency, etc.)
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    index: true,
    comment: 'Decision type from DECISION_TYPES enum'
  },
  
  // Decision quality
  confidence: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    validate: {
      min: 0,
      max: 1
    },
    comment: 'AI confidence score (0.0 - 1.0)'
  },
  
  // Explainability
  reasoning: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Human-readable explanation of decision'
  },
  
  // Decision payload
  data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Decision data payload'
  },
  
  // Context
  context: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional context (source, timestamp, etc.)'
  },
  
  // Status tracking
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'executed', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
    index: true,
    comment: 'Decision processing status'
  },
  
  // Human approval tracking
  approvalId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Approval request ID if human approval required'
  },
  
  approvedBy: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Admin email/ID who approved decision'
  },
  
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of approval'
  },
  
  approvalComments: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Comments from approver'
  },
  
  rejectedBy: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Admin email/ID who rejected decision'
  },
  
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of rejection'
  },
  
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for rejection'
  },
  
  // Execution tracking
  executedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of execution'
  },
  
  executionResult: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Execution result (jobId, success, error, etc.)'
  },
  
  // Safety metrics
  rateLimitExceeded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Was rate limit exceeded?'
  },
  
  confidenceThresholdMet: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Did confidence meet threshold?'
  },
  
  policyViolation: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Policy violation if any (e.g., quiet hours)'
  },
  
  circuitBreakerTripped: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Was circuit breaker active?'
  },
  
  killSwitchActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Was kill switch active when decision attempted?'
  },
  
  // Processing metadata
  processingTimeMs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Time taken to process decision (milliseconds)'
  },
  
  aiProvider: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'AI provider used (sib-llama, groq, gemini)'
  },
  
  aiModelVersion: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'AI model version'
  },
  
  // Compliance
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    index: true,
    comment: 'User ID affected by decision (for HIPAA/GDPR queries)'
  },
  
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    index: true,
    comment: 'Doctor ID if decision involves medical professional'
  },
  
  // Audit trail
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Decision creation timestamp'
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last update timestamp'
  }
}, {
  tableName: 'sib_decisions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_sib_decisions_type_status',
      fields: ['type', 'status']
    },
    {
      name: 'idx_sib_decisions_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_sib_decisions_user_id',
      fields: ['userId']
    },
    {
      name: 'idx_sib_decisions_approval_id',
      fields: ['approvalId']
    }
  ],
  comment: 'SIB Control Layer decision audit log'
});

// Class methods
SIBDecision.prototype.approve = async function(approvedBy, comments) {
  this.status = 'approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  this.approvalComments = comments;
  return await this.save();
};

SIBDecision.prototype.reject = async function(rejectedBy, reason) {
  this.status = 'rejected';
  this.rejectedBy = rejectedBy;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  return await this.save();
};

SIBDecision.prototype.markExecuted = async function(result) {
  this.status = 'executed';
  this.executedAt = new Date();
  this.executionResult = result;
  return await this.save();
};

SIBDecision.prototype.markFailed = async function(error) {
  this.status = 'failed';
  this.executionResult = { 
    success: false, 
    error: error.message,
    timestamp: new Date()
  };
  return await this.save();
};

export default SIBDecision;
