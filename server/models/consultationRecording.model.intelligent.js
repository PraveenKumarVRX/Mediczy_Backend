import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

const ConsultationRecording = sequelize.define('ConsultationRecording', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  roomId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  recordingFileName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  recordingPath: {
    type: DataTypes.STRING,
    allowNull: true
  },
  recordingUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER, // in seconds
    allowNull: true
  },
  fileSize: {
    type: DataTypes.BIGINT, // in bytes
    allowNull: true
  },
  format: {
    type: DataTypes.STRING,
    defaultValue: 'webm'
  },
  transcription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  aiSummary: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  aiPrescription: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'AI-generated prescription from consultation'
  },
  status: {
    type: DataTypes.ENUM('recording', 'processing', 'completed', 'failed'),
    defaultValue: 'recording'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  // Audit Trail for Access Tracking
  accessLog: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Track who accessed/downloaded this recording and when - for audit compliance'
  },
  // Retention Policy
  retentionDays: {
    type: DataTypes.INTEGER,
    defaultValue: 90,
    comment: 'How long to retain this recording (HIPAA compliance)'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Auto-calculated expiration date based on retentionDays'
  }
}, {
  tableName: 'consultation_recordings',
  timestamps: true,
  indexes: [
    { fields: ['appointmentId'] },
    { fields: ['doctorId'] },
    { fields: ['patientId'] },
    { fields: ['roomId'] },
    { fields: ['status'] },
    { fields: ['expiresAt'] }
  ]
});

// Hooks to auto-calculate expiration date
ConsultationRecording.addHook('beforeCreate', (recording) => {
  if (recording.retentionDays && !recording.expiresAt) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + recording.retentionDays);
    recording.expiresAt = expirationDate;
  }
});

// Instance method to log access
ConsultationRecording.prototype.logAccess = async function(userId, userType, userName, action = 'view', ipAddress = null) {
  const accessEntry = {
    userId,
    userType, // 'doctor', 'clinic_admin', 'patient', 'system'
    userName,
    action, // 'view', 'download', 'transcribe', 'delete'
    timestamp: new Date().toISOString(),
    ipAddress
  };
  
  const currentLog = this.accessLog || [];
  currentLog.push(accessEntry);
  
  await this.update({ accessLog: currentLog });
  
  return accessEntry;
};

export default ConsultationRecording;
