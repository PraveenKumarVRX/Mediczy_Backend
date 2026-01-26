/**
 * Lab Result Model - Integrated Lab/Imaging Results
 * With abnormal flagging and patient notifications
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const LabResult = sequelize.define('LabResult', {
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
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'doctors',
      key: 'id'
    }
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  
  // Test Information
  testType: {
    type: DataTypes.ENUM('lab', 'imaging', 'pathology', 'diagnostic'),
    allowNull: false
  },
  testName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  testCode: {
    type: DataTypes.STRING(50),
    comment: 'LOINC or CPT code'
  },
  category: {
    type: DataTypes.STRING(100),
    comment: 'Hematology, Chemistry, Radiology, etc.'
  },
  
  // Lab/Facility Information
  labName: {
    type: DataTypes.STRING(200)
  },
  labId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'labs',
      key: 'id'
    }
  },
  accessionNumber: {
    type: DataTypes.STRING(100),
    unique: true
  },
  
  // Timing
  orderedAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  collectedAt: {
    type: DataTypes.DATE
  },
  receivedAt: {
    type: DataTypes.DATE
  },
  resultedAt: {
    type: DataTypes.DATE
  },
  reviewedAt: {
    type: DataTypes.DATE
  },
  
  // Results Data
  results: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Array of {parameter, value, unit, referenceRange, flag}'
  },
  
  // Abnormal Flags
  hasAbnormal: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    index: true
  },
  abnormalParameters: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of abnormal findings with severity'
  },
  criticalValues: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Life-threatening values requiring immediate attention'
  },
  
  // Clinical Interpretation
  interpretation: {
    type: DataTypes.TEXT,
    comment: 'Lab interpretation/impression'
  },
  aiInterpretation: {
    type: DataTypes.TEXT,
    comment: 'AI-generated clinical significance'
  },
  
  // Imaging specific
  imagingFindings: {
    type: DataTypes.TEXT
  },
  imagingImpression: {
    type: DataTypes.TEXT
  },
  imagingUrls: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'URLs to DICOM viewer or images'
  },
  
  // Documents
  reportPdfUrl: {
    type: DataTypes.STRING
  },
  attachments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Additional documents'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('ordered', 'collected', 'in_progress', 'completed', 'reviewed', 'cancelled'),
    defaultValue: 'ordered',
    index: true
  },
  
  // Review and Sign-off
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
  requiresFollowUp: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  followUpNotes: {
    type: DataTypes.TEXT
  },
  
  // Patient Notification
  patientNotified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  notifiedAt: {
    type: DataTypes.DATE
  },
  notificationMethod: {
    type: DataTypes.ENUM('email', 'sms', 'app', 'portal'),
    comment: 'How patient was notified'
  },
  patientViewedAt: {
    type: DataTypes.DATE
  },
  
  // Priority
  priority: {
    type: DataTypes.ENUM('routine', 'urgent', 'stat', 'critical'),
    defaultValue: 'routine'
  },
  
  // Quality Flags
  specimenQuality: {
    type: DataTypes.STRING(50),
    comment: 'adequate, inadequate, hemolyzed, etc.'
  },
  qualityIssues: {
    type: DataTypes.TEXT
  },
  
  // Integration
  externalSystemId: {
    type: DataTypes.STRING(100),
    comment: 'ID in external LIS/RIS system'
  },
  hl7MessageId: {
    type: DataTypes.STRING(100)
  },
  
  // Comparison
  previousResultId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'lab_results',
      key: 'id'
    }
  },
  trendAnalysis: {
    type: DataTypes.JSONB,
    comment: 'Comparison with previous results'
  }
}, {
  tableName: 'lab_results',
  timestamps: true,
  indexes: [
    { fields: ['patientId', 'testType'] },
    { fields: ['doctorId', 'status'] },
    { fields: ['hasAbnormal'] },
    { fields: ['status', 'priority'] },
    { fields: ['orderedAt'] },
    { fields: ['accessionNumber'], unique: true }
  ]
});

export default LabResult;
