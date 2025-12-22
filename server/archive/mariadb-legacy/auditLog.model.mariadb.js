import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

/**
 * Audit Log Model
 * Compliance: HIPAA §164.312(b), GDPR Article 30, DPDP Act §8
 * 
 * Purpose: Track all access and modifications to Protected Health Information (PHI)
 * and Personally Identifiable Information (PII) for compliance and security monitoring.
 */
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Who performed the action
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User who performed the action (null for system actions)'
  },
  
  userType: {
    type: DataTypes.ENUM('user', 'doctor', 'admin', 'system'),
    allowNull: false,
    defaultValue: 'system'
  },
  
  userEmail: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Email for audit trail (denormalized for record retention)'
  },
  
  // What action was performed
  action: {
    type: DataTypes.ENUM(
      'CREATE', 'READ', 'UPDATE', 'DELETE',
      'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
      'CONSENT_GIVEN', 'CONSENT_WITHDRAWN',
      'DATA_EXPORT', 'DATA_DELETION',
      'PHI_ACCESS', 'PHI_MODIFY',
      'SHARING_ENABLED', 'SHARING_DISABLED',
      'PERMISSION_GRANT', 'PERMISSION_REVOKE'
    ),
    allowNull: false,
    comment: 'Type of action performed'
  },
  
  // What resource was accessed
  resourceType: {
    type: DataTypes.ENUM(
      'User', 'Doctor', 'Appointment', 'HealthRecord',
      'Prescription', 'LabReport', 'VitalSigns',
      'Insurance', 'Payment', 'Consent', 'Session'
    ),
    allowNull: true,
    comment: 'Type of resource accessed'
  },
  
  resourceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the resource accessed'
  },
  
  // HIPAA Requirement: Minimum Necessary Standard
  dataFields: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Specific fields accessed (for PHI access tracking)'
  },
  
  // What changed (for UPDATE/DELETE actions)
  changesBefore: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Data state before change (for audit trail)'
  },
  
  changesAfter: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Data state after change (for audit trail)'
  },
  
  // Context and metadata
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'IPv4 or IPv6 address'
  },
  
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Browser/device information'
  },
  
  location: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Geographic location (city, country) if available'
  },
  
  // Request details
  method: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'HTTP method (GET, POST, PUT, DELETE)'
  },
  
  endpoint: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'API endpoint accessed'
  },
  
  // Result of action
  status: {
    type: DataTypes.ENUM('SUCCESS', 'FAILURE', 'PARTIAL'),
    allowNull: false,
    defaultValue: 'SUCCESS'
  },
  
  statusCode: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'HTTP status code'
  },
  
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if action failed'
  },
  
  // Compliance flags
  isPHI: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this action involved Protected Health Information (HIPAA)'
  },
  
  isPII: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this action involved Personally Identifiable Information (GDPR/DPDP)'
  },
  
  consentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to consent record if applicable'
  },
  
  // Purpose limitation (GDPR Art. 5(1)(b), DPDP §4)
  purpose: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Stated purpose for accessing the data'
  },
  
  // Session tracking
  sessionId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Session identifier for grouping related actions'
  },
  
  // Retention metadata
  retentionDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when this log can be archived (HIPAA: 6 years, GDPR: varies)'
  },
  
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the action occurred'
  }
}, {
  tableName: 'audit_logs',
  timestamps: false,
  indexes: [
    { fields: ['userId', 'userType'] },
    { fields: ['action'] },
    { fields: ['resourceType', 'resourceId'] },
    { fields: ['timestamp'] },
    { fields: ['isPHI'] },
    { fields: ['isPII'] },
    { fields: ['sessionId'] },
    { fields: ['ipAddress'] }
  ]
});

/**
 * Log an audit event
 * @param {Object} params - Audit log parameters
 */
AuditLog.logEvent = async function(params) {
  try {
    const {
      userId,
      userType,
      userEmail,
      action,
      resourceType,
      resourceId,
      dataFields,
      changesBefore,
      changesAfter,
      req, // Express request object
      status = 'SUCCESS',
      statusCode,
      errorMessage,
      isPHI = false,
      isPII = false,
      purpose
    } = params;
    
    // Calculate retention date (HIPAA: 6 years from creation or last use)
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + 6);
    
    const logEntry = await AuditLog.create({
      userId,
      userType,
      userEmail,
      action,
      resourceType,
      resourceId,
      dataFields,
      changesBefore,
      changesAfter,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers['user-agent'],
      method: req?.method,
      endpoint: req?.originalUrl || req?.url,
      status,
      statusCode,
      errorMessage,
      isPHI,
      isPII,
      purpose,
      sessionId: req?.sessionID || req?.headers['x-session-id'],
      retentionDate,
      timestamp: new Date()
    });
    
    return logEntry;
  } catch (error) {
    // Critical: Audit logging failures must be monitored
    console.error('❌ CRITICAL: Audit log creation failed:', error);
    // Could trigger alert to security team
    throw error;
  }
};

/**
 * Retrieve audit logs for a specific user (for GDPR/DPDP data access requests)
 */
AuditLog.getUserAuditTrail = async function(userId, userType = 'user') {
  return await AuditLog.findAll({
    where: { userId, userType },
    order: [['timestamp', 'DESC']],
    limit: 1000 // Reasonable limit for data export
  });
};

/**
 * Retrieve PHI access logs for compliance reporting
 */
AuditLog.getPHIAccessLogs = async function(startDate, endDate) {
  return await AuditLog.findAll({
    where: {
      isPHI: true,
      timestamp: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    },
    order: [['timestamp', 'DESC']]
  });
};

export default AuditLog;
