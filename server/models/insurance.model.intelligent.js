import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

// Define InsuranceProvider model - NOW USING POSTGRESQL
const InsuranceProviderModel = sequelize.define('InsuranceProvider', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  uid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, unique: true, allowNull: false, comment: 'Public-facing unique identifier (UUID)' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  code: { type: DataTypes.STRING(50), unique: true },
  logoUrl: { type: DataTypes.STRING(500) },
  contactEmail: { type: DataTypes.STRING(255) },
  contactPhone: { type: DataTypes.STRING(50) },
  website: { type: DataTypes.STRING(500) },
  address: { type: DataTypes.JSONB, defaultValue: {} },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'insurance_providers', timestamps: true });

// Define InsurancePolicy model
const InsurancePolicyModel = sequelize.define('InsurancePolicy', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  providerId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  code: { type: DataTypes.STRING(100) },
  type: { type: DataTypes.STRING(100) },
  coverageAmount: { type: DataTypes.DECIMAL(12, 2) },
  premiumAmount: { type: DataTypes.DECIMAL(10, 2) },
  coverageDetails: { type: DataTypes.JSONB, defaultValue: {} },
  benefits: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  exclusions: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'insurance_policies', timestamps: true });

// Define UserInsurance model
const UserInsuranceModel = sequelize.define('UserInsurance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  policyId: { type: DataTypes.INTEGER, allowNull: false },
  policyNumber: { type: DataTypes.STRING(100) },
  membershipId: { type: DataTypes.STRING(100) },
  startDate: { type: DataTypes.DATEONLY },
  endDate: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING(50), defaultValue: 'active' },
  primaryHolder: { type: DataTypes.BOOLEAN, defaultValue: true },
  dependents: { type: DataTypes.JSONB, defaultValue: [] },
  documents: { type: DataTypes.JSONB, defaultValue: [] },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'user_insurances', timestamps: true });

// Define InsuranceClaim model
const InsuranceClaimModel = sequelize.define('InsuranceClaim', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userInsuranceId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_insurance_id' },
  appointmentId: { type: DataTypes.INTEGER, field: 'appointment_id' },
  claimNumber: { type: DataTypes.STRING(100), unique: true, field: 'claim_number' },
  claimAmount: { type: DataTypes.DECIMAL(10, 2), field: 'claim_amount' },
  approvedAmount: { type: DataTypes.DECIMAL(10, 2), field: 'approved_amount' },
  status: { type: DataTypes.STRING(50), defaultValue: 'pending' },
  submittedAt: { type: DataTypes.DATE, field: 'submitted_at' },
  processedAt: { type: DataTypes.DATE, field: 'processed_at' },
  documents: { type: DataTypes.JSONB, defaultValue: [] },
  notes: { type: DataTypes.TEXT },
  metadata: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'insurance_claims', timestamps: true });

// Wrapper functions
const createWrapper = (Model) => ({
  findOne: async (options) => Model.findOne(options),
  findByPk: async (id, options = {}) => Model.findByPk(id, options),
  create: async (data) => Model.create(data),
  findAll: async (options = {}) => Model.findAll(options),
  update: async (values, options) => Model.update(values, options),
  destroy: async (options) => Model.destroy(options),
  count: async (options = {}) => Model.count(options)
});

const InsuranceProvider = createWrapper(InsuranceProviderModel);
const InsurancePolicy = createWrapper(InsurancePolicyModel);
const UserInsurance = createWrapper(UserInsuranceModel);
const InsuranceClaim = createWrapper(InsuranceClaimModel);

// Raw Sequelize models (needed for Sequelize include/association queries)
export {
  InsuranceProvider,
  InsurancePolicy,
  UserInsurance,
  InsuranceClaim,
  InsuranceProviderModel,
  InsurancePolicyModel,
  UserInsuranceModel,
  InsuranceClaimModel,
};