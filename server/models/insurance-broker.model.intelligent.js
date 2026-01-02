import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

/**
 * Insurance Broker Model
 * Manages insurance brokers/intermediaries who sell policies
 */
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
    allowNull: false,
    comment: 'Public-facing unique identifier (UUID)'
  },
  brokerName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'broker_name',
    comment: 'Name of the insurance broker/firm'
  },
  contactPersonName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'contact_person_name',
    comment: 'Primary contact person name'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    field: 'phone_number'
  },
  irdaiLicenseNumber: {
    type: DataTypes.STRING(100),
    unique: true,
    field: 'irdai_license_number',
    comment: 'IRDAI broker license number'
  },
  licenseValidityDate: {
    type: DataTypes.DATE,
    field: 'license_validity_date'
  },
  panNumber: {
    type: DataTypes.STRING(10),
    field: 'pan_number'
  },
  gstin: {
    type: DataTypes.STRING(15),
    comment: 'GST Identification Number'
  },
  businessType: {
    type: DataTypes.STRING(50),
    defaultValue: 'individual',
    field: 'business_type',
    comment: 'individual, partnership, corporate'
  },
  officeAddress: {
    type: DataTypes.TEXT,
    field: 'office_address'
  },
  city: {
    type: DataTypes.STRING(100)
  },
  state: {
    type: DataTypes.STRING(100)
  },
  pincode: {
    type: DataTypes.STRING(10)
  },
  commissionPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 10.00,
    field: 'commission_percentage',
    comment: 'Default commission % on policies sold'
  },
  activePoliciesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'active_policies_count'
  },
  totalPremiumFacilitated: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'total_premium_facilitated',
    comment: 'Total premium amount facilitated'
  },
  payoutBankAccount: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'payout_bank_account',
    comment: 'Bank details for commission payout'
  },
  certifications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Professional certifications'
  },
  specializations: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Health, Life, Motor, etc.'
  },
  serviceAreas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'service_areas',
    comment: 'Geographic areas covered'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'active',
    comment: 'active, suspended, inactive'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_verified',
    comment: 'IRDAI verification status'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'insurance_brokers',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Hash password before creating
InsuranceBroker.beforeCreate(async (broker) => {
  if (broker.password) {
    const salt = await bcrypt.genSalt(10);
    broker.password = await bcrypt.hash(broker.password, salt);
  }
});

// Hash password before updating
InsuranceBroker.beforeUpdate(async (broker) => {
  if (broker.changed('password') && broker.password) {
    const salt = await bcrypt.genSalt(10);
    broker.password = await bcrypt.hash(broker.password, salt);
  }
});

// Compare password method
InsuranceBroker.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

export { InsuranceBroker };
export default InsuranceBroker;
