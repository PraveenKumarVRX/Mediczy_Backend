/**
 * Pre-Authorization Model
 * For cashless admission approvals from insurance companies/TPAs
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const PreAuthorization = sequelize.define('PreAuthorization', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  preAuthNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'pre_auth_number'
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
  hospitalId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'hospital_id',
    references: {
      model: 'organizations',
      key: 'id'
    }
  },
  policyNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'policy_number'
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
  admissionDetails: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'admission_details',
    comment: 'Includes: admissionType, admissionDate, expectedDuration, roomType, etc.'
  },
  estimatedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'estimated_amount'
  },
  approvedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'approved_amount'
  },
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Primary diagnosis and ICD codes'
  },
  plannedProcedures: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'planned_procedures',
    comment: 'List of planned medical procedures'
  },
  estimatedDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_duration',
    comment: 'Estimated hospital stay in days'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'approved', 'rejected', 'expired', 'cancelled']]
    }
  },
  approvalNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'approval_number',
    comment: 'Insurance company approval reference number'
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
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: 'Pre-auth validity expiry date'
  },
  documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of uploaded documents with metadata'
  },
  queryHistory: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    field: 'query_history',
    comment: 'Track all queries and responses from insurance company'
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal remarks or notes'
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_id',
    references: {
      model: 'organizations',
      key: 'id'
    }
  }
}, {
  tableName: 'pre_authorizations',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['pre_auth_number'], unique: true },
    { fields: ['patient_id'] },
    { fields: ['hospital_id'] },
    { fields: ['status'] },
    { fields: ['organization_id'] },
    { fields: ['submitted_at'] },
    { fields: ['expires_at'] }
  ]
});

// Associations
PreAuthorization.associate = (models) => {
  PreAuthorization.belongsTo(models.User, {
    foreignKey: 'patient_id',
    as: 'patient'
  });
  
  PreAuthorization.belongsTo(models.Organization, {
    foreignKey: 'hospital_id',
    as: 'hospital'
  });
  
  PreAuthorization.belongsTo(models.User, {
    foreignKey: 'submitted_by',
    as: 'submittedByUser'
  });
  
  PreAuthorization.belongsTo(models.InsuranceProvider, {
    foreignKey: 'insurance_provider_id',
    as: 'insuranceProvider'
  });
};

export default PreAuthorization;
