import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsuranceClaim = sequelize.define('InsuranceClaim', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  claimNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'claim_number'
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
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'appointment_id',
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  policyNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'policy_number'
  },
  insuranceProvider: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'insurance_provider'
  },
  claimAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'claim_amount'
  },
  approvedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'approved_amount'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'submitted',
    validate: {
      isIn: [['submitted', 'under_review', 'approved', 'rejected', 'paid']]
    }
  },
  submittedDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'submitted_date'
  },
  approvalDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'approval_date'
  },
  paymentDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'payment_date'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
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
  tableName: 'insurance_claims',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['organization_id'] },
    { fields: ['patient_id'] },
    { fields: ['status'] },
    { fields: ['claim_number'], unique: true },
    { fields: ['insurance_provider'] }
  ]
});

export default InsuranceClaim;
