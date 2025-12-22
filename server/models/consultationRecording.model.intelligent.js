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
  }
}, {
  tableName: 'consultation_recordings',
  timestamps: true,
  indexes: [
    { fields: ['appointmentId'] },
    { fields: ['doctorId'] },
    { fields: ['patientId'] },
    { fields: ['roomId'] },
    { fields: ['status'] }
  ]
});

export default ConsultationRecording;
