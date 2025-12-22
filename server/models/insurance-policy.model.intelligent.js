/**
 * Health Insurance Policy & Rule Engine Models
 * Comprehensive insurance policy management with rule engine
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

// ============================================================================
// INSURANCE POLICY MODEL
// ============================================================================

export const InsurancePolicy = sequelize.define('InsurancePolicy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Policy Identification
  policyNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    comment: 'Unique policy number'
  },
  policyName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Policy product name'
  },
  
  // Ownership & Distribution
  insuranceCompanyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Insurance company offering this policy'
  },
  brokerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Broker who sold/manages this policy'
  },
  tpaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Third Party Administrator for claims'
  },
  corporateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Corporate purchaser (for group policies)'
  },
  
  // Policy Type
  policyType: {
    type: DataTypes.ENUM('individual', 'family_floater', 'group', 'corporate'),
    allowNull: false,
    defaultValue: 'individual'
  },
  
  // Coverage & Financials
  sumInsured: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Total coverage amount'
  },
  premium: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Annual premium'
  },
  
  // Policy Period
  policyStartDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  policyEndDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  
  // Policy Status
  status: {
    type: DataTypes.ENUM('draft', 'active', 'expired', 'cancelled', 'lapsed'),
    defaultValue: 'draft'
  },
  
  // Rule Engine Configuration
  ruleVersion: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0',
    comment: 'Policy rule version'
  },
  
  // Complete Rule Set (JSONB)
  rules: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Complete policy rules configuration'
  },
  
  // Coverage Configuration
  coverageConfig: {
    type: DataTypes.JSONB,
    defaultValue: {
      hospitalization: true,
      daycare: true,
      domiciliary: false,
      maternity: false,
      newborn: false,
      prePostHospitalization: { pre: 30, post: 60 },
      ambulance: true,
      opd: false,
      ayush: true
    }
  },
  
  // Financial Limits
  limits: {
    type: DataTypes.JSONB,
    defaultValue: {
      roomRent: null,
      icuRent: null,
      cataract: null,
      dental: null,
      deductible: 0,
      copayment: 0
    }
  },
  
  // Waiting Periods
  waitingPeriods: {
    type: DataTypes.JSONB,
    defaultValue: {
      initial: 30,
      specificDiseases: {
        '1year': [],
        '2year': [],
        '3year': [],
        '4year': []
      },
      ped: 36,
      maternity: 48
    }
  },
  
  // Network Details
  networkConfig: {
    type: DataTypes.JSONB,
    defaultValue: {
      cashlessEnabled: true,
      ppnMandatory: false,
      networkHospitals: []
    }
  },
  
  // Exclusions & Special Conditions
  exclusions: {
    type: DataTypes.JSONB,
    defaultValue: {
      firstYear: [],
      permanent: [],
      suicideWaiver: true,
      terrorism: false
    }
  },
  
  // Add-ons
  addons: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Terms & Conditions
  termsAndConditions: {
    type: DataTypes.TEXT,
    comment: 'Full T&C document'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'insurance_policies',
  timestamps: true,
  indexes: [
    { fields: ['policyNumber'], unique: true },
    { fields: ['insuranceCompanyId'] },
    { fields: ['brokerId'] },
    { fields: ['tpaId'] },
    { fields: ['corporateId'] },
    { fields: ['status'] },
    { fields: ['policyType'] }
  ]
});

// ============================================================================
// POLICY RULE MODEL
// ============================================================================

export const PolicyRule = sequelize.define('PolicyRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  policyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'insurance_policies',
      key: 'id'
    }
  },
  
  // Rule Identification
  ruleCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Unique rule code (e.g., ELIG_FAMILY_DEF)'
  },
  ruleName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  ruleCategory: {
    type: DataTypes.ENUM(
      'eligibility',
      'underwriting',
      'coverage',
      'waiting_period',
      'claims',
      'financial',
      'network',
      'exclusion',
      'addon'
    ),
    allowNull: false
  },
  
  // Rule Configuration
  parameters: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Rule-specific parameters'
  },
  
  // Rule Logic
  condition: {
    type: DataTypes.TEXT,
    comment: 'Rule condition expression'
  },
  action: {
    type: DataTypes.TEXT,
    comment: 'Action to take when condition is met'
  },
  
  // Priority & Version
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    comment: 'Rule execution priority (lower = higher priority)'
  },
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0'
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  effectiveFrom: {
    type: DataTypes.DATE
  },
  effectiveTo: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'policy_rules',
  timestamps: true,
  indexes: [
    { fields: ['policyId'] },
    { fields: ['ruleCode'] },
    { fields: ['ruleCategory'] },
    { fields: ['isActive'] }
  ]
});

// ============================================================================
// INSURANCE CLAIM MODEL
// ============================================================================

export const InsuranceClaim = sequelize.define('InsuranceClaim', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Claim Identification
  claimNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  
  // Related Entities
  policyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'insurance_policies',
      key: 'id'
    }
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User/Member ID'
  },
  hospitalId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Hospital where treatment was received'
  },
  tpaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'TPA processing this claim'
  },
  
  // Claim Details
  claimType: {
    type: DataTypes.ENUM('cashless', 'reimbursement', 'preauth'),
    allowNull: false
  },
  treatmentType: {
    type: DataTypes.ENUM('inpatient', 'outpatient', 'daycare', 'domiciliary', 'maternity'),
    allowNull: false
  },
  
  // Admission Details
  admissionDate: {
    type: DataTypes.DATE
  },
  dischargeDate: {
    type: DataTypes.DATE
  },
  
  // Diagnosis
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  icdCode: {
    type: DataTypes.STRING(20),
    comment: 'ICD-10 diagnosis code'
  },
  
  // Financial Details
  claimedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  approvedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  deductedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  settledAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  
  // Deductions Breakdown
  deductions: {
    type: DataTypes.JSONB,
    defaultValue: {
      roomRentDeduction: 0,
      proportionateDeduction: 0,
      copayment: 0,
      deductible: 0,
      nonMedicalExpenses: 0,
      exclusions: 0
    }
  },
  
  // Rule Engine Evaluation
  ruleEvaluationResult: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Results of rule engine evaluation'
  },
  
  // Documents
  documents: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of uploaded claim documents'
  },
  
  // Status & Timeline
  status: {
    type: DataTypes.ENUM(
      'initiated',
      'documents_pending',
      'under_review',
      'query_raised',
      'approved',
      'partially_approved',
      'rejected',
      'settled'
    ),
    defaultValue: 'initiated'
  },
  
  intimationDate: {
    type: DataTypes.DATE
  },
  submissionDate: {
    type: DataTypes.DATE
  },
  settlementDate: {
    type: DataTypes.DATE
  },
  
  // Rejection/Query Details
  rejectionReason: {
    type: DataTypes.TEXT
  },
  queryDetails: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Remarks
  remarks: {
    type: DataTypes.TEXT
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'insurance_claims',
  timestamps: true,
  indexes: [
    { fields: ['claimNumber'], unique: true },
    { fields: ['policyId'] },
    { fields: ['patientId'] },
    { fields: ['hospitalId'] },
    { fields: ['tpaId'] },
    { fields: ['status'] },
    { fields: ['claimType'] }
  ]
});

// ============================================================================
// POLICY MEMBER MODEL
// ============================================================================

export const PolicyMember = sequelize.define('PolicyMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  policyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'insurance_policies',
      key: 'id'
    }
  },
  
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User ID from users table'
  },
  
  // Member Details
  relationship: {
    type: DataTypes.ENUM('self', 'spouse', 'son', 'daughter', 'father', 'mother', 'other'),
    allowNull: false
  },
  
  // Coverage
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  coverageStartDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  coverageEndDate: {
    type: DataTypes.DATE
  },
  
  // Sum Insured
  individualSumInsured: {
    type: DataTypes.DECIMAL(15, 2),
    comment: 'Individual SI (for individual policies)'
  },
  
  // Pre-Existing Diseases
  preExistingDiseases: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Declared PEDs with waiting period tracking'
  },
  
  // Utilization Tracking
  sumInsuredUsed: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  sumInsuredRemaining: {
    type: DataTypes.DECIMAL(15, 2)
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'policy_members',
  timestamps: true,
  indexes: [
    { fields: ['policyId'] },
    { fields: ['userId'] },
    { fields: ['relationship'] },
    { fields: ['isActive'] }
  ]
});

// ============================================================================
// ASSOCIATIONS
// ============================================================================

InsurancePolicy.hasMany(PolicyRule, { foreignKey: 'policyId', as: 'policyRules' });
PolicyRule.belongsTo(InsurancePolicy, { foreignKey: 'policyId' });

InsurancePolicy.hasMany(InsuranceClaim, { foreignKey: 'policyId', as: 'claims' });
InsuranceClaim.belongsTo(InsurancePolicy, { foreignKey: 'policyId', as: 'policy' });

InsurancePolicy.hasMany(PolicyMember, { foreignKey: 'policyId', as: 'members' });
PolicyMember.belongsTo(InsurancePolicy, { foreignKey: 'policyId', as: 'policy' });

export default {
  InsurancePolicy,
  PolicyRule,
  InsuranceClaim,
  PolicyMember
};
