import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsurancePolicy = sequelize.define('InsurancePolicy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  policyNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'policy_number'
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
  insuranceProvider: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'insurance_provider'
  },
  planName: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'plan_name'
  },
  coverageAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'coverage_amount'
  },
  remainingAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'remaining_amount'
  },
  deductible: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  copay: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  validFrom: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'valid_from'
  },
  validUpto: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'valid_upto'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'inactive', 'expired', 'cancelled']]
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id'
  }
}, {
  tableName: 'insurance_policies',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['organization_id'] },
    { fields: ['patient_id'] },
    { fields: ['policy_number'], unique: true },
    { fields: ['status'] }
  ]
});

export default InsurancePolicy;
