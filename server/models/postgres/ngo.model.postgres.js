/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * NGO (Non-Governmental Organization) Entity Model (PostgreSQL)
 * 
 * For healthcare NGOs and charitable organizations:
 * - Community health programs
 * - Health camps
 * - Volunteer management
 * - Donation tracking
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const NGO = sequelize.define('NGO', {
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
  
  // NGO Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'NGO name'
  },
  
  registration_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'NGO registration/society number'
  },
  
  fcra_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'FCRA registration for foreign contributions'
  },
  
  section_80g: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Has 80G tax exemption certificate'
  },
  
  ngo_type: {
    type: DataTypes.ENUM('trust', 'society', 'section_8', 'foundation', 'other'),
    defaultValue: 'trust'
  },
  
  focus_areas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of focus areas: health, education, rural, urban, etc.'
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
  
  social_media: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '{ facebook, twitter, instagram, linkedin }'
  },
  
  // Address
  head_office: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  
  field_offices: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of field office addresses'
  },
  
  // Operating Areas
  operating_areas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'States/districts where NGO operates'
  },
  
  beneficiary_areas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Target communities/areas'
  },
  
  // Healthcare Programs
  health_programs: {
    type: DataTypes.JSONB,
    defaultValue: {
      primary_healthcare: true,
      maternal_health: false,
      child_health: false,
      vaccination: false,
      nutrition: false,
      mental_health: false,
      disability: false,
      eye_care: false,
      dental_care: false,
      tuberculosis: false,
      hiv_aids: false,
      cancer_awareness: false,
      diabetes_screening: false
    }
  },
  
  // Health Camps
  health_camp_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      conducts_camps: true,
      camps_per_month: 0,
      avg_beneficiaries_per_camp: 0,
      services_offered: []
    }
  },
  
  // Child Services
  has_clinic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Operates mobile/fixed clinics'
  },
  
  has_pharmacy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Operates medicine distribution'
  },
  
  has_lab: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Operates diagnostic services'
  },
  
  has_ambulance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Has ambulance service'
  },
  
  has_homecare: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Provides home healthcare'
  },
  
  // Volunteer Management
  volunteer_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  volunteer_types: {
    type: DataTypes.JSONB,
    defaultValue: {
      doctors: 0,
      nurses: 0,
      health_workers: 0,
      general: 0,
      students: 0
    }
  },
  
  // Staff
  staff_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  medical_staff: {
    type: DataTypes.JSONB,
    defaultValue: {
      doctors: 0,
      nurses: 0,
      asha_workers: 0,
      anm: 0,
      pharmacists: 0,
      lab_technicians: 0
    }
  },
  
  // Beneficiaries
  total_beneficiaries: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  beneficiary_breakdown: {
    type: DataTypes.JSONB,
    defaultValue: {
      women: 0,
      children: 0,
      elderly: 0,
      disabled: 0,
      general: 0
    }
  },
  
  // Funding
  funding_sources: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of funding sources: CSR, government, individual, foundation'
  },
  
  annual_budget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  
  // Partnerships
  partner_hospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of partner hospital IDs'
  },
  
  partner_corporates: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'CSR partner corporates'
  },
  
  government_schemes: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Participating government schemes'
  },
  
  // Leadership
  trustees: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of trustees: { name, designation, contact }'
  },
  
  executive_director: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '{ name, email, phone }'
  },
  
  // Statistics
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      camps_conducted: 0,
      patients_treated: 0,
      surgeries_supported: 0,
      medicines_distributed: 0
    }
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
  tableName: 'ngos',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['ngo_type'] },
    { fields: ['status'] },
    { using: 'GIN', fields: ['focus_areas'] },
    { using: 'GIN', fields: ['health_programs'] },
    { using: 'GIN', fields: ['operating_areas'] }
  ]
});

export default NGO;
