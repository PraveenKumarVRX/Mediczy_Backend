/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * PSU (Public Sector Undertaking) Entity Model (PostgreSQL)
 * 
 * For government/public sector healthcare management:
 * - Employee health management
 * - Pensioner health programs
 * - CGHS/State health schemes
 * - Multi-location facility management
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const PSU = sequelize.define('PSU', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  uid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false
  },
  
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to tenants table'
  },
  
  // PSU Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'PSU/Government organization name'
  },
  
  short_name: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Abbreviation (e.g., ONGC, BHEL, SAIL)'
  },
  
  ministry: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Parent ministry'
  },
  
  psu_type: {
    type: DataTypes.ENUM('central', 'state', 'navratna', 'maharatna', 'miniratna', 'cpse', 'other'),
    defaultValue: 'central'
  },
  
  // Registration Details
  cin: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  pan: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  
  gst: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  
  // Contact Information
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { isEmail: true }
  },
  
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  website: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Address
  head_office: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  
  regional_offices: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of regional office addresses'
  },
  
  // Beneficiary Information
  employee_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  pensioner_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Retired employees covered'
  },
  
  dependent_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Family members covered'
  },
  
  total_beneficiaries: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.employee_count + this.pensioner_count + this.dependent_count;
    }
  },
  
  // Health Scheme Configuration
  health_scheme: {
    type: DataTypes.JSONB,
    defaultValue: {
      scheme_name: null,
      scheme_type: null,  // CGHS, ECHS, Custom
      coverage_type: 'comprehensive',
      room_eligibility: {},
      sum_insured: {},
      contribution_model: 'employer_paid'
    }
  },
  
  // Medical Facilities
  owned_hospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'PSU-owned hospital IDs'
  },
  
  owned_dispensaries: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'PSU-owned dispensary/OHC IDs'
  },
  
  empaneled_hospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Empaneled private hospital IDs'
  },
  
  empaneled_labs: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  empaneled_pharmacies: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  
  // Programs
  health_programs: {
    type: DataTypes.JSONB,
    defaultValue: {
      annual_health_checkup: true,
      pre_employment_medical: true,
      periodic_medical: true,
      wellness_programs: false,
      mental_health: false,
      telemedicine: false,
      home_healthcare: false
    }
  },
  
  // Reimbursement Configuration
  reimbursement_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      processing_office: null,
      max_claim_amount: null,
      documentation_required: [],
      turnaround_days: 30
    }
  },
  
  // Child Services
  has_pharmacy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  has_lab: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  has_ambulance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Admin Configuration
  nodal_officer: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Nodal officer contact: { name, designation, email, phone }'
  },
  
  cmo_contact: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Chief Medical Officer contact'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('pending', 'active', 'suspended', 'inactive'),
    defaultValue: 'pending'
  },
  
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'psus',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['short_name'] },
    { fields: ['psu_type'] },
    { fields: ['status'] },
    { using: 'GIN', fields: ['health_scheme'] },
    { using: 'GIN', fields: ['empaneled_hospitals'] }
  ]
});

export default PSU;
