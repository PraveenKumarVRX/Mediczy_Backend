/**
 * Delegation Log Model - Track Assistant Actions with Audit Trail
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const DelegationLog = sequelize.define('DelegationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Doctor who delegated
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  
  // Assistant/Delegate
  delegateType: {
    type: DataTypes.ENUM('nurse', 'medical_assistant', 'admin', 'resident', 'fellow'),
    allowNull: false
  },
  delegateId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  delegateName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  
  // Patient Context
  patientId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Action Details
  actionType: {
    type: DataTypes.ENUM(
      'schedule_appointment',
      'reschedule_appointment',
      'cancel_appointment',
      'create_prescription',
      'refill_prescription',
      'order_lab',
      'order_imaging',
      'document_vitals',
      'triage_patient',
      'send_message',
      'update_record',
      'consent_collection',
      'billing_action'
    ),
    allowNull: false
  },
  
  actionDescription: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  
  // Action Data
  actionData: {
    type: DataTypes.JSONB,
    comment: 'Detailed data about the action taken'
  },
  
  // Before/After States
  beforeState: {
    type: DataTypes.JSONB,
    comment: 'State before the action'
  },
  afterState: {
    type: DataTypes.JSONB,
    comment: 'State after the action'
  },
  
  // Authorization
  delegationLevel: {
    type: DataTypes.ENUM('full', 'review_required', 'co_sign_required'),
    defaultValue: 'review_required'
  },
  requiresReview: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  requiresCoSign: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Review Status
  reviewStatus: {
    type: DataTypes.ENUM('pending', 'reviewed', 'approved', 'rejected', 'modified'),
    defaultValue: 'pending'
  },
  reviewedAt: {
    type: DataTypes.DATE
  },
  reviewedBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  reviewComments: {
    type: DataTypes.TEXT
  },
  
  // Co-Signature
  coSignedAt: {
    type: DataTypes.DATE
  },
  coSignedBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  coSignature: {
    type: DataTypes.TEXT,
    comment: 'E-signature'
  },
  
  // Timing
  actionTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  // Context
  appointmentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  
  // IP and Device
  ipAddress: {
    type: DataTypes.STRING(45)
  },
  userAgent: {
    type: DataTypes.TEXT
  },
  deviceInfo: {
    type: DataTypes.JSONB
  },
  
  // Related Records
  relatedRecordType: {
    type: DataTypes.STRING(50),
    comment: 'Type of record created/modified'
  },
  relatedRecordId: {
    type: DataTypes.INTEGER,
    comment: 'ID of record created/modified'
  },
  
  // Risk Level
  riskLevel: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'low',
    comment: 'Clinical risk associated with action'
  },
  
  // Compliance
  complianceChecked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  complianceStatus: {
    type: DataTypes.STRING(50)
  },
  
  // Flags
  flaggedForReview: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  flagReason: {
    type: DataTypes.TEXT
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'delegation_logs',
  timestamps: true,
  indexes: [
    { fields: ['doctorId', 'reviewStatus'] },
    { fields: ['delegateId', 'delegateType'] },
    { fields: ['patientId'] },
    { fields: ['actionType'] },
    { fields: ['actionTimestamp'] },
    { fields: ['requiresReview', 'reviewStatus'] }
  ]
});

export default DelegationLog;
