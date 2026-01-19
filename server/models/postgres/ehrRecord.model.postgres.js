import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const EHRRecord = sequelize.define('EHRRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ehrNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'ehr_number'
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
  height: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'in cm'
  },
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'in kg'
  },
  bloodType: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'blood_type'
  },
  allergies: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of allergies'
  },
  chronicDiseases: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'chronic_diseases',
    comment: 'Array of chronic conditions'
  },
  medications: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Current medications list'
  },
  emergencyContact: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'emergency_contact',
    comment: '{name, phone, relationship}'
  },
  insuranceDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'insurance_details'
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id'
  }
}, {
  tableName: 'ehr_records',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['organization_id'] },
    { fields: ['patient_id'], unique: true },
    { fields: ['ehr_number'], unique: true }
  ]
});

export default EHRRecord;
