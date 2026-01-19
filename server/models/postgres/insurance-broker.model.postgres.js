/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Insurance Broker Entity Model (PostgreSQL)
 * 
 * For insurance brokers/agents:
 * - Policy sales and renewals
 * - Client management
 * - Claims assistance
 * - Commission tracking
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const InsuranceBroker = sequelize.define('InsuranceBroker', {
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
  
  // Broker Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Broker company/individual name'
  },
  
  broker_type: {
    type: DataTypes.ENUM('corporate', 'individual', 'composite', 'reinsurance'),
    defaultValue: 'corporate'
  },
  
  license_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'IRDAI broker license number'
  },
  
  license_valid_until: {
    type: DataTypes.DATE,
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
  office_address: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  
  // Registration Details
  pan: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  
  gst: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  
  // Insurance Partners
  insurance_partners: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of insurance company IDs the broker works with'
  },
  
  preferred_insurers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Top insurance companies by premium'
  },
  
  // Specializations
  specializations: {
    type: DataTypes.JSONB,
    defaultValue: {
      health_insurance: true,
      life_insurance: false,
      motor_insurance: false,
      property_insurance: false,
      marine_insurance: false,
      liability_insurance: false
    }
  },
  
  // Client Portfolio
  client_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  corporate_clients: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of corporate client IDs'
  },
  
  individual_clients: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Count of individual clients'
  },
  
  // Business Metrics
  annual_premium: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: 'Total annual premium handled'
  },
  
  total_policies_active: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  renewal_rate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Renewal rate percentage'
  },
  
  // Commission Configuration
  commission_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      standard_rate: 15,
      health_rate: 15,
      group_rate: 10,
      renewal_rate: 7.5,
      payment_terms: 'monthly'
    }
  },
  
  // Team
  team_members: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of team member user IDs'
  },
  
  team_size: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  
  // Services Offered
  services: {
    type: DataTypes.JSONB,
    defaultValue: {
      policy_comparison: true,
      claims_assistance: true,
      renewal_reminders: true,
      portfolio_review: true,
      risk_assessment: true,
      employee_communication: false
    }
  },
  
  // Principal Officer
  principal_officer: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '{ name, designation, email, phone, posp_code }'
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
  tableName: 'insurance_brokers',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['license_number'] },
    { fields: ['broker_type'] },
    { fields: ['status'] },
    { using: 'GIN', fields: ['insurance_partners'] },
    { using: 'GIN', fields: ['specializations'] }
  ]
});

export default InsuranceBroker;
