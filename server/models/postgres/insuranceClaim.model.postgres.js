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
    field: 'claimNumber'  // Fixed: database column is camelCase, not snake_case
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'patientId',  // Fixed: database column is camelCase
    references: {
      model: 'users',
      key: 'id'
    }
  },
  hospitalId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'hospital_id',  // This one IS snake_case in DB
    references: {
      model: 'organizations',
      key: 'id'
    }
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'appointmentId',  // Fixed: database column is camelCase
    references: {
      model: 'appointments',
      key: 'id'
    }
  },
  preAuthId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'pre_auth_id',
    references: {
      model: 'pre_authorizations',
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
    allowNull: true,
    field: 'insurance_provider'
  },
  insuranceProviderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'insurance_provider_id',
    references: {
      model: 'insurance_providers',
      key: 'id'
    }
  },
  tpaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'tpa_id',
    references: {
      model: 'tpa',
      key: 'id'
    }
  },
  claimAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'claimAmount'  // Fixed: database column is camelCase
  },
  approvedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'approvedAmount'  // Fixed: database column is camelCase
  },
  settledAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'settled_amount'
  },
  deductedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'deducted_amount',
    comment: 'Amount deducted (copay, deductible, disallowed items)'
  },
  claimType: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'claim_type',
    defaultValue: 'cashless',
    validate: {
      isIn: [['cashless', 'reimbursement', 'emergency']]
    }
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'draft',
    validate: {
      isIn: [['draft', 'submitted', 'pending', 'query', 'approved', 'rejected', 'paid']]
    }
  },
  settlementStatus: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'settlement_status',
    validate: {
      isIn: [['pending', 'partial', 'settled', 'rejected']]
    }
  },
  submittedDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'submitted_date'
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at'
  },
  submittedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'submitted_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approvalDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'approval_date'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rejected_at'
  },
  paymentDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'payment_date'
  },
  settlementDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'settlement_date'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },
  hospitalizationDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'hospitalization_details',
    comment: 'Admission date, discharge date, room type, treating doctor, etc.'
  },
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Primary diagnosis and ICD codes'
  },
  treatmentDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'treatment_details',
    comment: 'Procedures performed, medications, investigations'
  },
  documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of uploaded documents with metadata'
  },
  documentsStatus: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'documents_status',
    defaultValue: 'incomplete',
    validate: {
      isIn: [['incomplete', 'complete', 'pending_verification']]
    }
  },
  requiredDocuments: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'required_documents',
    defaultValue: ['discharge_summary', 'bills', 'investigation_reports', 'prescription']
  },
  queryHistory: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    field: 'query_history',
    comment: 'Track all queries and responses from insurance company'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  lastModifiedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'last_modified_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id'
  }
}, {
  tableName: 'insurance_claims',
  timestamps: true,
  underscored: false,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    { fields: ['organization_id'] },
    { fields: ['patient_id'] },
    { fields: ['hospital_id'] },
    { fields: ['status'] },
    { fields: ['claimNumber'], unique: true },
    { fields: ['insurance_provider'] },
    { fields: ['insurance_provider_id'] },
    { fields: ['settlement_status'] },
    { fields: ['submitted_at'] },
    { fields: ['documents_status'] }
  ]
});

// Associations
InsuranceClaim.associate = (models) => {
  InsuranceClaim.belongsTo(models.User, {
    foreignKey: 'patient_id',
    as: 'patient'
  });
  
  InsuranceClaim.belongsTo(models.Organization, {
    foreignKey: 'hospital_id',
    as: 'hospital'
  });
  
  InsuranceClaim.belongsTo(models.User, {
    foreignKey: 'submitted_by',
    as: 'submittedByUser'
  });
  
  InsuranceClaim.belongsTo(models.PreAuthorization, {
    foreignKey: 'pre_auth_id',
    as: 'preAuthorization'
  });
  
  InsuranceClaim.belongsTo(models.InsuranceProvider, {
    foreignKey: 'insurance_provider_id',
    as: 'insuranceProviderDetails'
  });
};

export default InsuranceClaim;
