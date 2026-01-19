import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const MedicalRecord = sequelize.define('MedicalRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  recordNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'record_number'
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'patient_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'doctor_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'appointment_id',
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  treatment: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  symptoms: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  vitalSigns: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'vital_signs',
    comment: '{bloodPressure, temperature, heartRate, respiratoryRate}'
  },
  prescriptions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of prescribed medicines'
  },
  documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of document URLs'
  },
  recordDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'record_date'
  },
  recordType: {
    type: DataTypes.STRING(50),
    field: 'record_type',
    comment: 'consultation, discharge, follow-up, emergency'
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id'
  }
}, {
  tableName: 'medical_records',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['organization_id'] },
    { fields: ['patient_id'] },
    { fields: ['doctor_id'] },
    { fields: ['record_number'], unique: true }
  ]
});

export default MedicalRecord;
