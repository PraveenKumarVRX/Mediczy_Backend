/**
 * Consent Management Model - HIPAA Compliant Consent Tracking
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const Consent = sequelize.define('Consent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Consent Type
  consentType: {
    type: DataTypes.ENUM(
      'treatment',
      'hipaa_privacy',
      'data_sharing',
      'telehealth',
      'research',
      'photography',
      'billing',
      'release_of_information',
      'procedure_specific',
      'anesthesia',
      'vaccination',
      'minor_treatment'
    ),
    allowNull: false
  },
  
  // Specific Purpose
  purpose: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  procedureName: {
    type: DataTypes.STRING(200),
    comment: 'For procedure-specific consents'
  },
  
  // Consent Details
  consentText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Full text of consent form'
  },
  version: {
    type: DataTypes.STRING(20),
    comment: 'Version of consent form'
  },
  
  // E-Signature
  patientSignature: {
    type: DataTypes.TEXT,
    comment: 'Base64 encoded signature image'
  },
  patientSignedAt: {
    type: DataTypes.DATE
  },
  patientIpAddress: {
    type: DataTypes.STRING(45)
  },
  patientDeviceInfo: {
    type: DataTypes.JSONB
  },
  
  // Witness/Guardian (if applicable)
  witnessRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  witnessName: {
    type: DataTypes.STRING(200)
  },
  witnessSignature: {
    type: DataTypes.TEXT
  },
  witnessSignedAt: {
    type: DataTypes.DATE
  },
  witnessRelationship: {
    type: DataTypes.STRING(100)
  },
  
  // Provider Signature
  providerId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  providerSignature: {
    type: DataTypes.TEXT
  },
  providerSignedAt: {
    type: DataTypes.DATE
  },
  
  // Validity
  status: {
    type: DataTypes.ENUM('pending', 'signed', 'expired', 'revoked', 'superseded'),
    defaultValue: 'pending',
    allowNull: false
  },
  effectiveDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  expirationDate: {
    type: DataTypes.DATE
  },
  
  // Revocation
  revokedAt: {
    type: DataTypes.DATE
  },
  revocationReason: {
    type: DataTypes.TEXT
  },
  revokedBy: {
    type: DataTypes.INTEGER
  },
  
  // Document Management
  documentUrl: {
    type: DataTypes.STRING,
    comment: 'URL to signed PDF'
  },
  documentHash: {
    type: DataTypes.STRING(64),
    comment: 'SHA-256 hash for integrity verification'
  },
  
  // Audit Trail
  auditLog: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Complete audit trail of all actions'
  },
  
  // Access Logging
  accessLog: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Who accessed this consent and when'
  },
  
  // Language
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'en'
  },
  
  // Special Conditions
  conditions: {
    type: DataTypes.JSONB,
    comment: 'Any special conditions or limitations'
  },
  
  // Related Records
  appointmentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  procedureId: {
    type: DataTypes.INTEGER
  },
  
  // Notification
  patientNotified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  notificationSentAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'consents',
  timestamps: true,
  indexes: [
    { fields: ['patientId', 'consentType'] },
    { fields: ['status'] },
    { fields: ['expirationDate'] },
    { fields: ['appointmentId'] }
  ]
});

export default Consent;
