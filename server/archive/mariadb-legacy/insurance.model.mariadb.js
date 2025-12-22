import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';
import { encrypt, decrypt } from '../utils/encryption.js';

// Insurance Provider/Company
const InsuranceProvider = sequelize.define('InsuranceProvider', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  code: { type: DataTypes.STRING(50), unique: true }, // e.g., ICICI_LOMBARD
  contactEmail: { type: DataTypes.STRING(150) },
  contactPhone: { type: DataTypes.STRING(20) },
  website: { type: DataTypes.STRING(200) },
  address: { type: DataTypes.TEXT },
  logo: { type: DataTypes.STRING(300) }, // URL to logo
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  supportedServices: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('supportedServices'); return v ? JSON.parse(v) : []; },
    set(val) { this.setDataValue('supportedServices', JSON.stringify(val || [])); }
  }, // e.g., ['hospital', 'pharmacy', 'diagnostic']
  claimProcessDays: { type: DataTypes.INTEGER, defaultValue: 30 },
  networkType: { type: DataTypes.ENUM('TPA', 'Direct', 'Both'), defaultValue: 'Both' },
}, {
  tableName: 'insurance_providers',
  timestamps: true,
  indexes: [{ fields: ['isActive'] }, { fields: ['code'] }]
});

// Insurance Policy/Plan offered by providers
const InsurancePolicy = sequelize.define('InsurancePolicy', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  providerId: { type: DataTypes.INTEGER, allowNull: false },
  policyName: { type: DataTypes.STRING(200), allowNull: false },
  policyNumber: { type: DataTypes.STRING(100), unique: true },
  policyType: { 
    type: DataTypes.ENUM('Individual', 'Family', 'Group', 'Senior', 'Critical'), 
    defaultValue: 'Individual' 
  },
  coverageAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, // Sum insured
  premiumAmount: { type: DataTypes.DECIMAL(10, 2) }, // Annual premium
  
  // Coverage details
  coverageDetails: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('coverageDetails'); return v ? JSON.parse(v) : {}; },
    set(val) { this.setDataValue('coverageDetails', JSON.stringify(val || {})); }
  }, // { hospitalization: true, pharmacy: true, diagnostics: true, ambulance: true }
  
  exclusions: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('exclusions'); return v ? JSON.parse(v) : []; },
    set(val) { this.setDataValue('exclusions', JSON.stringify(val || [])); }
  }, // List of excluded conditions/services
  
  waitingPeriod: { type: DataTypes.INTEGER, defaultValue: 30 }, // Days
  coPaymentPercent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 }, // Co-payment %
  roomRentLimit: { type: DataTypes.DECIMAL(10, 2) }, // Daily room rent limit
  
  validFrom: { type: DataTypes.DATEONLY },
  validTo: { type: DataTypes.DATEONLY },
  
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  description: { type: DataTypes.TEXT },
  termsAndConditions: { type: DataTypes.TEXT },
}, {
  tableName: 'insurance_policies',
  timestamps: true,
  indexes: [
    { fields: ['providerId'] },
    { fields: ['isActive'] },
    { fields: ['policyType'] }
  ]
});

// User's enrolled insurance policy
const UserInsurance = sequelize.define('UserInsurance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  policyId: { type: DataTypes.INTEGER, allowNull: false },
  providerId: { type: DataTypes.INTEGER, allowNull: false },
  
  // User's policy details
  enrollmentNumber: {
    type: DataTypes.TEXT,
    unique: true,
    get() {
      const rawValue = this.getDataValue('enrollmentNumber');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('enrollmentNumber', value);
      } else {
        this.setDataValue('enrollmentNumber', encrypt(value));
      }
    }
  },
  enrollmentDate: { type: DataTypes.DATEONLY, allowNull: false },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: false },
  
  status: { 
    type: DataTypes.ENUM('Active', 'Expired', 'Cancelled', 'Suspended', 'PendingRenewal'), 
    defaultValue: 'Active' 
  },
  
  // Member details
  primaryMemberName: { type: DataTypes.STRING(150) },
  familyMembers: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('familyMembers'); return v ? JSON.parse(v) : []; },
    set(val) { this.setDataValue('familyMembers', JSON.stringify(val || [])); }
  }, // Array of family member objects
  
  // Claim tracking
  claimsUsed: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  claimsCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  
  // Documents
  policyDocumentUrl: { type: DataTypes.STRING(300) },
  cardImageUrl: { type: DataTypes.STRING(300) },
  
  notes: { type: DataTypes.TEXT },
}, {
  tableName: 'user_insurances',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['policyId'] },
    { fields: ['providerId'] },
    { fields: ['status'] },
    { fields: ['enrollmentNumber'] }
  ]
});

// Insurance Claim
const InsuranceClaim = sequelize.define('InsuranceClaim', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userInsuranceId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  
  claimNumber: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  claimDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  claimAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  approvedAmount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  
  claimType: { 
    type: DataTypes.ENUM('Hospitalization', 'Pharmacy', 'Diagnostic', 'Consultation', 'Ambulance', 'Other'), 
    allowNull: false 
  },
  
  status: { 
    type: DataTypes.ENUM('Submitted', 'UnderReview', 'Approved', 'Rejected', 'PartiallyApproved', 'Settled'), 
    defaultValue: 'Submitted' 
  },
  
  // Claim details
  treatmentDate: { type: DataTypes.DATEONLY },
  hospitalName: { type: DataTypes.STRING(200) },
  diagnosis: {
    type: DataTypes.TEXT,
    get() {
      const rawValue = this.getDataValue('diagnosis');
      if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
      try {
        return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
      } catch (e) {
        return rawValue;
      }
    },
    set(value) {
      if (!value || !process.env.ENCRYPTION_KEY) {
        this.setDataValue('diagnosis', value);
      } else {
        this.setDataValue('diagnosis', encrypt(value));
      }
    }
  },
  
  // Documents
  documents: {
    type: DataTypes.TEXT,
    get() { const v = this.getDataValue('documents'); return v ? JSON.parse(v) : []; },
    set(val) { this.setDataValue('documents', JSON.stringify(val || [])); }
  }, // Array of document URLs
  
  rejectionReason: { type: DataTypes.TEXT },
  processingNotes: { type: DataTypes.TEXT },
  
  submittedAt: { type: DataTypes.DATE },
  reviewedAt: { type: DataTypes.DATE },
  settledAt: { type: DataTypes.DATE },
}, {
  tableName: 'insurance_claims',
  timestamps: true,
  indexes: [
    { fields: ['userInsuranceId'] },
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['claimNumber'] }
  ]
});

// Relationships
InsurancePolicy.belongsTo(InsuranceProvider, { foreignKey: 'providerId', as: 'provider' });
InsuranceProvider.hasMany(InsurancePolicy, { foreignKey: 'providerId', as: 'policies' });

UserInsurance.belongsTo(InsuranceProvider, { foreignKey: 'providerId', as: 'provider' });
UserInsurance.belongsTo(InsurancePolicy, { foreignKey: 'policyId', as: 'policy' });

InsuranceClaim.belongsTo(UserInsurance, { foreignKey: 'userInsuranceId', as: 'userInsurance' });

export { InsuranceProvider, InsurancePolicy, UserInsurance, InsuranceClaim };
export default InsuranceProvider;
