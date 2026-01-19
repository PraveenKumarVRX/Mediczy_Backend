import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const VitalSign = sequelize.define('VitalSign', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  recordedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'recorded_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  systolic: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Systolic blood pressure'
  },
  diastolic: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Diastolic blood pressure'
  },
  temperature: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
    comment: 'In Celsius'
  },
  heartRate: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'heart_rate',
    comment: 'In bpm'
  },
  respiratoryRate: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'respiratory_rate',
    comment: 'In breaths per minute'
  },
  oxygenSaturation: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
    field: 'oxygen_saturation',
    comment: 'SpO2 percentage'
  },
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'In kg'
  },
  height: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'In cm'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  recordedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'recorded_at',
    defaultValue: DataTypes.NOW
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id'
  }
}, {
  tableName: 'vital_signs',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['organization_id'] },
    { fields: ['patient_id'] },
    { fields: ['recorded_by'] },
    { fields: ['recorded_at'] }
  ]
});

export default VitalSign;
