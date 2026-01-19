/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * TPA (Third Party Administrator) Entity Model (PostgreSQL)
 * 
 * For insurance TPAs handling:
 * - Claims processing
 * - Pre-authorization
 * - Network provider management
 * - Cashless hospitalization
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const TPA = sequelize.define('TPA', {
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
  
  // TPA Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'TPA company name'
  },
  
  code: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: false,
    comment: 'TPA unique code (e.g., MEDI, FHPL, VIDAL)'
  },
  
  license_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'IRDAI TPA license number'
  },
  
  // Parent Insurance Company (if applicable)
  parent_insurer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Parent insurance company tenant ID'
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
  
  toll_free: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '24x7 toll-free number'
  },
  
  website: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Address
  head_office: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Head office address'
  },
  
  branch_offices: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of branch addresses'
  },
  
  // Network
  network_hospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of network hospital IDs'
  },
  
  network_hospital_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  network_labs: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of network lab IDs'
  },
  
  // Services Configuration
  services: {
    type: DataTypes.JSONB,
    defaultValue: {
      cashless_hospitalization: true,
      reimbursement: true,
      pre_authorization: true,
      claims_processing: true,
      wellness_programs: false,
      telemedicine: false,
      pharmacy_benefits: false,
      dental_vision: false
    }
  },
  
  // API Configuration
  api_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      base_url: null,
      auth_type: 'api_key',
      api_key: null,
      webhook_url: null,
      supports_real_time: false
    },
    comment: 'TPA API integration configuration'
  },
  
  // Claims Configuration
  claims_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      submission_methods: ['portal', 'email', 'physical'],
      required_documents: [],
      turnaround_days: 15,
      cashless_tat_hours: 4,
      preauth_tat_hours: 2
    }
  },
  
  // Supported Insurance Companies
  insurance_partners: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of insurance company IDs this TPA serves'
  },
  
  // Statistics
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      total_claims_processed: 0,
      claims_this_month: 0,
      avg_processing_days: 0,
      approval_rate: 0
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
  tableName: 'tpas',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['code'], unique: true },
    { fields: ['status'] },
    { fields: ['parent_insurer_id'] },
    { using: 'GIN', fields: ['network_hospitals'] },
    { using: 'GIN', fields: ['insurance_partners'] }
  ]
});

// Static Methods
TPA.findByCode = async function(code) {
  return this.findOne({ where: { code: code.toUpperCase() } });
};

export default TPA;
